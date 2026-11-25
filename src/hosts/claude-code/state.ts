// The chat's state and what changes it: the model asked and confirmed, the turn and its end, the waits.
import type { EventQueue, HostEvent, ToolKind } from "../chat.ts";
import type { LineProcess } from "../process.ts";
import { controlRequest, type Message, userMessage } from "./protocol.ts";

// How long the host may take to confirm the model, and to stop a turn once asked.
const modelWait = 30_000;
const interruptWait = 10_000;

export interface State
{
    process: LineProcess;
    events: EventQueue;
    later: (ms: number, run: () => void) => () => void;
    /** The chat's folder, the one its tools of kind read may read. */
    folder: string;
    allowed: ToolKind[];
    requests: number;
    /** The model asked, the request that asked it, and the model the host confirmed. */
    model: { asked: string; request: string; confirmed?: string; cancelWait?: () => void; };
    /** The host's last lines on its stderr, which say why it ended. */
    errors: string[];
    /** The session and model last told. */
    told?: { session: string; model: string; };
    turn?: Turn;
    cancelInterruptWait?: () => void;
    /** Closed by close(); ended when its process is gone. */
    closed: boolean;
    ended: boolean;
}

/** A turn: the player's words and the AI's answer. */
export interface Turn
{
    /** The player's words, while the model is not confirmed yet. */
    held?: string;
    /** The block of text in course, from 0, and whether it holds text yet: an empty block takes the next text. */
    block: number;
    filled: boolean;
    /** The id of the host's message being streamed, the ids of those whose text came in pieces, the whole texts told. */
    message?: string;
    streamed: Set<string>;
    told: Set<string>;
    /** The tools started, and those ended. */
    tools: Map<string, { name: string; kind: ToolKind; }>;
    ended: Set<string>;
    /** Asked to stop; and why it fails, when the host runs another model. */
    interrupted: boolean;
    failure?: string;
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
    state.model.cancelWait = state.later(modelWait, () => modelRefused(state, `the host did not confirm the model ${state.model.asked} within ${String(modelWait / 1000)} seconds`));
}

export function modelConfirmed(state: State, model: string): void
{
    state.model.cancelWait?.();
    state.model.confirmed = model;
    const turn = state.turn;

    if (turn?.held !== undefined) {
        write(state, userMessage(turn.held));
        turn.held = undefined;
    }
}

/** The chat cannot play: the turn held ends failed, and the chat ends with its process. */
export function modelRefused(state: State, why: string): void
{
    if (state.closed || state.ended || state.model.confirmed !== undefined) {
        return;
    }

    endChat(state, why, "failed", why);
}

/** Asks the host to stop the turn, once; if it does not within the wait, its process is stopped and the chat ends. */
export function askToStop(state: State, turn: Turn): void
{
    if (turn.interrupted) {
        return;
    }

    turn.interrupted = true;
    write(state, controlRequest(nextRequest(state), { subtype: "interrupt" }));
    state.cancelInterruptWait = state.later(interruptWait, () => {
        if (state.closed || state.ended || state.turn !== turn) {
            return;
        }

        endChat(state, "the host did not stop its turn and was closed", turn.failure === undefined ? "interrupted" : "failed", turn.failure);
    });
}

/** Ends the turn in course, the chat free for the next words, then tells it. */
export function endTurn(state: State, reason: "done" | "interrupted" | "failed", why?: string): void
{
    state.turn = undefined;
    state.cancelInterruptWait?.();
    state.cancelInterruptWait = undefined;
    tell(state, why === undefined ? { type: "turnEnd", reason } : { type: "turnEnd", reason, why });
}

/** The process is gone: the turn in course fails, and the chat ends, with what the host said last on its stderr. */
export function processEnded(state: State, reason: string): void
{
    if (state.closed || state.ended) {
        return;
    }

    const said = state.errors.length === 0 ? "" : `: ${state.errors.join(" | ")}`;
    const why = `the host's program ended (${reason})${said}`;
    endChat(state, why, "failed", why, false);
}

/** The chat ends: its turn in course ends as given, its process is stopped unless it is gone already, and `ended` says why. */
function endChat(state: State, why: string, reason: "interrupted" | "failed", turnWhy: string | undefined, stop = true): void
{
    state.ended = true;
    cancelWaits(state);

    if (state.turn !== undefined) {
        endTurn(state, reason, turnWhy);
    }

    if (stop) {
        state.process.stop();
    }

    tell(state, { type: "ended", why });
}

export function cancelWaits(state: State): void
{
    state.model.cancelWait?.();
    state.cancelInterruptWait?.();
    state.cancelInterruptWait = undefined;
}

export function tell(state: State, event: HostEvent): void
{
    state.events.tell(event);
}

export function write(state: State, message: Message): void
{
    state.process.write(JSON.stringify(message));
}

/** Request ids unique in the chat. */
function nextRequest(state: State): string
{
    state.requests += 1;
    return `table-${String(state.requests)}`;
}
