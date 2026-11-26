// Reading Claude Code's lines: one function per type of message; a line not understood changes nothing.
import type { ToolKind, TurnUsage } from "../chat.ts";
import { isObject, type Message } from "../lines.ts";
import { askToStop, endTurn, nextBlock, playing, refused, tell, write } from "../state.ts";
import { pathOutside } from "./paths.ts";
import { controlAnswer, controlError, toolLoaders, toolOf } from "./protocol.ts";
import { changeRefused, effortRefused, modelConfirmed, modelReady, modelRefused, type State, type Turn } from "./state.ts";

// What the table says where Claude Code is not signed in, as it answers a turn with a message of its own instead of the model's.
const notSignedIn = "Claude Code is not signed in on this computer: sign in to Claude Code, then open the chat again";
const authenticationFailed = "authentication_failed";

/** One line of the host, an object: one function per type of message. */
export function readMessage(state: State, message: Message): void
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

    const tool = toolOf(request.tool_name, request.input, state.server);
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

/** The host answers the table: only the model's and the effort's answers matter; the interrupt's is told by the turn's result. */
function readControlResponse(state: State, message: Message): void
{
    const response = isObject(message.response) ? message.response : {};

    if (state.model.effortRequest !== undefined && response.request_id === state.model.effortRequest) {
        if (response.subtype === "success") {
            modelReady(state);
        } else {
            effortRefused(state, `the host did not take the effort ${String(state.model.effort)}: ${typeof response.error === "string" ? response.error : "it gave no reason"}`);
        }

        return;
    }

    if (response.request_id !== state.model.request || state.model.confirmed !== undefined) {
        return;
    }

    const asked = state.model.asked;
    const answered = isObject(response.response) ? response.response.model : undefined;
    const before = state.model.before?.confirmed;

    if (response.subtype !== "success") {
        changeRefused(state, `the host did not take the model ${asked}: ${typeof response.error === "string" ? response.error : "it gave no reason"}`);
    } else if (typeof answered === "string" && (answered === asked || answered.includes(asked))) {
        modelConfirmed(state, answered);
    } else if (typeof answered === "string" && answered === before) {
        // The host stayed on the model it ran: the change was not taken, and the chat goes on with it.
        changeRefused(state, `the host was asked for the model ${asked} and stayed on ${answered}`);
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
        tell(state, { type: "session", session, model, ...(state.effort === undefined ? {} : { effort: state.effort }) });
    }
}

/** The AI's prose in pieces: a new block of text, then its deltas. */
function readStreamEvent(state: State, message: Message): void
{
    const turn = aiTurn(state, message);
    const event = isObject(message.event) ? message.event : undefined;

    if (turn === undefined || event === undefined) {
        return;
    }

    if (event.type === "message_start" && isObject(event.message) && typeof event.message.id === "string") {
        turn.message = event.message.id;

        if (isObject(event.message.usage)) {
            turn.lastRequest = inputOf(event.message.usage);
        }
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

/**
 * A whole message of the AI: its tools start; its text is told only when none of it came in pieces. A message the host writes itself as the player is
 * not signed in is never the AI's words: the chat ends, saying so.
 */
function readAssistant(state: State, message: Message): void
{
    const turn = aiTurn(state, message);
    const body = isObject(message.message) ? message.message : undefined;

    if (turn !== undefined && message.error === authenticationFailed) {
        refused(state, notSignedIn, "signin");
        return;
    }

    if (turn === undefined || body === undefined || !Array.isArray(body.content)) {
        return;
    }

    // An error of the API the host words itself, as a limit of use reached: the turn fails with its words, once, and they are never the AI's.
    if (message.is_api_error_message === true) {
        const said = body.content.filter(isObject).flatMap((block) => (block.type === "text" && typeof block.text === "string" ? [block.text] : [])).join(" ").trim();
        turn.failure ??= said === "" ? `the host's model failed: ${String(message.error)}` : said;
        return;
    }

    const id = typeof body.id === "string" ? body.id : undefined;

    for (const block of body.content.filter(isObject)) {
        if (block.type === "tool_use" && typeof block.id === "string" && typeof block.name === "string" && !turn.tools.has(block.id)) {
            const tool = toolOf(block.name, block.input, state.server);
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
    const turn = aiTurn(state, message);
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

    const usage = usageOf(message, turn.lastRequest);

    if (turn.failure !== undefined) {
        endTurn(state, "failed", turn.failure, usage);
    } else if (turn.interrupted) {
        endTurn(state, "interrupted", undefined, usage);
    } else if (message.subtype === "success" && message.is_error !== true) {
        endTurn(state, "done", undefined, usage);
    } else {
        endTurn(state, "failed", typeof message.result === "string" && message.result.trim() !== "" ? message.result : String(message.subtype), usage);
    }
}

/**
 * The turn's tokens as its result reports them, summed over its requests, the cache's written and read counted in the input; and the input of its last
 * request, the last of `iterations`, else the last the stream showed (`lastRequest`). A turn interrupted reports all zeros in its usage: its tokens are
 * then those used since the last result, by model. Undefined where it reports none.
 */
function usageOf(result: Message, lastRequest: number | undefined): TurnUsage | undefined
{
    const { usage } = result;

    if (!isObject(usage) || typeof usage.input_tokens !== "number" || typeof usage.output_tokens !== "number") {
        return undefined;
    }

    const last = Array.isArray(usage.iterations) ? usage.iterations.at(-1) : undefined;
    const context = isObject(last) && typeof last.input_tokens === "number" ? inputOf(last) : lastRequest;
    const counted = inputOf(usage) + usage.output_tokens > 0 ? { input: inputOf(usage), output: usage.output_tokens } : usageSinceLastResult(result.model_usage_since_last_result);
    return { ...counted, ...(context === undefined ? {} : { context }) };
}

/** The tokens Claude Code counts by model since its last result, summed, the cache's counted in the input: zeros where it gives none. */
function usageSinceLastResult(byModel: unknown): { input: number; output: number; }
{
    const count = (field: unknown): number => (typeof field === "number" ? field : 0);
    const sum = { input: 0, output: 0 };

    for (const model of isObject(byModel) ? Object.values(byModel).filter(isObject) : []) {
        sum.input += count(model.inputTokens) + count(model.cacheCreationInputTokens) + count(model.cacheReadInputTokens);
        sum.output += count(model.outputTokens);
    }

    return sum;
}

/** A request's input tokens, the cache's written and read counted. */
function inputOf(usage: Record<string, unknown>): number
{
    const count = (field: unknown): number => (typeof field === "number" ? field : 0);
    return count(usage.input_tokens) + count(usage.cache_creation_input_tokens) + count(usage.cache_read_input_tokens);
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

/** The turn a message of the AI belongs to: none between turns, for a turn failing, or for a subagent's message. */
function aiTurn(state: State, message: Message): Turn | undefined
{
    const subagent = message.parent_tool_use_id !== undefined && message.parent_tool_use_id !== null;
    return subagent ? undefined : playing(state);
}
