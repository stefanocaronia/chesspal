// The moves of a game as the page shows them: each with its side and number, the comment the player may read and the AI's review; and the words said on
// the page.
import { type Badge, drawingsIn, type DrawnArrow, type DrawnSquare, type GameRecord, type Lead, leadOf, type MoveReview, reviewOf, type Side } from "../../core/index.ts";

/** A move of a record with its side and number, as the record's start position counts them, its comment for the player, and the AI's badge on it (D-69). */
export interface Ply
{
    readonly san: string;
    readonly comment?: string;
    readonly side: Side;
    readonly number: number;
    readonly review?: MoveReview;
    /** Who the AI saw ahead after it (D-90). */
    readonly lead?: Lead;
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
        // The AI's drawings with its own move, with the helps on, come without a badge or a note (D-78).
        const drawings = drawingsIn(move.comment);
        const review = reviewOf(move.comment) ?? (Object.keys(drawings).length === 0 ? undefined : drawings);
        const lead = leadOf(move.comment);
        const ply = {
            san: move.san,
            side: (index + offset) % 2 === 0 ? "white" : "black",
            number: first + Math.floor((index + offset) / 2),
            ...(review === undefined ? {} : { review }),
            ...(lead === undefined ? {} : { lead }),
        } as const;
        return comment === undefined || comment === "" ? ply : { ...ply, comment };
    });
}

/**
 * What the coach wrote that the player may see now, with the helps on (D-88): its judgments of their moves, by the plies up to each, its hint for their
 * turn, and who it saw ahead in the positions they were to move in, by the plies up to each (D-90).
 */
export interface CoachShown
{
    readonly judgments: readonly { readonly ply: number; readonly badge?: Badge; readonly note?: string; readonly released?: true; }[];
    readonly hint?: CoachHint;
    readonly leads?: readonly { readonly position: number; readonly lead: Lead; }[];
}

/** The coach's hint for the player's turn, for the position after `position` plies, with what it draws on the board to show it. */
export interface CoachHint
{
    readonly position: number;
    readonly text: string;
    readonly arrows?: readonly DrawnArrow[];
    readonly squares?: readonly DrawnSquare[];
}

/** The moves with the coach's judgments on the player's, as the analyst's review shows on them (D-88), and who it saw ahead after the moves it was given (D-90). */
export function withJudgments(plies: Ply[], { judgments, leads = [] }: CoachShown): Ply[]
{
    return plies.map((ply, index) => {
        const judgment = judgments.find((one) => one.ply === index + 1);
        const lead = leads.find((one) => one.position === index + 1)?.lead;
        const judged = judgment === undefined
            ? ply
            : { ...ply, review: { ...(judgment.badge === undefined ? {} : { badge: judgment.badge }), ...(judgment.note === undefined ? {} : { note: judgment.note }) } };
        return lead === undefined ? judged : { ...judged, lead };
    });
}

/** The moves with the book's badge on the first `book` of them that have no review of the AI's. */
export function withBook(plies: Ply[], book: number): Ply[]
{
    // A move the AI only drew on keeps its drawings beside the book's badge (D-78).
    return book === 0 ? plies : plies.map((ply, index) => index < book && ply.review?.badge === undefined && ply.review?.note === undefined ? { ...ply, review: { ...ply.review, badge: "book" } } : ply);
}

/** The moves without the AI's review: during a game with the helps off the player sees neither its judgments nor its drawings (D-78), nor who is ahead (D-90). */
export function withoutReviews(plies: Ply[]): Ply[]
{
    return plies.map(({ review, lead, ...ply }) => ply);
}

/**
 * The coach's judgments the card shows (D-78, D-88): first one whose note was held until the player's last move let it go, however far back its move (Zoe); then the latest, of the player's last move the AI has answered, else of the one before (Zoe and Federico). Only
 * those with a badge of their own or a note.
 */
export function judgmentsOf(plies: readonly Ply[], player: Side, { judgments }: CoachShown): Ply[]
{
    const answered = plies.at(-1)?.side === player ? plies.slice(0, -1) : plies;
    const latest = answered.filter((ply) => ply.side === player).slice(-2).reverse().find(judged);
    const released = judgments.filter((judgment) => judgment.released === true).map(({ ply }) => answered[ply - 1])
        .filter((ply): ply is Ply => ply !== undefined && ply !== latest && judged(ply));
    return [...released, ...(latest === undefined ? [] : [latest])];
}

/** How long a line of the player's may be: the server's limit (D-54), which a test keeps equal. */
export const talkLimits = { line: 200 } as const;

/**
 * A line said on the board page, with the moves the game had then; the player's with how far it got: written, read by the AI, or answered; in analysis with
 * the game and the move shown as they wrote it (D-101).
 */
export interface TalkLine
{
    readonly who: "player" | "ai";
    readonly text: string;
    readonly ply: number;
    readonly heard?: "sent" | "read" | "answered";
    readonly shown?: { readonly game: string; readonly at: number; readonly move?: string; };
}

/**
 * The talk over a game in analysis (D-101): from the player's first line on it, the lines said since on it, a line without a position belonging to the game
 * of the player's last line before it; the last ten, which is all half the column holds (Zoe).
 */
export function analysisTalk(talk: readonly TalkLine[], game: string): TalkLine[]
{
    let on: string | undefined;

    return talk.filter((line) => {
        on = line.shown?.game ?? on;
        return on === game;
    }).slice(-10);
}

/** How many times the AI has spoken in the game, its comments on its moves and its lines on the page: the page sees it speak when the count grows. */
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

function judged({ review }: Ply): boolean
{
    return review?.note !== undefined || (review?.badge !== undefined && review.badge !== "book");
}

/** The moves of a game the analyst has said who is ahead after, of all its moves. */
export interface ReviewCount
{
    readonly done: number;
    readonly total: number;
}

/** How far a review has got, as status tells the AI: the moves the analyst has said who is ahead after, of all the game's. */
export function reviewCount(plies: readonly Ply[]): ReviewCount
{
    return { done: plies.filter((ply) => ply.lead !== undefined).length, total: plies.length };
}
