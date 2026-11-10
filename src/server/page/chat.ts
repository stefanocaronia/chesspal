// What the page knows of the chat, and what it runs commands with: its own context, as the command line's, since the chat's refusals are the chat's (D-71).
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
        host: () => chat.host?.(),
    };
}

/**
 * The context the page runs its commands with: the chat's folders, time and randomness, and nothing that is the chat's own, as the position it saw, which
 * would refuse the player's resignation while the AI thinks, or what it was told.
 */
export function pageContext(chat: Context): Context
{
    const { folder, home, random, now, pause, platform, language, openFolder } = chat;
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
    };
}

/** The context of a new game started on the page: the page's, with what the chat saw and its host, by which the game before asks for a clean chat (D-57). */
export function asTheChatSees(context: Context, chat: ChatSeen): Context
{
    return { ...context, host: () => chat.host(), positionSeen: chat.positionSeen };
}
