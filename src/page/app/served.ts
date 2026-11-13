// What the page asks the server (D-47): the game of the player's folder, read again each time it changes, and the player's moves, words and choices sent
// there, refused in the player's language.
import { useEffect, useRef, useState } from "preact/hooks";
import type { AiModel, Clock, Side } from "../../core/index.ts";
import type { Thinking } from "../avatars/thought.tsx";
import type { CoachShown, TalkLine } from "../game/plies.ts";
import { closesForNewer, eventsAddress } from "../layout/window.ts";
import type { ProfileShown } from "../profile/profile.ts";
import type { ServerRefusal, Text } from "../text.ts";
import { watchServed } from "./watch.ts";

/** What the page knows from the server: what it sent last, why it could not read it, whether the server is gone, and how to read it again. */
export interface ServedPage
{
    readonly data: PageData | undefined;
    readonly problem: string | undefined;
    readonly offline: boolean;
    reload(): void;
}

/**
 * The game of the player's folder, read from the server, and read again each time the server says it changed, whoever changed it; `onNewGame` when the chat
 * asks for a new game, which the player chooses on the page.
 */
export function useServed(onNewGame: () => void): ServedPage
{
    const [data, setData] = useState<PageData | undefined>(undefined);
    const [problem, setProblem] = useState<string | undefined>(undefined);
    const [offline, setOffline] = useState(false);
    // Reads the game again: when the server says it changed, and when a clock runs out on the page.
    const reload = useRef(() => {});

    // The server says when the game changes, whoever changed it: the page reads it again, and as it connects, the first time or to a new chat's server.
    // The server lives in the chat's MCP server, or the table: when it is gone the page waits for the next one and says so.
    useEffect(() => {
        const watch = watchServed<PageData & { error?: string; }>({
            read: () => fetch("/api/game").then((response) => response.json() as Promise<PageData & { error?: string; }>),
            connect: (handlers) => {
                const events = new EventSource(eventsAddress());
                events.onopen = handlers.open;
                events.onmessage = (event: MessageEvent<string>) => closesForNewer(event.data) || handlers.message(event.data);
                events.onerror = handlers.error;
                return events;
            },
            later: (run, wait) => window.setTimeout(run, wait),
            cancel: (timer) => window.clearTimeout(timer),
        }, {
            read: setData,
            problem: setProblem,
            offline: setOffline,
            newGame: onNewGame,
            otherVersion: () => window.location.reload(),
        });

        reload.current = watch.reload;
        return watch.stop;
    }, []);

    return { data, problem, offline, reload: () => reload.current() };
}

/**
 * What the server sends: the game, its PGN for the player, the AI's side, when it started, the talk on the page, each line with the moves the game had
 * then, its clock in a game with one and the draw offer that stands (D-65), null before the first game; the AI's name, when the host gave it; and the
 * profile in use with its settings, and all the profiles, none before the first (D-23).
 */
export interface PageData
{
    /** The Chesspal version that serves the page: a page loaded from another loads again. */
    readonly version?: string;
    readonly game: {
        readonly pgn: string;
        readonly ai: Side;
        readonly started: string;
        /** Its name in the archive, games/2026-11-02-153012.pgn. */
        readonly name: string;
        readonly talk: readonly TalkLine[];
        readonly clock?: Clock;
        readonly drawOffer?: "player" | "ai";
        /** How many of its first moves are the book's. */
        readonly book?: number;
        /** What the coach wrote that the player may see now, with the helps on (D-88). */
        readonly coach?: CoachShown;
    } | null;
    /** The talk before the first game (D-77), with no game. */
    readonly talk?: readonly TalkLine[];
    /** The game in analysis, once no game goes on (D-69): its name and its PGN with the AI's review, and whether an AI is going over it now. */
    readonly analysis?: { readonly name: string; readonly pgn: string; readonly book: number; readonly reviewing?: true; readonly incomplete?: true; };
    readonly opponent?: string;
    /** The model and effort the AI played its last move with, as the host tied them to it (D-82). */
    readonly aiModel?: AiModel;
    /** Whether a chat hears the player: in a turn, or waiting for the doorbell. */
    readonly listening?: boolean;
    /** What the AI thinks on now: its move, or on the player's time (D-72); none else. */
    readonly thinking?: Thinking;
    /** The player's folder was set up by an older Chesspal: init must run there again. */
    readonly outdated?: true;
    /** A newer Chesspal on npm (D-108), and on the table whether it is being installed. */
    readonly update?: { readonly version: string; readonly installing?: true; readonly installed?: true; };
    /** On the table's page alone (D-104): whether a chat is at it, the hosts it opens one in, and whether one is opening. */
    readonly table?: TableShown;
    readonly profile: ProfileShown;
    readonly profiles: readonly ProfileShown[];
    readonly settings?: object;
    /** Where the profiles are, folder by folder from the player's own. */
    readonly dataFolder: readonly string[];
}

/**
 * The table's chat, as its page shows it (D-104, D-107): whether one is at the table, its host, and whether chesspal play holds it, which the page can then
 * start again, with the model and effort it started with; one opening is one the page asked for, the one started again for a new game, or with another
 * model or host; a start again or a new game may wait for its answer.
 */
export interface TableShown
{
    readonly chat: boolean;
    readonly host?: string;
    readonly held: boolean;
    readonly started?: { readonly model?: string; readonly effort?: string; };
    readonly hosts: readonly ChatHost[];
    readonly opening?: "chat" | "again" | "restart";
    readonly waiting?: "restart" | "new-game";
    /** Why the last new game that waited for the chat could not start, numbered so that the page says it once. */
    readonly refused?: ServerRefused & { readonly number: number; };
}

/** A refusal as the server sends it: its words, and the code of one the page says in the player's language, with the characters left for words too long. */
export interface ServerRefused
{
    readonly error?: string;
    readonly refusal?: string;
    readonly most?: number;
}

/** A host the table opens a chat in: whether it is installed, the models and efforts offered, and the command to type in a terminal instead. */
export interface ChatHost
{
    readonly name: string;
    readonly installed: boolean;
    readonly models: readonly string[];
    readonly efforts: readonly string[];
    /** The middle model and effort, which a chat starts with until the player chooses others. */
    readonly model: string;
    readonly effort: string;
    readonly command: string;
}

/**
 * Sends a request to the server: the reason it was refused, in the player's language when the page knows the refusal (D-57), with the host's name where
 * it sends the player, or undefined.
 */
export async function post(path: string, body: object, text: Text, name: string): Promise<Refused | undefined>
{
    const sent = await ask(path, body, text, name);
    return "refused" in sent ? sent.refused : undefined;
}

/** Sends a request to the server as `post` does: its answer, or the reason it was refused. */
export async function ask(path: string, body: object, text: Text, name: string): Promise<{ answer: Record<string, unknown>; } | { refused: Refused; }>
{
    try {
        const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

        if (response.ok) {
            return { answer: await response.json().catch(() => ({})) as Record<string, unknown> };
        }

        const refused = (await response.json()) as ServerRefused;
        return { refused: { text: refusedText(refused, text, name) ?? response.statusText, words: refused.refusal?.startsWith("words-") === true } };
    } catch (error) {
        return { refused: { text: String(error), words: false } };
    }
}

/** A refusal of the server's in the player's language when the page knows its code, with the host's name where it sends the player; else its words. */
export function refusedText(refused: ServerRefused, text: Text, name: string): string | undefined
{
    const known = refused.refusal === undefined ? undefined : text.refused[refused.refusal as ServerRefusal] as ((most: number, name: string) => string) | undefined;
    return known?.(refused.most ?? 0, name) ?? refused.error;
}

/** Sends the player's move to the server, which plays it as the chat would, with the words written for the AI: the reason it was refused, or undefined. */
export function sendMove(move: string, words: string, text: Text, name: string): Promise<Refused | undefined>
{
    const message = words.trim();
    return post("/api/move", message === "" ? { move } : { move, message }, text, name);
}

/** Sends the player's words alone: the reason they were refused, or undefined. */
export function sendMessage(words: string, text: Text, name: string, shown?: { game: string; at: number; }): Promise<Refused | undefined>
{
    return post("/api/message", { text: words.trim(), ...shown }, text, name);
}

/** A request the server refused: why, and whether the player's words were the cause, which the talk says rather than the board. */
export interface Refused
{
    readonly text: string;
    readonly words: boolean;
}
