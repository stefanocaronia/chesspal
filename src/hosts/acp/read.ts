// Reading the agent's lines: answers to the table's requests, the agent's own requests, and the session's updates; a line not understood changes nothing.
import type { ToolKind } from "../chat.ts";
import { error, isObject, type Message, result } from "../lines.ts";
import { inside } from "../paths.ts";
import { askToStop, nextBlock, playing, tell, write } from "../state.ts";
import { heardHost } from "./host-turn.ts";
import { pathWords } from "./host.ts";
import { configOption } from "./protocol.ts";
import { askModelAgain } from "./setup.ts";
import type { State, Turn } from "./state.ts";

/** One line of the agent, an object: an answer, a request of the agent's, or an update of the session. */
export function readMessage(state: State, message: Message): void
{
    const hasId = typeof message.id === "number" || typeof message.id === "string";

    if (typeof message.method !== "string") {
        state.requests.answer(message);
    } else if (hasId) {
        readRequest(state, message);
    } else if (message.method === "session/update" && isObject(message.params)) {
        readUpdate(state, message.params);
    }
}

/**
 * The agent asks: a tool's permission is answered by its kind, and for a tool that reads by the paths it asks, always for this once; anything else is
 * refused, so that it never waits. Once the turn is asked to stop, every permission is cancelled, as the protocol wants.
 */
function readRequest(state: State, message: Message): void
{
    const params = isObject(message.params) ? message.params : {};

    if (message.method !== "session/request_permission" || !isObject(params.toolCall)) {
        write(state, error(message.id, -32601, `The table does not handle ${String(message.method)}.`));
        return;
    }

    const turn = state.turn;
    const call = remember(turn, params.toolCall);
    const tool = state.host.toolOf(call, state.session);
    const allowed = turn?.interrupted !== true && mayRun(state, tool, call) === undefined;
    const options = Array.isArray(params.options) ? params.options.filter(isObject) : [];
    // Never an option that lasts beyond this call: with no option for this once, the answer is cancelled.
    const chosen = turn?.interrupted === true ? undefined : options.find((option) => option.kind === (allowed ? "allow_once" : "reject_once"));
    const outcome = chosen === undefined ? { outcome: "cancelled" } : { outcome: "selected", optionId: chosen.optionId };
    write(state, result(message.id, { outcome }));

    if (allowed && chosen !== undefined && typeof call.toolCallId === "string") {
        turn?.approved.add(call.toolCallId);
    }

    tell(state, { type: "permission", name: tool.name, kind: tool.kind, allowed: allowed && chosen !== undefined });
}

/** Why the table does not let the AI use a tool: its kind, or a path it reads outside the chat's folder; undefined where it may. */
function mayRun(state: State, tool: { name: string; kind: ToolKind; }, call: Message): string | undefined
{
    if (!state.allowed.includes(tool.kind)) {
        return `the table does not let the AI use ${tool.name}`;
    }

    const outside = tool.kind === "read" ? pathOutside(state, call) : undefined;
    return outside === undefined ? undefined : `${tool.name} read ${outside}, and the table lets the AI read only the chat's folder`;
}

/** The first path a call of kind read asks for outside the chat's folder; a call that names none is refused as one outside, since nothing says what it reads. */
function pathOutside(state: State, call: Message): string | undefined
{
    const paths = state.host.pathsOf(call);

    if (paths.length === 0) {
        return "a path it did not say";
    }

    const outside = paths.find((path) => typeof path !== "string" || !inside(path, state.folder));
    return outside === undefined ? undefined : pathWords(outside);
}

function readUpdate(state: State, params: Message): void
{
    const update = isObject(params.update) ? params.update : {};

    if (params.sessionId !== undefined && params.sessionId !== state.session) {
        return;
    }

    const child = state.host.childOf?.(update);
    heardHost(state, update, child);

    if (child !== undefined) {
        return readChild(state, child, update);
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

    const tool = turn.started.get(id) ?? state.host.toolOf(call, state.session);

    if (!turn.started.has(id)) {
        turn.started.set(id, tool);
        turn.toolSince = true;
        tell(state, { type: "tool", id, name: tool.name, kind: tool.kind, state: "started" });
    }

    if (status === "in_progress") {
        return;
    }

    turn.ended.add(id);
    const inners = state.host.innerTools(call);

    for (const [index, inner] of inners.entries()) {
        const innerId = `${id}/${String(index)}`;
        tell(state, { type: "tool", id: innerId, name: inner.name, kind: inner.kind, state: "started" });
        tell(state, { type: "tool", id: innerId, name: inner.name, kind: inner.kind, state: inner.failed ? "failed" : "done" });
    }

    tell(state, { type: "tool", id, name: tool.name, kind: tool.kind, state: status === "completed" ? "done" : "failed" });

    if (status === "completed") {
        ranUnasked(state, turn, id, call, inners);
        const child = tool.kind === "agent" && state.allowed.includes("agent") ? state.host.childStarted?.(call) : undefined;

        if (child !== undefined) {
            state.children.add(child);
        }
    }
}

/**
 * An update of a subagent's session: its words are never the AI's prose, nor its tools the AI's; a tool it ran is held to the AI's limits, and a
 * session that no subagent the table allows started, nor one starting, stops the turn.
 */
function readChild(state: State, child: string, update: Message): void
{
    const turn = playing(state);

    if (turn === undefined) {
        return;
    }

    const starting = [...turn.started].some(([id, tool]) => tool.kind === "agent" && !turn.ended.has(id));

    if (!state.children.has(child) && !(starting && state.allowed.includes("agent"))) {
        turn.failure = "the host ran a subagent the table did not let the AI start";
        askToStop(state, turn);
        return;
    }

    const id = update.toolCallId;

    if ((update.sessionUpdate !== "tool_call" && update.sessionUpdate !== "tool_call_update") || typeof id !== "string" || turn.ended.has(id)) {
        return;
    }

    const call = remember(turn, update);

    if (call.status === "completed") {
        turn.ended.add(id);
        ranUnasked(state, turn, id, call, state.host.innerTools(call));
    }
}

/** A call that ran, which the table does not let the AI use and never allowed, or a tool it ran within itself that the table does not allow, stops the turn, which fails saying so. */
function ranUnasked(state: State, turn: Turn, id: string, call: Message, inners: { name: string; kind: ToolKind; failed: boolean; }[]): void
{
    const ranInner = inners.find((inner) => !inner.failed && !state.allowed.includes(inner.kind));
    const why = (ranInner === undefined ? undefined : `the table does not let the AI use ${ranInner.name}`) ?? (turn.approved.has(id) ? undefined : mayRun(state, state.host.toolOf(call, state.session), call));

    if (why !== undefined) {
        turn.failure = `the host ran a tool without asking: ${why}`;
        askToStop(state, turn);
    }
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

/** What the agent said of a call so far, with what it says now: a field it leaves out keeps its value, and its input and places are only ever added to. */
function remember(turn: Turn | undefined, update: Message): Message
{
    const id = typeof update.toolCallId === "string" ? update.toolCallId : undefined;
    const known = id === undefined ? undefined : turn?.calls.get(id);
    const said = Object.fromEntries(Object.entries(update).filter(([, value]) => value !== undefined && value !== null));
    const merged: Message = { ...known, ...said };

    if (isObject(known?.rawInput) && isObject(said.rawInput)) {
        merged.rawInput = { ...known.rawInput, ...said.rawInput };
    }

    if (Array.isArray(known?.locations) && Array.isArray(said.locations)) {
        merged.locations = [...known.locations, ...said.locations];
    }

    if (id !== undefined) {
        turn?.calls.set(id, merged);
    }

    return merged;
}
