/** What a command runs with, besides its input: given by the command line or the MCP server, and by the tests. */
export interface Context
{
    /** The folder Chesspal runs in: the player's, where the AI host started it. */
    folder: string;
    /** A number from 0 to 1, as Math.random gives: the colour drawn for the AI. */
    random: () => number;
    /** The time now: when a game starts. */
    now: () => Date;
    /** Waits a while, in milliseconds: a tool that waits for the player, as ponder does; the tests move their clock instead. */
    pause?: (milliseconds: number) => Promise<void>;
    /** The operating system, as process.platform names it: how a host starts the server. */
    platform: string;
    /** The player's language, as the system names it (it-IT): the command line's words to the player, in English when none or another. */
    language?: string;
    /** The address of the board page, when the MCP server serves it (D-47). */
    page?: string;
    /** The AI host, as it names itself to the MCP server: claude-code, which notes how each chat starts (D-57); none on the command line. */
    host?: () => string | undefined;
    /** The player's words on the board page given to the AI in this process, by line: each comes once (T-65). */
    readonly given: Set<string>;
    /** Told when the AI is given words it had not had: the board page shows them read (D-53). */
    heard?: () => void;
    /** The game the chat saw when its last tool ended, its folder and its stamp: the doorbell wakes it only for a game changed since. */
    seen?: string | undefined;
    /** The instructions the MCP server gave in this chat, by their name and the chat's start: each comes once a chat (D-68); none on the command line. */
    told?: Set<string>;
}

/** The context of a process started in the player's folder. */
export function defaultContext(): Context
{
    return { folder: process.cwd(), random: Math.random, now: () => new Date(), platform: process.platform, language: systemLanguage(), given: new Set() };
}

/** The system's language, as Node reads it: the user's locale on Windows, LANG and LC_ALL elsewhere. */
function systemLanguage(): string
{
    return Intl.DateTimeFormat().resolvedOptions().locale;
}
