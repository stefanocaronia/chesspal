// The chat's state and what changes it: the requests written and their answers, the turn and its end, the waits.
import type { EventQueue, HostEvent, ToolKind } from "../chat.ts";
import type { LineProcess } from "../process.ts";
import { type Message, request } from "./protocol.ts";
import type { CodexTool } from "./tools.ts";

// How long Codex may take to stop a turn once asked.
const interruptWait = 10_000;

export interface State
{
    process: LineProcess;
    events: EventQueue;
    later: (ms: number, run: () => void) => () => void;
    /** The chat's folder: where Codex runs, and the one its tools of kind read may read. */
    folder: string;
    allowed: ToolKind[];
    /** The requests written, by id, and what reads the answer of each. */
    pending: Map<number, (answer: Message) => void>;
    requests: number;
    /** The thread taken up, and the thread Codex opened. */
    resumed?: string;
    thread?: string;
    /** The model and effort asked, the model Codex confirmed, and whether the chat is ready for the player's words. */
    model: { asked: string; effort?: string; confirmed?: string; };
    ready: boolean;
    cancelReadyWait?: () => void;
    /** Codex's last lines on its stderr, which say why it ended. */
    errors: string[];
    /** The thread and model last told. */
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
    /** The player's words, while the chat is not ready yet; Codex's id of the turn, once it says it. */
    held?: string;
    id?: string;
    /** The block of text in course, from 0, and whether it holds text yet; the message being told, and whether a tool came since its last text. */
    block: number;
    filled: boolean;
    message?: string;
    toolSince: boolean;
    /** The messages whose text was told, the tools started, those ended, and those the table allowed when Codex asked. */
    told: Set<string>;
    tools: Map<string, CodexTool>;
    ended: Set<string>;
    approved: Set<string>;
    /** Asked to stop, and whether Codex was told; why it fails, when Codex runs another model or a tool the table does not allow. */
    interrupted: boolean;
    interruptSent: boolean;
    failure?: string;
}

export function newTurn(): Turn
{
    return { block: -1, filled: false, toolSince: false, told: new Set(), tools: new Map(), ended: new Set(), approved: new Set(), interrupted: false, interruptSent: false };
}

/** Writes a request, and reads its answer with `answered`. */
export function ask(state: State, method: string, params: Message, answered: (answer: Message) => void): void
{
    state.requests += 1;
    state.pending.set(state.requests, answered);
    write(state, request(state.requests, method, params));
}

/** Asks Codex to stop the turn, once; if it does not within the wait, its process is stopped and the chat ends. */
export function askToStop(state: State, turn: Turn): void
{
    if (turn.interrupted) {
        return;
    }

    turn.interrupted = true;
    sendInterrupt(state, turn);
    state.cancelInterruptWait = state.later(interruptWait, () => {
        if (state.closed || state.ended || state.turn !== turn) {
            return;
        }

        endChat(state, "the host did not stop its turn and was closed", turn.failure === undefined ? "interrupted" : "failed", turn.failure);
    });
}

/** Tells Codex to stop a turn asked to stop, once it knows the turn's id. */
export function sendInterrupt(state: State, turn: Turn): void
{
    if (turn.interrupted && !turn.interruptSent && turn.id !== undefined) {
        turn.interruptSent = true;
        ask(state, "turn/interrupt", { threadId: state.thread, turnId: turn.id }, () => undefined);
    }
}

/** Ends the turn in course, the chat free for the next words, then tells it. */
export function endTurn(state: State, reason: "done" | "interrupted" | "failed", why?: string): void
{
    state.turn = undefined;
    state.cancelInterruptWait?.();
    state.cancelInterruptWait = undefined;
    tell(state, why === undefined ? { type: "turnEnd", reason } : { type: "turnEnd", reason, why });
}

/** The chat cannot play: the turn held ends failed, and the chat ends with its process. */
export function refused(state: State, why: string): void
{
    if (!state.closed && !state.ended) {
        endChat(state, why, "failed", why);
    }
}

/** The process is gone: the turn in course fails, and the chat ends, with what Codex said last on its stderr. */
export function processEnded(state: State, reason: string): void
{
    if (state.closed || state.ended) {
        return;
    }

    const said = state.errors.length === 0 ? "" : `: ${state.errors.join(" | ")}`;
    const why = `the host's program ended (${reason})${said}`;
    endChat(state, why, "failed", why, false);
}

export function cancelWaits(state: State): void
{
    state.cancelReadyWait?.();
    state.cancelReadyWait = undefined;
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
