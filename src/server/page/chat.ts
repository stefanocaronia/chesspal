// What the page knows of the chat, and what it runs commands with: its own context, as the command line's, since the chat's refusals are the chat's (D-71).
// The table knows the chat attached to it from what the chat tells it (D-104).
import { z } from "zod";
import type { Context, SeenPosition } from "../../commands/index.ts";

/**
 * What the page reads of the chat it serves: the player's words the AI was given (D-53), the game it saw at its last tool, which the doorbell rings it for,
 * the position it moves on, and its host, for the AI's sign and the clean chat a new game asks for (D-57). The page never changes it.
 */
export interface ChatSeen
{
    readonly given: ReadonlySet<string>;
    readonly seen: string | undefined;
    readonly positionSeen: SeenPosition | null | undefined;
    readonly positionFirstSeen: SeenPosition | undefined;
    host(): string | undefined;
}

/** The chat as the page reads it, in the chat's own process: read from its context at each request, so always as the chat left it. */
export function chatSeenOf(chat: Context): ChatSeen
{
    return {
        get given()
        {
            return chat.given;
        },
        get seen()
        {
            return chat.seen;
        },
        get positionSeen()
        {
            return chat.positionSeen;
        },
        get positionFirstSeen()
        {
            return chat.positionFirstSeen;
        },
        host: () => chat.host?.(),
    };
}

/**
 * The context the page runs its commands with: the chat's folders, time, randomness and fetch, and nothing that is the chat's own, as the position it saw, which
 * would refuse the player's resignation while the AI thinks, or what it was told.
 */
export function pageContext(chat: Context): Context
{
    const { folder, home, random, now, pause, platform, language, openFolder, fetch } = chat;
    return {
        folder,
        home,
        random,
        now,
        platform,
        given: new Set(),
        ...(pause === undefined ? {} : { pause }),
        ...(language === undefined ? {} : { language }),
        ...(openFolder === undefined ? {} : { openFolder }),
        ...(fetch === undefined ? {} : { fetch }),
    };
}

/** The context of a new game started on the page: the page's, with what the chat saw and its host, by which the game before asks for a clean chat (D-57). */
export function asTheChatSees(context: Context, chat: ChatSeen): Context
{
    return { ...context, host: () => chat.host(), positionSeen: chat.positionSeen };
}

/**
 * What a chat says of itself as it attaches to the table (D-104): its version, its session, its folder, its host, whether its folder needs init again,
 * and the seat of the `chesspal play` that started it, if one did.
 */
export const chatAttach = z.object({
    version: z.string(),
    session: z.string().nullable(),
    folder: z.string(),
    host: z.string().optional(),
    outdated: z.boolean(),
    seat: z.int().optional(),
});
export type ChatAttach = z.infer<typeof chatAttach>;

const seenPosition = z.object({ started: z.string().optional(), plies: z.int().min(0) });

/**
 * What the chat attached to the table tells it after each tool, and when the page has news no file holds (`news`): what it saw, the words it was given,
 * its host, and the AI's model and host, which the table notes for a game that ends on the page (D-82, D-97).
 */
export const chatCopy = z.object({
    token: z.string(),
    seen: z.string().optional(),
    positionSeen: seenPosition.nullable().optional(),
    positionFirstSeen: seenPosition.optional(),
    given: z.array(z.string()),
    host: z.string().optional(),
    aiModel: z.object({ model: z.string(), effort: z.string().optional() }).optional(),
    aiHost: z.string().optional(),
    news: z.boolean(),
});
export type ChatCopy = z.infer<typeof chatCopy>;

/** The chat attached to the table: the token of its requests, what it said as it attached, and its last copy, with the words given as a set. */
export interface Attached
{
    readonly token: string;
    readonly chat: ChatAttach;
    copy: ChatCopy | undefined;
    given: ReadonlySet<string>;
}

/** The chat attached to the table as the page reads it; nobody's while none is: no words given, no game or position seen, no host. */
export function attachedSeen(attached: () => Attached | undefined): ChatSeen
{
    const none = new Set<string>();
    return {
        get given()
        {
            return attached()?.given ?? none;
        },
        get seen()
        {
            return attached()?.copy?.seen;
        },
        get positionSeen()
        {
            return attached()?.copy?.positionSeen;
        },
        get positionFirstSeen()
        {
            return attached()?.copy?.positionFirstSeen;
        },
        host: () => attached()?.copy?.host ?? attached()?.chat.host,
    };
}
