// The chat's state as Codex's driver keeps it, beside what every driver keeps: the requests written, the thread, the turn.
import type { ChatServer } from "../chat.ts";
import type { Requests } from "../lines.ts";
import type { ChatState, Turn as SharedTurn } from "../state.ts";
import type { CodexTool } from "./tools.ts";

export interface State extends ChatState<Turn>
{
    /** The requests written that wait for their answer. */
    requests: Requests;
    /** The thread taken up, and the thread Codex opened. */
    resumed?: string;
    thread?: string;
    /** The server whose tools are Chesspal's commands, by its name; the one given by who opens the chat, and its instructions, set on the thread. */
    server: string;
    given?: ChatServer;
    instructions?: string;
    /** The MCP servers of the player's own configuration, which the thread opens turned off: every one but Chesspal's. */
    others: string[];
    /** The model and effort asked, and the model Codex confirmed; for another asked in the open chat, those Codex ran before, until its settings confirm it. */
    model: { asked: string; effort?: string; confirmed?: string; before?: { asked: string; effort?: string; confirmed?: string; }; };
}

/** A turn: Codex's id of it, once it says it; the message being told, and whether a tool came since its last text; the tools Codex told. */
export interface Turn extends SharedTurn
{
    id?: string;
    message?: string;
    toolSince: boolean;
    /** The messages whose text was told, the tools started, those ended, and those the table allowed when Codex asked. */
    told: Set<string>;
    tools: Map<string, CodexTool>;
    ended: Set<string>;
    approved: Set<string>;
    /** Whether Codex was told to stop the turn. */
    interruptSent: boolean;
}

export function newTurn(): Turn
{
    return { block: -1, filled: false, toolSince: false, told: new Set(), tools: new Map(), ended: new Set(), approved: new Set(), interrupted: false, interruptSent: false };
}

/** Tells Codex to stop a turn asked to stop, once it knows the turn's id. */
export function sendInterrupt(state: State, turn: Turn): void
{
    if (turn.interrupted && !turn.interruptSent && turn.id !== undefined) {
        turn.interruptSent = true;
        state.requests.ask("turn/interrupt", { threadId: state.thread, turnId: turn.id }, () => undefined);
    }
}
