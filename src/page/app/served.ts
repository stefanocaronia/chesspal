// What the page asks the server (D-47): the game of the player's folder, read again each time it changes, and the player's moves, words and choices sent
// there, refused in the player's language.
import { useEffect, useRef, useState } from "preact/hooks";
import type { AiModel, Clock, Side } from "../../core/index.ts";
import type { Thinking } from "../avatars/thought.tsx";
import type { CoachShown, TalkLine } from "../game/plies.ts";
import type { ProfileShown } from "../profile/profile.ts";
import type { ServerRefusal, Text } from "../text.ts";

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

    useEffect(() => {
        let latest = 0;

        const load = (): void => {
            // Two reads in flight may answer out of order: only the last one asked counts.
            const asked = ++latest;
            fetch("/api/game")
                .then((response) => response.json() as Promise<PageData & { error?: string; }>)
                .then((body) => {
                    if (asked !== latest) {
                        return;
                    }

                    setProblem(body.error);

                    if (body.error === undefined) {
                        setData(body);
                    }
                })
                .catch((error: unknown) => setProblem(String(error)));
        };

        // The server says when the game changes, whoever changed it: the page reads it again, and as it connects, the first time or to a new chat's server.
        // The server lives in the chat's MCP server: when the chat ends, after /clear in Claude's app too, the page waits for the next one and says so.
        reload.current = load;
        const events = new EventSource("/api/events");

        events.onopen = () => {
            setOffline(false);
            load();
        };

        // The chat asks for a new game: the player chooses it in the New game window, which opens here.
        events.onmessage = (event) => event.data === "new-game" ? onNewGame() : load();
        events.onerror = () => setOffline(events.readyState !== EventSource.OPEN);
        return () => events.close();
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
    /** The game in analysis, once no game goes on (D-69): its name and its PGN with the AI's review. */
    readonly analysis?: { readonly name: string; readonly pgn: string; readonly book: number; };
    readonly opponent?: string;
    /** The model and effort the AI played its last move with, as the host tied them to it (D-82). */
    readonly aiModel?: AiModel;
    /** Whether a chat hears the player: in a turn, or waiting for the doorbell. */
    readonly listening?: boolean;
    /** What the AI thinks on now: its move, or on the player's time (D-72); none else. */
    readonly thinking?: Thinking;
    /** The player's folder was set up by an older Chesspal: init must run there again. */
    readonly outdated?: true;
    readonly profile: ProfileShown;
    readonly profiles: readonly ProfileShown[];
    readonly settings?: object;
    /** Where the profiles are, folder by folder from the player's own. */
    readonly dataFolder: readonly string[];
}

/**
 * Sends a request to the server: the reason it was refused, in the player's language when the page knows the refusal (D-57), with the host's name where
 * it sends the player, or undefined.
 */
export async function post(path: string, body: object, text: Text, name: string): Promise<Refused | undefined>
{
    try {
        const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

        if (response.ok) {
            return undefined;
        }

        const refused = (await response.json()) as { error?: string; refusal?: string; most?: number; };
        const known = refused.refusal === undefined ? undefined : text.refused[refused.refusal as ServerRefusal] as ((most: number, name: string) => string) | undefined;
        return { text: known?.(refused.most ?? 0, name) ?? refused.error ?? response.statusText, words: refused.refusal?.startsWith("words-") === true };
    } catch (error) {
        return { text: String(error), words: false };
    }
}

/** Sends the player's move to the server, which plays it as the chat would, with the words written for the AI: the reason it was refused, or undefined. */
export function sendMove(move: string, words: string, text: Text, name: string): Promise<Refused | undefined>
{
    const message = words.trim();
    return post("/api/move", message === "" ? { move } : { move, message }, text, name);
}

/** Sends the player's words alone: the reason they were refused, or undefined. */
export function sendMessage(words: string, text: Text, name: string): Promise<Refused | undefined>
{
    return post("/api/message", { text: words.trim() }, text, name);
}

/** A request the server refused: why, and whether the player's words were the cause, which the talk says rather than the board. */
export interface Refused
{
    readonly text: string;
    readonly words: boolean;
}
