// The state every driver's chat shares and what changes it: the turn and its end, the chat's end, the waits; and the chat the table holds, made from it.
import { type ChatOptions, EventQueue, type HostChat, type HostEvent, keepError, laterByTimer, type ToolKind, type TurnUsage, warnFailed } from "./chat.ts";
import { type Message, parsedLine } from "./lines.ts";
import { type LineProcess, startLineProcess } from "./process.ts";

// How long the host may take to stop a turn once asked.
const interruptWait = 10_000;

/** A turn: the player's words and the AI's answer. */
export interface Turn
{
    /** The player's words, while the chat is not ready for them yet. */
    held?: string;
    /** The block of text in course, from 0, and whether it holds text yet: an empty block takes the next text. */
    block: number;
    filled: boolean;
    /** Asked to stop; and why it fails, as when the host runs another model or a tool the table does not allow. */
    interrupted: boolean;
    failure?: string;
    /** A turn the host began by itself: no answer of the host's ends it. */
    byHost?: true;
}

/** What a driver does in its host's protocol: a new turn, the player's words written, the host asked to stop a turn, a line of the host read. */
export interface Protocol<T extends Turn>
{
    newTurn(): T;
    words(turn: T, text: string): void;
    stop(turn: T): void;
    read(message: Message): void;
}

/** A chat's state, as every driver keeps it; a driver's own adds what its protocol needs. */
export interface ChatState<T extends Turn = Turn>
{
    process: LineProcess;
    events: EventQueue;
    later: (ms: number, run: () => void) => () => void;
    /** The chat's folder: where the host runs, and the one its tools of kind read may read. */
    folder: string;
    allowed: ToolKind[];
    /** The host's last lines on its stderr, which say why it ended. */
    errors: string[];
    /** Whether the player's words may be written: the model is confirmed. */
    ready: boolean;
    cancelReadyWait?: () => void;
    /** The session and model last told. */
    told?: { session: string; model: string; };
    turn?: T;
    cancelInterruptWait?: () => void;
    /** Closed by close(); ended when its process is gone. */
    closed: boolean;
    ended: boolean;
    protocol: Protocol<T>;
}

/** Starts the host's program in the chat's folder, `args` after its own, and the state a chat begins with, but its protocol and turn. */
export function startHost(options: ChatOptions, args: string[]): Omit<ChatState, "protocol" | "turn">
{
    const start = options.start ?? startLineProcess;
    const errors: string[] = [];
    const host = start(options.program.command, [...options.program.args, ...args], { cwd: options.folder, env: options.environment, errors: (line) => keepError(errors, line) });
    return {
        process: host,
        events: new EventQueue(options.failed ?? warnFailed),
        later: options.later ?? laterByTimer,
        folder: options.folder,
        allowed: options.allowed,
        errors,
        ready: false,
        closed: false,
        ended: false,
    };
}

/** The chat the table holds: the host's lines and end are read from now, then `begin` writes its first lines. */
export function heldChat<T extends Turn>(state: ChatState<T>, begin: () => void): HostChat
{
    state.process.onLine((line) => readLine(state, line));
    state.process.onEnd((reason) => processEnded(state, reason));
    begin();
    return {
        send: (text) => send(state, text),
        onEvent: (listener) => state.events.listen(listener),
        interrupt: () => interrupt(state),
        close: () => close(state),
    };
}

/** The chat is ready: the words held, if any, are written. */
export function chatReady<T extends Turn>(state: ChatState<T>): void
{
    state.ready = true;
    state.cancelReadyWait?.();
    state.cancelReadyWait = undefined;
    const turn = state.turn;

    if (turn?.held !== undefined) {
        state.protocol.words(turn, turn.held);
    }
}

/**
 * Asks the host to stop the turn, once; if it does not within the wait, its process is stopped and the chat ends. A turn the host began by itself, which no
 * answer ends, ends at once.
 */
export function askToStop<T extends Turn>(state: ChatState<T>, turn: T): void
{
    if (turn.interrupted) {
        return;
    }

    turn.interrupted = true;
    state.protocol.stop(turn);

    if (turn.byHost === true) {
        endTurn(state, turn.failure === undefined ? "interrupted" : "failed", turn.failure);
        return;
    }

    state.cancelInterruptWait = state.later(interruptWait, () => {
        if (state.closed || state.ended || state.turn !== turn) {
            return;
        }

        endChat(state, "the host did not stop its turn and was closed", turn.failure === undefined ? "interrupted" : "failed", turn.failure);
    });
}

/** Ends the turn in course, the chat free for the next words, then tells it, with its tokens where the host reported them. */
export function endTurn(state: ChatState, reason: "done" | "interrupted" | "failed", why?: string, usage?: TurnUsage): void
{
    state.turn = undefined;
    state.cancelInterruptWait?.();
    state.cancelInterruptWait = undefined;
    tell(state, { type: "turnEnd", reason, ...(why === undefined ? {} : { why }), ...(usage === undefined ? {} : { usage }) });
}

/** The chat cannot play: the turn held ends failed, and the chat ends with its process. */
export function refused(state: ChatState, why: string): void
{
    if (!state.closed && !state.ended) {
        endChat(state, why, "failed", why);
    }
}

/** The process is gone: the turn in course fails, and the chat ends, with what the host said last on its stderr. */
export function processEnded(state: ChatState, reason: string): void
{
    if (state.closed || state.ended) {
        return;
    }

    const said = state.errors.length === 0 ? "" : `: ${state.errors.join(" | ")}`;
    const why = `the host's program ended (${reason})${said}`;
    endChat(state, why, "failed", why, false);
}

export function tell(state: ChatState, event: HostEvent): void
{
    state.events.tell(event);
}

export function write(state: ChatState, message: Message): void
{
    state.process.write(JSON.stringify(message));
}

/** A new block of text, unless the one in course is still empty. */
export function nextBlock(turn: Turn): void
{
    if (turn.block < 0 || turn.filled) {
        turn.block += 1;
        turn.filled = false;
    }
}

/** The turn the host's updates belong to: none between turns, while the player's words wait, nor for a turn failing. */
export function playing<T extends Turn>(state: ChatState<T>): T | undefined
{
    const turn = state.turn;
    return turn === undefined || turn.held !== undefined || turn.failure !== undefined ? undefined : turn;
}

/** One line of the host: whatever it holds, reading it never throws; what the chat's listener throws its queue takes. */
function readLine<T extends Turn>(state: ChatState<T>, line: string): void
{
    if (state.closed || state.ended) {
        return;
    }

    try {
        const message = parsedLine(line);

        if (message !== undefined) {
            state.protocol.read(message);
        }
    } catch {
        // A shape that broke the reading: ignored.
    }
}

function send<T extends Turn>(state: ChatState<T>, text: string): boolean
{
    if (state.closed || state.ended || state.turn !== undefined || text.trim() === "") {
        return false;
    }

    const turn = state.protocol.newTurn();
    state.turn = turn;

    if (state.ready) {
        state.protocol.words(turn, text);
    } else {
        turn.held = text;
    }

    return true;
}

function interrupt<T extends Turn>(state: ChatState<T>): void
{
    const turn = state.turn;

    if (state.closed || state.ended || turn === undefined) {
        return;
    }

    // Words not written yet: the turn ends here, and they never are.
    if (turn.held !== undefined) {
        endTurn(state, "interrupted");
        return;
    }

    askToStop(state, turn);
}

/** Closes the chat; its process, stopped unless it ended. */
function close(state: ChatState): void
{
    if (state.closed) {
        return;
    }

    state.closed = true;
    cancelWaits(state);
    state.events.close();

    if (!state.ended) {
        state.process.stop();
    }
}

/** The chat ends: its turn in course ends as given, its process is stopped unless it is gone already, and `ended` says why. */
function endChat(state: ChatState, why: string, reason: "interrupted" | "failed", turnWhy: string | undefined, stop = true): void
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

function cancelWaits(state: ChatState): void
{
    state.cancelReadyWait?.();
    state.cancelReadyWait = undefined;
    state.cancelInterruptWait?.();
    state.cancelInterruptWait = undefined;
}
