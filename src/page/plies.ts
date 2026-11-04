// The moves of a game as the page shows them: each with its side and number, the comment the player may read and the AI's review; and the words said on
// the page.
import { type GameRecord, type MoveReview, reviewOf, type Side } from "../core/index.ts";

/** A move of a record with its side and number, as the record's start position counts them, its comment for the player, and the AI's badge on it (D-69). */
export interface Ply
{
    readonly san: string;
    readonly comment?: string;
    readonly side: Side;
    readonly number: number;
    readonly review?: MoveReview;
}

/**
 * The moves of a record, each with its side and number: a game may start from a position where Black moves first. A comment keeps only its words: the
 * commands in it, such as the AI's plan that an ended game shows, and the (=) of a draw offer (D-65), are not for the page.
 */
export function pliesOf(record: GameRecord): Ply[]
{
    const [, turn, , , , number] = (record.tags.FEN ?? "").split(" ");
    const first = Number(number) || 1;
    const offset = turn === "b" ? 1 : 0;
    return record.moves.map((move, index) => {
        const comment = move.comment?.replace(/\s*\[%[^\]]*\]/g, "").replace(/^\s*\(=\)/, "").trim();
        const review = reviewOf(move.comment);
        const ply = {
            san: move.san,
            side: (index + offset) % 2 === 0 ? "white" : "black",
            number: first + Math.floor((index + offset) / 2),
            ...(review === undefined ? {} : { review }),
        } as const;
        return comment === undefined || comment === "" ? ply : { ...ply, comment };
    });
}

/** How long a line of the player's may be: the server's limit (D-54), which a test keeps equal. */
export const talkLimits = { line: 200 } as const;

/** A line said on the board page, with the moves the game had then (T-65); the player's with how far it got: written, read by the AI, or answered. */
export interface TalkLine
{
    readonly who: "player" | "ai";
    readonly text: string;
    readonly ply: number;
    readonly heard?: "sent" | "read" | "answered";
}

/** How many times the AI has spoken in the game, its comments on its moves and its lines on the page: the page sees it speak when the count grows (T-84). */
export function aiSpoke(plies: readonly Ply[], ai: Side, talk: readonly TalkLine[]): number
{
    return plies.filter((ply) => ply.side === ai && ply.comment !== undefined).length + talk.filter((line) => line.who === "ai").length;
}

/** The AI's words in the game going on (D-53), in the order said: its comments on its moves and what it said on the page. */
export function aiWords(plies: readonly Ply[], ai: Side, talk: readonly TalkLine[]): string[]
{
    // A comment counts as said just after its move, before what the AI said there; the sort keeps that order.
    const comments = plies.flatMap((ply, index) => ply.side === ai && ply.comment !== undefined ? [{ text: ply.comment, ply: index + 1 }] : []);
    return [...comments, ...talk.filter((line) => line.who === "ai")].sort((one, other) => one.ply - other.ply).map((word) => word.text);
}

/** The player's words in the game going on (D-53), in the order said. */
export function playerWords(talk: readonly TalkLine[]): TalkLine[]
{
    return talk.filter((line) => line.who === "player");
}

/** How many characters the player has written since the AI's last move, of the 200 they may until its next one (D-54). */
export function playerSpent(plies: readonly Ply[], ai: Side, talk: readonly TalkLine[]): number
{
    const moved = plies.findLastIndex((ply) => ply.side === ai);
    return talk.filter((line) => line.who === "player" && line.ply > moved).reduce((sum, line) => sum + line.text.length, 0);
}
