// The moves of a game as the page shows them: each with its side and number, and the comment the player may read; and the words said on the page.
import type { GameRecord, Side } from "../core/index.ts";

/** A move of a record with its side and number, as the record's start position counts them, and its comment for the player. */
export interface Ply
{
    readonly san: string;
    readonly comment?: string;
    readonly side: Side;
    readonly number: number;
}

/**
 * The moves of a record, each with its side and number: a game may start from a position where Black moves first. A comment keeps only its words: the
 * commands in it, such as the AI's plan that an ended game shows, are not for the page.
 */
export function pliesOf(record: GameRecord): Ply[]
{
    const [, turn, , , , number] = (record.tags.FEN ?? "").split(" ");
    const first = Number(number) || 1;
    const offset = turn === "b" ? 1 : 0;
    return record.moves.map((move, index) => {
        const comment = move.comment?.replace(/\s*\[%[^\]]*\]/g, "").trim();
        const ply = { san: move.san, side: (index + offset) % 2 === 0 ? "white" : "black", number: first + Math.floor((index + offset) / 2) } as const;
        return comment === undefined || comment === "" ? ply : { ...ply, comment };
    });
}

/** How many of the player's lines may wait for the AI's answer, and how long a line may be: the server's limits (T-65), which a test keeps equal. */
export const talkLimits = { waiting: 3, line: 500 } as const;

/** A line said on the board page, with the moves the game had then (T-65); the player's with how far it got: written, read by the AI, or answered. */
export interface TalkLine
{
    readonly who: "player" | "ai";
    readonly text: string;
    readonly ply: number;
    readonly heard?: "sent" | "read" | "answered";
}

/**
 * The AI's words the page shows (D-53): its comments on its moves and what it said on the page, since the player's last move before its last words. Once it
 * has spoken there is always something: the last of its words stay until new ones come.
 */
export function aiWords(plies: readonly Ply[], ai: Side, talk: readonly TalkLine[]): string[]
{
    // A comment counts as said just after its move, before what the AI said there; the sort keeps that order.
    const comments = plies.flatMap((ply, index) => ply.side === ai && ply.comment !== undefined ? [{ text: ply.comment, ply: index + 1 }] : []);
    const words = [...comments, ...talk.filter((line) => line.who === "ai")].sort((one, other) => one.ply - other.ply);
    const last = words.at(-1);

    if (last === undefined) {
        return [];
    }

    const playerMoved = plies.findLastIndex((ply, index) => ply.side !== ai && index < last.ply);
    return words.filter((word) => word.ply > playerMoved).map((word) => word.text);
}

/** The player's words the page shows (D-53): those since their last move, the words sent with it included. */
export function playerWords(plies: readonly Ply[], ai: Side, talk: readonly TalkLine[]): TalkLine[]
{
    const moved = plies.findLastIndex((ply) => ply.side !== ai);
    return talk.filter((line) => line.who === "player" && line.ply > moved);
}
