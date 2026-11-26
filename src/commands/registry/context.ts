// What every command runs with besides its input, injected by the command line, the MCP server or the tests: the folders, the time, the randomness.
import { homedir, userInfo } from "node:os";
import { dataFolder, openFolder } from "../../home/index.ts";
import { ensureProfile } from "../../profiles/index.ts";

/** What a command runs with, besides its input: given by the command line or the MCP server, and by the tests. */
export interface Context
{
    /** The folder Chesspal runs in: the player's, where the AI host started it, which keeps only the host's files (D-71). */
    folder: string;
    /** The player's data folder (D-71), with a profile in it: the profiles, their games and the games kept to study, the same for every chat. */
    home: () => string;
    /** A number from 0 to 1, as Math.random gives: the colour drawn for the AI. */
    random: () => number;
    /** The time now: when a game starts. */
    now: () => Date;
    /** Waits a while, in milliseconds: a tool that waits for the player, as ponder does; the tests move their clock instead. */
    pause?: (milliseconds: number) => Promise<void>;
    /** The operating system, as process.platform names it: how a host starts the server. */
    platform: string;
    /**
     * The home folder of the computer's user, where a host keeps the settings of all its folders: init adds Chesspal's server to Antigravity's there
     * (D-115). None in the tests, which never write there.
     */
    userHome?: () => string;
    /** The player's language, as the system names it (it-IT): the command line's words to the player, in English when none or another. */
    language?: string;
    /** The address of the board page, when the MCP server serves it (D-47). */
    page?: string;
    /** Whether a browser has the board page open now, when the MCP server serves it. */
    pageOpen?: () => boolean;
    /** Opens a folder in the system's file manager: the data folder, from the board page; whether it could; none in the tests. */
    openFolder?: (folder: string) => Promise<boolean>;
    /**
     * Asks the sites the player plays on: their ratings (D-105), only for the page and the command line, never a tool of the AI's (D-106); their latest
     * games, which the tool site_games asks too (D-110); none in the tests.
     */
    fetch?: typeof globalThis.fetch;
    /** Opens the New game window on the board pages open now, where the player chooses the game: whether one was open. */
    askNewGame?: () => boolean;
    /** The AI host, as it names itself to the MCP server: claude-code, which notes how each chat starts (D-57); none on the command line. */
    host?: () => string | undefined;
    /** The player's words on the board page given to the AI in this process, by line: each comes once. */
    readonly given: Set<string>;
    /** Told when the board page has news that no file holds: words the AI was given, which it shows read (D-53), and the AI's model (D-82). */
    heard?: () => void;
    /** Told when the chat calls a tool, before it runs: the board page hears the chat listens, and the AI's clock, held while nobody did, starts. */
    calls?: () => void | Promise<void>;
    /** Told when a tool of the chat's has ended: the table the chat is attached to gets a copy of what it saw, else the chat looks for one (D-104). */
    toolEnded?: () => void;
    /** The game the chat saw when its last tool ended, its folder and its stamp: the doorbell wakes it only for a game changed since. */
    seen?: string | undefined;
    /**
     * The position the last tool that showed the game showed the chat: its moves are refused on a game changed since, by another chat or on the page
     * (D-71); null in a chat no tool has shown the game yet, none outside a chat.
     */
    positionSeen?: SeenPosition | null | undefined;
    /** The first position a tool showed the chat: a chat that has seen no other since has only greeted the player, and a new game keeps it (D-57). */
    positionFirstSeen?: SeenPosition | undefined;
    /** The instructions the MCP server gave in this chat, by their name and the chat's start: each comes once a chat (D-68); none on the command line. */
    told?: Set<string>;
    /** Who makes this tool call, as far as the host ties it to the call (D-81); none on the command line. */
    caller?: () => Promise<Caller | undefined>;
    /** The agent that makes this call of a tool it shares with the chat, as the analyst (D-89); none for the chat, or when it cannot be told. */
    agent?: string;
    /** Which run of that agent makes the call, as the host tells it: two analysts started on one game are two runs. */
    agentRun?: string;
    /** The chat makes this call of a tool it shares with an agent, as the host tells it: a caller that cannot be told is not the chat here (Federico). */
    chat?: true;
    /** The table that drives this chat starts it again clean once its turn ends: a new game then asks the player for no /clear (D-57). */
    startAgain?: () => void;
    /** The table drives this chat itself: it wakes it with the player's acts on the page, already played, and its turn ends there. */
    drivenByTable?: true;
    /** The player's lines given to a chat the table drives in a tool's answer since its last words: still to answer, though written before them. */
    readonly givenSinceWords?: Set<string>;
    /**
     * Told with a tool's result, before its answer goes to the chat, the chat's own and at a place of the table's every one: a table that drives the chat ends
     * its turn when the result asks nothing more, and counts its helpers' turns that came too late.
     */
    answered?: (tool: string, result: unknown) => void;
    /** The helpers the table runs itself beside a chat at its place, and its helpers' own chats, in place of a host's agents: none for every other chat. */
    helpers?: TableHelpers;
}

/** A helper the table runs itself: the one that thinks on the player's time, the coach with the helps on, the analyst of a game over. */
export type HelperRole = "ponder" | "coach" | "analyst";

/** What a chat at the table's place knows of the helpers the table runs, which no host's files tell. */
export interface TableHelpers
{
    /** Whether the table runs the helper of `role` now. */
    runs(role: HelperRole): boolean;
    /** The game the table's analyst goes over now: none while none is at work. */
    analysing(): string | undefined;
    /** Asks the table's analyst to go over `game`, as the player wants: whether one goes over it now. */
    analyse(game: string): boolean;
}

/** Who made a tool call: the model, else the host's name, never what the AI says of itself; the effort only when the host gives it. */
export interface Caller
{
    readonly annotator: string;
    readonly effort?: string;
    /** The annotator is the host's name: the model is not known. */
    readonly hostOnly?: boolean;
}

/**
 * Where the game a chat sees stands: the game by its start, none when there is none, and how many plies it has. Not by its folder, which a profile
 * completed renames (D-71); a game in another profile started at another time.
 */
export interface SeenPosition
{
    readonly started?: string;
    readonly plies: number;
}

/** The context of a process started in the player's folder: the data folder is found at the first command that needs it, once. */
export function defaultContext(): Context
{
    let found: string | undefined;
    const home = (): string => withProfile(found ??= dataFolder(), accountName());
    return {
        folder: process.cwd(),
        home,
        random: Math.random,
        now: () => new Date(),
        platform: process.platform,
        userHome: homedir,
        language: systemLanguage(),
        given: new Set(),
        openFolder: (folder) => openFolder(folder, process.platform),
        fetch: globalThis.fetch,
    };
}

/** The data folder for one tool call: looked for, its profile made when missing, at its first use in the call alone; the next call looks again. */
export function homeForOneCall(context: Context): () => string
{
    let found: string | undefined;
    return () => (found ??= context.home());
}

/** Whether the player's language is Italian: the command line speaks Italian to them then, English otherwise (D-32). */
export function speaksItalian(language: string | undefined): boolean
{
    return language?.slice(0, 2).toLowerCase() === "it";
}

/** A data folder with a profile in it, the first made when there is none, named after the system's account (D-71). */
export function withProfile(folder: string, account: string): string
{
    ensureProfile(folder, account);
    return folder;
}

/** The name the system knows the user by, for the first profile: Player when it has none. */
function accountName(): string
{
    try {
        return userInfo().username.trim() || "Player";
    } catch {
        return "Player";
    }
}

/** The system's language, as Node reads it: the user's locale on Windows, LANG and LC_ALL elsewhere. */
function systemLanguage(): string
{
    return Intl.DateTimeFormat().resolvedOptions().locale;
}
