// Reading Claude Code's lines: one function per type of message; a line not understood changes nothing.
import type { ToolKind } from "../chat.ts";
import { pathOutside } from "./paths.ts";
import { controlAnswer, controlError, isObject, type Message, toolLoaders, toolOf } from "./protocol.ts";
import { askToStop, endTurn, modelConfirmed, modelRefused, type State, tell, type Turn, write } from "./state.ts";

/** One line of the host: whatever it holds, reading it never throws; what the chat's listener throws its queue takes. */
export function readLine(state: State, line: string): void
{
    if (state.closed || state.ended) {
        return;
    }

    try {
        const message: unknown = JSON.parse(line);

        if (isObject(message)) {
            readMessage(state, message);
        }
    } catch {
        // Not JSON, or a shape that broke the reading: ignored.
    }
}

function readMessage(state: State, message: Message): void
{
    switch (message.type) {
        case "control_request":
            return readControlRequest(state, message);
        case "control_response":
            return readControlResponse(state, message);
        case "system":
            return readSystem(state, message);
        case "stream_event":
            return readStreamEvent(state, message);
        case "assistant":
            return readAssistant(state, message);
        case "user":
            return readToolResults(state, message);
        case "result":
            return readResult(state, message);
        default:
            return undefined;
    }
}

/** The host asks: a tool's permission is answered by its kind, and for a tool that reads by the paths it asks; anything else is refused, so that the host never waits. */
function readControlRequest(state: State, message: Message): void
{
    const id = message.request_id;
    const request = isObject(message.request) ? message.request : {};

    // A request with no id can get no answer.
    if (typeof id !== "string") {
        return;
    }

    if (request.subtype !== "can_use_tool" || typeof request.tool_name !== "string") {
        write(state, controlError(id, `The table does not handle ${String(request.subtype)}.`));
        return;
    }

    const tool = toolOf(request.tool_name, request.input);
    const kindAllowed = state.allowed.includes(tool.kind);
    const outside = kindAllowed && tool.kind === "read" ? pathOutside(request.tool_name, request.input, state.folder) : undefined;
    const allowed = kindAllowed && outside === undefined;
    const refused = outside === undefined
        ? `The table does not let the AI use ${request.tool_name}: it plays with Chesspal's commands.`
        : `The table lets the AI read only the chat's folder: ${request.tool_name} asked for ${outside}.`;
    const answer = allowed ? { behavior: "allow", updatedInput: request.input } : { behavior: "deny", message: refused };
    write(state, controlAnswer(id, answer));
    tell(state, { type: "permission", name: tool.name, kind: tool.kind, allowed });
}

/** The host answers the table: only the model's answer matters; the interrupt's is told by the turn's result. */
function readControlResponse(state: State, message: Message): void
{
    const response = isObject(message.response) ? message.response : {};

    if (response.request_id !== state.model.request || state.model.confirmed !== undefined) {
        return;
    }

    const asked = state.model.asked;
    const answered = isObject(response.response) ? response.response.model : undefined;

    if (response.subtype !== "success") {
        modelRefused(state, `the host did not take the model ${asked}: ${typeof response.error === "string" ? response.error : "it gave no reason"}`);
    } else if (typeof answered === "string" && (answered === asked || answered.includes(asked))) {
        modelConfirmed(state, answered);
    } else {
        modelRefused(state, `the host was asked for the model ${asked} and runs ${typeof answered === "string" ? answered : "another, unnamed"}`);
    }
}

/** A turn's start names the session and the model: another model than the one confirmed stops the turn. */
function readSystem(state: State, message: Message): void
{
    const turn = state.turn;

    if (message.subtype !== "init" || turn === undefined || turn.held !== undefined || turn.failure !== undefined) {
        return;
    }

    const model = message.model;
    const session = message.session_id;

    // The same model may be named with a suffix here and without it in the answer, as for a longer context: one name within the other is the same model.
    if (typeof model !== "string" || model === "" || state.model.confirmed === undefined || !(model.includes(state.model.confirmed) || state.model.confirmed.includes(model))) {
        turn.failure = `the host runs the model ${String(model)} instead of ${String(state.model.confirmed)}`;
        askToStop(state, turn);
        return;
    }

    if (typeof session === "string" && (state.told?.session !== session || state.told.model !== model)) {
        state.told = { session, model };
        tell(state, { type: "session", session, model });
    }
}

/** The AI's prose in pieces: a new block of text, then its deltas. */
function readStreamEvent(state: State, message: Message): void
{
    const turn = playing(state, message);
    const event = isObject(message.event) ? message.event : undefined;

    if (turn === undefined || event === undefined) {
        return;
    }

    if (event.type === "message_start" && isObject(event.message) && typeof event.message.id === "string") {
        turn.message = event.message.id;
    } else if (event.type === "content_block_start" && isObject(event.content_block) && event.content_block.type === "text") {
        nextBlock(turn);
    } else if (event.type === "content_block_delta" && isObject(event.delta) && event.delta.type === "text_delta" && typeof event.delta.text === "string" && event.delta.text !== "") {
        const id = typeof message.api_message_id === "string" ? message.api_message_id : turn.message;

        if (id !== undefined) {
            turn.streamed.add(id);
        }

        if (turn.block < 0) {
            nextBlock(turn);
        }

        turn.filled = true;
        tell(state, { type: "text", block: turn.block, text: event.delta.text });
    }
}

/** A whole message of the AI: its tools start; its text is told only when none of it came in pieces. */
function readAssistant(state: State, message: Message): void
{
    const turn = playing(state, message);
    const body = isObject(message.message) ? message.message : undefined;

    if (turn === undefined || body === undefined || !Array.isArray(body.content)) {
        return;
    }

    const id = typeof body.id === "string" ? body.id : undefined;

    for (const block of body.content.filter(isObject)) {
        if (block.type === "tool_use" && typeof block.id === "string" && typeof block.name === "string" && !turn.tools.has(block.id)) {
            const tool = toolOf(block.name, block.input);
            const refused = refusal(state, block.name, tool.kind, block.input);
            turn.tools.set(block.id, refused === undefined ? tool : { ...tool, refused });
            tell(state, { type: "tool", id: block.id, name: tool.name, kind: tool.kind, state: "started" });
        } else if (block.type === "text" && typeof block.text === "string") {
            tellWholeText(state, turn, id, block.text);
        }
    }
}

/** The results of the AI's tools: done, or failed. One that ran, which the table does not let the AI use, stops the turn, which fails saying so. */
function readToolResults(state: State, message: Message): void
{
    const turn = playing(state, message);
    const content = isObject(message.message) ? message.message.content : undefined;

    if (turn === undefined || !Array.isArray(content)) {
        return;
    }

    for (const block of content.filter(isObject)) {
        const id = block.tool_use_id;

        const tool = typeof id === "string" ? turn.tools.get(id) : undefined;

        if (block.type === "tool_result" && typeof id === "string" && tool !== undefined && !turn.ended.has(id)) {
            turn.ended.add(id);
            tell(state, { type: "tool", id, name: tool.name, kind: tool.kind, state: block.is_error === true ? "failed" : "done" });

            if (block.is_error !== true && tool.refused !== undefined && turn.failure === undefined) {
                turn.failure = `the host ran a tool without asking: ${tool.refused}`;
                askToStop(state, turn);
            }
        }
    }
}

/** Why the table does not let the AI use a tool: its kind, or a path it reads outside the chat's folder; undefined where it may, or the tool only loads others. */
function refusal(state: State, name: string, kind: ToolKind, input: unknown): string | undefined
{
    if (toolLoaders.includes(name)) {
        return undefined;
    }

    if (!state.allowed.includes(kind)) {
        return `the table does not let the AI use ${name}`;
    }

    const outside = kind === "read" ? pathOutside(name, input, state.folder) : undefined;
    return outside === undefined ? undefined : `${name} read ${outside}, and the table lets the AI read only the chat's folder`;
}

/** The turn's end: done, interrupted when the table asked it, else failed with the host's words. */
function readResult(state: State, message: Message): void
{
    const turn = state.turn;

    if (turn === undefined || turn.held !== undefined) {
        return;
    }

    if (turn.failure !== undefined) {
        endTurn(state, "failed", turn.failure);
    } else if (turn.interrupted) {
        endTurn(state, "interrupted");
    } else if (message.subtype === "success" && message.is_error !== true) {
        endTurn(state, "done");
    } else {
        endTurn(state, "failed", typeof message.result === "string" && message.result.trim() !== "" ? message.result : String(message.subtype));
    }
}

function tellWholeText(state: State, turn: Turn, id: string | undefined, text: string): void
{
    const key = `${id ?? ""}\n${text}`;

    if (text === "" || (id !== undefined && turn.streamed.has(id)) || turn.told.has(key)) {
        return;
    }

    turn.told.add(key);
    nextBlock(turn);
    turn.filled = true;
    tell(state, { type: "text", block: turn.block, text });
}

/** A new block of text, unless the one in course is still empty. */
function nextBlock(turn: Turn): void
{
    if (turn.block < 0 || turn.filled) {
        turn.block += 1;
        turn.filled = false;
    }
}

/** The turn a message of the AI belongs to: none between turns, for a turn failing, or for a subagent's message. */
function playing(state: State, message: Message): Turn | undefined
{
    const turn = state.turn;
    const subagent = message.parent_tool_use_id !== undefined && message.parent_tool_use_id !== null;
    return turn === undefined || turn.held !== undefined || turn.failure !== undefined || subagent ? undefined : turn;
}
