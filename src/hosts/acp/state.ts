// The chat's state as the protocol's client keeps it, beside what every driver keeps: the requests written, the session, the agent's options, the turn.
import type { ChatServer, ToolKind } from "../chat.ts";
import type { Message, Requests } from "../lines.ts";
import type { ChatState, Turn as SharedTurn } from "../state.ts";
import type { AcpHost } from "./host.ts";

export interface State extends ChatState<Turn>
{
    host: AcpHost;
    /** The name of the server whose tools are Chesspal's commands; the server given by who opens the chat, its servers then this one alone. */
    server: string;
    given?: ChatServer;
    /** The instructions given, until they are written with the chat's first words: never in a chat taken up again. */
    instructions?: string;
    /** The requests written that wait for their answer. */
    requests: Requests;
    /** The chat taken up, and the session the agent opened. */
    resumed?: string;
    session?: string;
    /** What the agent can do, as it answered the first request. */
    capabilities: Message;
    /** The options of the session's configuration as the agent last told them. */
    config: unknown;
    /** The model and effort asked, and the model the agent confirmed; for another asked in the open chat, those it ran before, until it confirms it. */
    model: { asked: string; effort?: string; confirmed?: string; before?: { asked: string; effort?: string; confirmed?: string; }; };
    /** The subagents' sessions started by a call the table allows: their updates are never the AI's. */
    children: Set<string>;
    /** Cancels the wait for the silence that ends the host's own turn. */
    cancelSilence?: () => void;
}

/** A turn: the agent's message being told, and whether a tool came since its last text; the calls the agent told. */
export interface Turn extends SharedTurn
{
    message?: string;
    toolSince: boolean;
    /** What the agent said of each tool call, merged; those told started, those ended, and those the table allowed when asked. */
    calls: Map<string, Message>;
    started: Map<string, { name: string; kind: ToolKind; }>;
    ended: Set<string>;
    approved: Set<string>;
}

export function newTurn(): Turn
{
    return { block: -1, filled: false, toolSince: false, calls: new Map(), started: new Map(), ended: new Set(), approved: new Set(), interrupted: false };
}
