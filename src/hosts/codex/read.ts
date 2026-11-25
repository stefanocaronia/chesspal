// Reading Codex's lines: answers to the table's requests, Codex's own requests, and the thread's notifications; a line not understood changes nothing.
import { inside } from "../paths.ts";
import { error, isObject, type Message, result } from "./protocol.ts";
import { turnCompleted } from "./setup.ts";
import { askToStop, sendInterrupt, type State, tell, type Turn, write } from "./state.ts";
import { approvalAnswer, type CodexTool, toolOfItem, toolOfRequest } from "./tools.ts";

/** One line of Codex: whatever it holds, reading it never throws; what the chat's listener throws its queue takes. */
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
        readRequest(state, message.method, message.id, isObject(message.params) ? message.params : {});
    } else if (isObject(message.params) && (state.thread === undefined || message.params.threadId === state.thread)) {
        readNotification(state, message.method, message.params);
    } else if (isObject(message.params) && (message.method === "item/started" || message.method === "item/completed")) {
        // An item of another thread, a subagent's: never the AI's prose nor its tools, but held to its limits.
        readItem(state, message.params.item, message.method === "item/completed", false);
    }
}

/** Codex asks: a tool's approval is answered by its kind, and for a tool that reads by the paths it asks; anything else is refused, so that it never waits. */
function readRequest(state: State, method: string, id: unknown, params: Message): void
{
    const turn = playing(state);
    const asked = toolOfRequest(method, params);

    if (asked === undefined) {
        // A form of an MCP server the table cannot show, as a question to the player, is cancelled; any other request is not handled.
        write(state, method === "mcpServer/elicitation/request" ? result(id, { action: "cancel", content: null, _meta: null }) : error(id, -32601, `The table does not handle ${method}.`));
        return;
    }

    // An MCP server's approval names no tool: it is the one of that server running.
    const running = asked.server === undefined ? undefined : runningTool(turn, asked.server);
    const tool = running?.tool ?? asked;
    const item = typeof params.itemId === "string" ? params.itemId : running?.id;
    const outside = state.allowed.includes(tool.kind) && tool.kind === "read" ? pathOutside(state, tool) : undefined;
    const allowed = state.allowed.includes(tool.kind) && outside === undefined;
    const refusal = outside === undefined
        ? `The table does not let the AI use ${tool.name}: it plays with Chesspal's commands.`
        : `The table lets the AI read only the chat's folder: ${tool.name} asked for ${outside}.`;
    write(state, result(id, approvalAnswer(method, tool, allowed, refusal)));

    if (allowed && item !== undefined) {
        turn?.approved.add(item);
    }

    tell(state, { type: "permission", name: tool.name, kind: tool.kind, allowed });
}

function readNotification(state: State, method: string, params: Message): void
{
    switch (method) {
        case "item/agentMessage/delta":
            return readDelta(state, params);
        case "item/started":
            return readItem(state, params.item, false);
        case "item/completed":
            return readItem(state, params.item, true);
        case "turn/started":
            return readTurnStarted(state, params);
        case "turn/completed":
            return turnCompleted(state, params);
        case "thread/settings/updated":
            return readSettings(state, isObject(params.threadSettings) ? params.threadSettings : {});
        case "model/rerouted":
            return readModel(state, params.toModel, undefined);
        default:
            return undefined;
    }
}

/** A piece of the AI's prose: a new block for a new message, or after a tool. */
function readDelta(state: State, params: Message): void
{
    const turn = playing(state);

    if (turn === undefined || typeof params.itemId !== "string" || typeof params.delta !== "string" || params.delta === "") {
        return;
    }

    tellText(state, turn, params.itemId, params.delta);
}

/**
 * An item of the turn: a message of the AI, whose whole text is told only where none of it came in pieces; or a tool, told started, then done or
 * failed. An item of a subagent's thread, not `own`, is never told: only its tools' ends are held to the table's limits.
 */
function readItem(state: State, item: unknown, completed: boolean, own = true): void
{
    const turn = playing(state);

    if (turn === undefined || !isObject(item) || typeof item.id !== "string") {
        return;
    }

    if (item.type === "agentMessage") {
        if (own && completed && typeof item.text === "string" && item.text !== "" && !turn.told.has(item.id)) {
            tellText(state, turn, item.id, item.text);
        }

        return;
    }

    const id = item.id;
    const tool = turn.tools.get(id) ?? toolOfItem(item);

    if (tool === undefined || turn.ended.has(id)) {
        return;
    }

    if (!turn.tools.has(id)) {
        turn.tools.set(id, tool);

        if (own) {
            turn.toolSince = true;
            tell(state, { type: "tool", id, name: tool.name, kind: tool.kind, state: "started" });
        }
    }

    if (completed) {
        toolEnded(state, turn, id, tool, itemRan(item), own);
    }
}

/** Whether a tool's item ended having run: a picture's status is Codex's own words, and only its failure says it did not. */
function itemRan(item: Message): boolean
{
    if (item.type === "imageGeneration") {
        return item.failure === undefined || item.failure === null;
    }

    return item.status === undefined || item.status === "completed";
}

/** A tool's end, told where it is the AI's own; one that ran, which the table does not allow and was never asked, stops the turn, which fails saying so. */
function toolEnded(state: State, turn: Turn, id: string, tool: CodexTool, ran: boolean, own: boolean): void
{
    turn.ended.add(id);

    if (own) {
        tell(state, { type: "tool", id, name: tool.name, kind: tool.kind, state: ran ? "done" : "failed" });
    }

    const mayUse = state.allowed.includes(tool.kind) && (tool.kind !== "read" || pathOutside(state, tool) === undefined);

    if (ran && !mayUse && !turn.approved.has(id) && turn.failure === undefined) {
        const outside = state.allowed.includes(tool.kind) ? pathOutside(state, tool) : undefined;
        turn.failure = outside === undefined
            ? `the host ran a tool without asking: the table does not let the AI use ${tool.name}`
            : `the host ran a tool without asking: ${tool.name} read ${outside}, and the table lets the AI read only the chat's folder`;
        askToStop(state, turn);
    }
}

/** Codex names the turn as it starts it: a stop asked before is told now. */
function readTurnStarted(state: State, params: Message): void
{
    const turn = state.turn;
    const started = isObject(params.turn) ? params.turn.id : undefined;

    if (turn !== undefined && turn.held === undefined && turn.id === undefined && typeof started === "string") {
        turn.id = started;
        sendInterrupt(state, turn);
    }
}

/** The thread's settings changed: another model or effort than those confirmed fails the turn in course. */
function readSettings(state: State, settings: Message): void
{
    readModel(state, settings.model, settings.effort);
}

function readModel(state: State, model: unknown, effort: unknown): void
{
    const turn = playing(state);
    const { confirmed, effort: asked } = state.model;

    if (turn === undefined || confirmed === undefined) {
        return;
    }

    if (typeof model === "string" && model !== confirmed) {
        turn.failure = `the host runs the model ${model} instead of ${confirmed}`;
        askToStop(state, turn);
    } else if (asked !== undefined && typeof effort === "string" && effort !== asked) {
        turn.failure = `the host runs the effort ${effort} instead of ${asked}`;
        askToStop(state, turn);
    }
}

/** Tells a piece of a message, in a new block where the message is another or a tool came since. */
function tellText(state: State, turn: Turn, message: string, text: string): void
{
    if (turn.block < 0 || turn.toolSince || message !== turn.message) {
        nextBlock(turn);
    }

    turn.message = message;
    turn.toolSince = false;
    turn.filled = true;
    turn.told.add(message);
    tell(state, { type: "text", block: turn.block, text });
}

/** The tool of an MCP server started last in the turn and not ended yet. */
function runningTool(turn: Turn | undefined, server: string): { id: string; tool: CodexTool; } | undefined
{
    const running = [...(turn?.tools.entries() ?? [])].filter(([id, tool]) => tool.server === server && !turn?.ended.has(id));
    const last = running.at(-1);
    return last === undefined ? undefined : { id: last[0], tool: last[1] };
}

/** The first path a tool of kind read asks for outside the chat's folder. */
function pathOutside(state: State, tool: CodexTool): string | undefined
{
    const outside = tool.paths.find((path) => typeof path !== "string" || !inside(path, state.folder));
    return outside === undefined ? undefined : String(outside);
}

/** A new block of text, unless the one in course is still empty. */
function nextBlock(turn: Turn): void
{
    if (turn.block < 0 || turn.filled) {
        turn.block += 1;
        turn.filled = false;
    }
}

/** The turn Codex's notifications belong to: none between turns, while the player's words wait, nor for a turn failing. */
function playing(state: State): Turn | undefined
{
    const turn = state.turn;
    return turn === undefined || turn.held !== undefined || turn.failure !== undefined ? undefined : turn;
}
