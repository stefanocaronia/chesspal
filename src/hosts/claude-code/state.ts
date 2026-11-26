// The chat's state as Claude Code's driver keeps it, beside what every driver keeps: the model asked and confirmed, the requests' ids, the turn.
import type { ToolKind } from "../chat.ts";
import { chatReady, type ChatState, refused, type Turn as SharedTurn, write } from "../state.ts";
import { controlRequest, userMessage } from "./protocol.ts";

// How long the host may take to confirm the model.
const modelWait = 30_000;

export interface State extends ChatState<Turn>
{
    requests: number;
    /** The name of the server whose tools are the table's commands, and the effort the chat was started with. */
    server: string;
    effort?: string;
    /** The model asked, the request that asked it, and the model the host confirmed. */
    model: { asked: string; request: string; confirmed?: string; };
}

/** A turn: the host's messages and tools in it. */
export interface Turn extends SharedTurn
{
    /** The id of the host's message being streamed, the ids of those whose text came in pieces, the whole texts told. */
    message?: string;
    streamed: Set<string>;
    told: Set<string>;
    /** The tools started, with why the table would not let the AI use one, and those ended. */
    tools: Map<string, { name: string; kind: ToolKind; refused?: string; }>;
    ended: Set<string>;
    /** The input of the last request the host made in the turn, as its message's start says it, the cache's counted. */
    lastRequest?: number;
}

export function newTurn(): Turn
{
    return { block: -1, filled: false, streamed: new Set(), told: new Set(), tools: new Map(), ended: new Set(), interrupted: false };
}

/** Asks the host for the model; the player's words wait for its answer. */
export function askModel(state: State): void
{
    state.model.request = nextRequest(state);
    write(state, controlRequest(state.model.request, { subtype: "set_model", model: state.model.asked }));
    state.cancelReadyWait = state.later(modelWait, () => modelRefused(state, `the host did not confirm the model ${state.model.asked} within ${String(modelWait / 1000)} seconds`));
}

export function modelConfirmed(state: State, model: string): void
{
    state.model.confirmed = model;
    chatReady(state);
}

/** The chat cannot play, unless the model is confirmed already: the turn held ends failed, and the chat ends with its process. */
export function modelRefused(state: State, why: string): void
{
    if (state.model.confirmed === undefined) {
        refused(state, why);
    }
}

/** Writes the player's words. */
export function writeWords(state: State, turn: Turn, text: string): void
{
    write(state, userMessage(text));
    turn.held = undefined;
}

/** Asks the host to stop the turn in course. */
export function writeStop(state: State): void
{
    write(state, controlRequest(nextRequest(state), { subtype: "interrupt" }));
}

/** Request ids unique in the chat. */
function nextRequest(state: State): string
{
    state.requests += 1;
    return `table-${String(state.requests)}`;
}
