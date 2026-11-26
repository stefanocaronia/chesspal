// The chat's state as Claude Code's driver keeps it, beside what every driver keeps: the model asked and confirmed, the requests' ids, the turn.
import type { ToolKind } from "../chat.ts";
import { chatReady, type ChatState, modelChanged, refused, tell, type Turn as SharedTurn, write } from "../state.ts";
import { controlRequest, userMessage } from "./protocol.ts";

// How long the host may take to confirm the model.
const modelWait = 30_000;

export interface State extends ChatState<Turn>
{
    requests: number;
    /** The name of the server whose tools are the table's commands. */
    server: string;
    /**
     * The model asked, the request that asked it, and the model the host confirmed; for another model asked in an open chat, the effort asked with it and
     * the request that sets it.
     */
    model: { asked: string; request: string; confirmed?: string; effort?: string; effortRequest?: string; before?: Running; };
    /** The effort the host runs, as the table set it, the chat started with it: none, the host's own. */
    effort?: string;
}

/** The model the host ran before another was asked in the open chat: as the table named it, as the host did, and its effort. */
interface Running
{
    asked: string;
    confirmed?: string;
    effort?: string;
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

/** The host took the model: the chat is ready, once it took the effort asked with it, if any. */
export function modelConfirmed(state: State, model: string): void
{
    state.model.confirmed = model;
    const effort = state.model.effort;

    if (effort === undefined) {
        modelReady(state);
        return;
    }

    state.model.effortRequest = nextRequest(state);
    write(state, controlRequest(state.model.effortRequest, { subtype: "apply_flag_settings", settings: { effortLevel: effort } }));
}

/** The host took the effort asked with another model: the chat is ready. */
export function modelReady(state: State): void
{
    const changed = state.model.before !== undefined;
    state.model.effortRequest = undefined;
    state.model.before = undefined;
    state.effort = state.model.effort ?? state.effort;
    chatReady(state);
    modelChanged(state, state.model.confirmed ?? state.model.asked, undefined, changed ? state.model.asked : undefined);
}

/** Another model asked in an open chat, and the effort where given: the player's next words wait until the host confirms them. */
export function changeModel(state: State, model: string, effort: string | undefined): void
{
    state.ready = false;
    const before = { asked: state.model.asked, ...(state.model.confirmed === undefined ? {} : { confirmed: state.model.confirmed }), ...(state.effort === undefined ? {} : { effort: state.effort }) };
    state.model = { asked: model, request: "", ...(effort === undefined ? {} : { effort }), before };
    askModel(state);
}

/**
 * The host answered another model asked in the open chat with an error: the chat goes on with the model it ran before, and the table is told. Asked at the
 * opening, or once the host ran a model of its own, the chat cannot play.
 */
export function changeRefused(state: State, why: string): void
{
    const before = state.model.before;

    if (before === undefined || state.ready) {
        modelRefused(state, why);
        return;
    }

    const asked = state.model.asked;
    state.model = { asked: before.asked, request: "", ...(before.confirmed === undefined ? {} : { confirmed: before.confirmed }) };
    tell(state, { type: "changeRefused", asked, model: before.asked, ...(before.effort === undefined ? {} : { effort: before.effort }), why });
    chatReady(state);
}

/** The host took another model asked in the open chat, not the effort asked with it: the chat goes on with that model and the effort it ran before. */
export function effortRefused(state: State, why: string): void
{
    if (state.model.before === undefined) {
        modelRefused(state, why);
        return;
    }

    const asked = state.model.asked;
    state.model.effort = undefined;
    tell(state, { type: "changeRefused", asked, model: asked, ...(state.effort === undefined ? {} : { effort: state.effort }), why });
    modelReady(state);
}

/** The chat cannot play, unless it is ready already: the turn held ends failed, and the chat ends with its process. */
export function modelRefused(state: State, why: string): void
{
    if (!state.ready) {
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
