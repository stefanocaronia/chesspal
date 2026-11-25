// Reading the agent's lines: answers to the table's requests, the agent's own requests, and the session's updates; a line not understood changes nothing.
import { inside } from "../paths.ts";
import { configOption, error, isObject, type Message, result } from "./protocol.ts";
import { askModelAgain } from "./setup.ts";
import { askToStop, type State, tell, type Turn, write } from "./state.ts";

/** One line of the agent: whatever it holds, reading it never throws; what the chat's listener throws its queue takes. */
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
    const hasId = typeof message.id === "number" || typeof message.id === "string";

    if (typeof message.method !== "string") {
        const answered = typeof message.id === "number" ? state.pending.get(message.id) : undefined;

        if (answered !== undefined && typeof message.id === "number") {
            state.pending.delete(message.id);
            answered(message);
        }
    } else if (hasId) {
        readRequest(state, message);
    } else if (message.method === "session/update" && isObject(message.params)) {
        readUpdate(state, message.params);
    }
}

/** The agent asks: a tool's permission is answered by its kind, and for a tool that reads by the paths it asks; anything else is refused, so that it never waits. */
function readRequest(state: State, message: Message): void
{
    const params = isObject(message.params) ? message.params : {};

    if (message.method !== "session/request_permission" || !isObject(params.toolCall)) {
        write(state, error(message.id, -32601, `The table does not handle ${String(message.method)}.`));
        return;
    }

    const call = remember(state.turn, params.toolCall);
    const tool = state.host.toolOf(call);
    const kindAllowed = state.allowed.includes(tool.kind);
    const outside = kindAllowed && tool.kind === "read" ? pathOutside(state, call) : undefined;
    const allowed = kindAllowed && outside === undefined;
    const options = Array.isArray(params.options) ? params.options.filter(isObject) : [];
    const wanted = allowed ? "allow" : "reject";
    const chosen = options.find((option) => option.kind === `${wanted}_once`) ?? options.find((option) => typeof option.kind === "string" && option.kind.startsWith(wanted));
    const outcome = chosen === undefined ? { outcome: "cancelled" } : { outcome: "selected", optionId: chosen.optionId };
    write(state, result(message.id, { outcome }));
    tell(state, { type: "permission", name: tool.name, kind: tool.kind, allowed: allowed && chosen !== undefined });
}

/** The first path a call of kind read asks for outside the chat's folder; a call that shows no input is refused as one outside, since nothing says what it reads. */
function pathOutside(state: State, call: Message): string | undefined
{
    if (!isObject(call.rawInput)) {
        return "a path it did not say";
    }

    const outside = state.host.pathsOf(call).find((path) => typeof path !== "string" || !inside(path, state.folder));
    return outside === undefined ? undefined : String(outside);
}

function readUpdate(state: State, params: Message): void
{
    const update = isObject(params.update) ? params.update : {};

    if (params.sessionId !== undefined && params.sessionId !== state.session) {
        return;
    }

    switch (update.sessionUpdate) {
        case "agent_message_chunk":
            return readText(state, update);
        case "tool_call":
        case "tool_call_update":
            return readToolCall(state, update);
        case "config_option_update":
            return readConfig(state, update);
        default:
            return undefined;
    }
}

/** A piece of the AI's prose: a new block for a new message of the agent, or after a tool. */
function readText(state: State, update: Message): void
{
    const turn = playing(state);
    const content = isObject(update.content) ? update.content : {};

    if (turn === undefined || content.type !== "text" || typeof content.text !== "string" || content.text === "") {
        return;
    }

    const message = typeof update.messageId === "string" ? update.messageId : undefined;

    if (turn.block < 0 || turn.toolSince || (message !== undefined && message !== turn.message)) {
        nextBlock(turn);
    }

    turn.message = message ?? turn.message;
    turn.toolSince = false;
    turn.filled = true;
    tell(state, { type: "text", block: turn.block, text: content.text });
}

/** A tool call and its updates, merged: told started once it runs, then done or failed, with the tools it ran within itself before its own end. */
function readToolCall(state: State, update: Message): void
{
    const turn = playing(state);

    if (turn === undefined || typeof update.toolCallId !== "string" || turn.ended.has(update.toolCallId)) {
        return;
    }

    const id = update.toolCallId;
    const call = remember(turn, update);
    const status = call.status;

    if (status !== "in_progress" && status !== "completed" && status !== "failed") {
        return;
    }

    const tool = turn.started.get(id) ?? state.host.toolOf(call);

    if (!turn.started.has(id)) {
        turn.started.set(id, tool);
        turn.toolSince = true;
        tell(state, { type: "tool", id, name: tool.name, kind: tool.kind, state: "started" });
    }

    if (status === "in_progress") {
        return;
    }

    turn.ended.add(id);

    for (const [index, inner] of state.host.innerTools(call).entries()) {
        const innerId = `${id}/${String(index)}`;
        tell(state, { type: "tool", id: innerId, name: inner.name, kind: inner.kind, state: "started" });
        tell(state, { type: "tool", id: innerId, name: inner.name, kind: inner.kind, state: inner.failed ? "failed" : "done" });
    }

    tell(state, { type: "tool", id, name: tool.name, kind: tool.kind, state: status === "completed" ? "done" : "failed" });
}

/** The agent changed the session's options: another model than the one confirmed fails the turn in course, and is asked again before the next words. */
function readConfig(state: State, update: Message): void
{
    if (!Array.isArray(update.configOptions)) {
        return;
    }

    state.config = update.configOptions;
    const model = configOption(update.configOptions, "model", "model")?.currentValue;

    if (state.model.confirmed === undefined || model === undefined || model === state.model.confirmed) {
        return;
    }

    const turn = playing(state);

    if (turn !== undefined) {
        turn.failure = `the host runs the model ${String(model)} instead of ${state.model.confirmed}`;
        askToStop(state, turn);
    }

    askModelAgain(state);
}

/** What the agent said of a call so far, with what it says now: a field it leaves out keeps its value. */
function remember(turn: Turn | undefined, update: Message): Message
{
    const id = typeof update.toolCallId === "string" ? update.toolCallId : undefined;
    const known = id === undefined ? undefined : turn?.calls.get(id);
    const merged = { ...known, ...Object.fromEntries(Object.entries(update).filter(([, value]) => value !== undefined && value !== null)) };

    if (id !== undefined) {
        turn?.calls.set(id, merged);
    }

    return merged;
}

/** A new block of text, unless the one in course is still empty. */
function nextBlock(turn: Turn): void
{
    if (turn.block < 0 || turn.filled) {
        turn.block += 1;
        turn.filled = false;
    }
}

/** The turn the agent's updates belong to: none between turns, while the player's words wait, nor for a turn failing. */
function playing(state: State): Turn | undefined
{
    const turn = state.turn;
    return turn === undefined || turn.held !== undefined || turn.failure !== undefined ? undefined : turn;
}
