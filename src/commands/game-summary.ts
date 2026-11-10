// The current game as the commands give it: plain data for the command line's JSON, from which answer-lines.ts writes the lines an AI reads.
import { type AiLevel, type Chances, type Facts, type GameRecord, levelOf, moodAt, type MoodNow, type Possibilities, sees, type Side, type Square } from "../core/index.ts";
import { type CurrentGame, currentPlan, drawOfferOf, endOf, type Speaker, type Thought, thoughtForLastMove } from "../games/index.ts";
import { helpsIn } from "../profiles/index.ts";
import { type ClockSummary, clockSummaryOf, gameAt } from "./clock.ts";
import { knownMoves, openingLine } from "./opening-book.ts";
import type { Written } from "./say.ts";

/** The current game, as the commands give it. */
export interface GameSummary
{
    ai: Side;
    /** The AI's level: the layers of facts it gets (D-60). */
    level: AiLevel;
    turn: Side;
    moveNumber: number;
    fen: string;
    /** The last moves, numbered: 3.Bc4 Nf6 4.Ng5 d5. */
    lastMoves: string;
    /** The last move, numbered, with its squares. */
    lastMove?: LastMove;
    /** The opening by Lichess's book (D-15): ECO and name, and the move the game left the book at. */
    opening?: string;
    /** When the AI is to move: the facts of the position (D-26); below the club level, only the check and the legal moves of each piece are shown. */
    facts?: Facts;
    /** When the AI is to move, from the club level up: what the moves would do (D-100). */
    possibilities?: Possibilities;
    /** With the possibilities, out of check: what the player's moves would do if they were to move. */
    threats?: Chances;
    /** When the AI is to move at the master level, in the book: the moves it knows from the position (D-15, D-60). */
    book?: readonly string[];
    /** When the AI is to move: the plan it wrote last. */
    plan?: string;
    /** When the AI is to move: what it thought of the player's move on their time (D-72). */
    thought?: Thought;
    /** When the AI is to move: the helps on, so it may teach (D-78), with a coach that judges the player's moves (D-88), or turned off since it drew on a move. */
    helps?: "on" | "coached" | "off now";
    /** In a game with a time control: the time each side had left when the command ran (D-13). */
    clock?: ClockSummary;
    /** Who offered a draw, while the offer stands (D-65). */
    drawOffer?: Speaker;
    /** The AI's mood while it lasts, in a game going on (D-70). */
    mood?: MoodNow;
    /**
     * When the game is over: how it ended, its name in the archive once it is there, and, where an analyst agent runs (D-89), whether the chat offers it or
     * goes over the review it did.
     */
    end?: { result: string; termination?: string; archive?: string; analyst?: "offer" | "done"; };
}

/** A move numbered as in the game (4.Ng5, 4...d5), with the squares it went from and to. */
export interface LastMove
{
    move: string;
    from: Square;
    to: Square;
}

/** A move played by the AI or the player, with where the game stands after it. */
export interface MovePlayed
{
    /** The move, numbered as in the game: 4.Ng5, 4...d5. */
    move: string;
    /** A + or # the move was written with and does not give. */
    note?: string;
    game: GameSummary;
    /** What went wrong after the move was saved, such as the archive not written. */
    warning?: string;
    /** What the player wrote on the board page that the AI has not been given yet. */
    words?: Written[];
}

/** The game as the commands tell it; a game over with the name it has in the archive, when it is there. */
export function summaryOf(current: CurrentGame, now: Date, archive?: string): GameSummary
{
    const { game, ai } = current;
    const { position, record, lastMove } = game;
    const end = endOf(game);
    const level = levelOf(record);
    const summary: GameSummary = { ai, level, turn: position.turn, moveNumber: position.moveNumber, fen: position.fen, lastMoves: lastMoves(record, 6) };

    if (lastMove !== undefined) {
        summary.lastMove = { move: lastMoves(record, 1), from: lastMove.from, to: lastMove.to };
    }

    const opening = openingLine(record);
    const clock = clockSummaryOf(current, now);
    const drawOffer = drawOfferOf(current);

    if (drawOffer !== undefined) {
        summary.drawOffer = drawOffer;
    }

    const mood = moodAt(record, ai);

    if (end === undefined && mood.mood !== "neutral") {
        summary.mood = mood;
    }

    if (clock !== undefined) {
        summary.clock = clock;
    }

    if (opening !== undefined) {
        summary.opening = opening;
    }

    if (end !== undefined) {
        summary.end = archive === undefined ? end : { ...end, archive };
    } else if (position.turn === ai) {
        addAiFacts(summary, current);
    }

    return summary;
}

/**
 * The summary with what the AI reads when it is to move: what it thought of the player's last move on their time (D-72), and whether the helps are on (D-78),
 * with a coach when `coached`.
 */
export function withThought(summary: GameSummary, folder: string, current: CurrentGame, coached: boolean): GameSummary
{
    if (summary.turn !== summary.ai || summary.end !== undefined) {
        return summary;
    }

    const thought = thoughtForLastMove(folder, current);
    const helps = helpsIn(folder) ? (coached ? "coached" : "on") : judgedBefore(current) ? "off now" : undefined;
    return { ...summary, ...(thought === undefined ? {} : { thought }), ...(helps === undefined ? {} : { helps }) };
}

/** The current game `now`, refused when there is none or when it is over, on time too. */
export function gameGoingOn(folder: string, now: Date): CurrentGame
{
    const current = gameAt(folder, now);

    if (current === undefined) {
        throw new Error("There is no game going on: start one with new_game. Nothing changed.");
    }

    const end = endOf(current.game);

    if (end !== undefined) {
        throw new Error(`The game is over (${endText(end)}): new_game starts another. Nothing changed.`);
    }

    return current;
}

/** How a game ended, in words: its result, and how it came when known. */
export function endText({ result, termination }: { result: string; termination?: string; }): string
{
    return termination === undefined ? result : `${result}, ${termination}`;
}

/** The last plies of a record, numbered as a player writes them, from the move number and side of its FEN. */
export function lastMoves(record: GameRecord, count: number): string
{
    const [, turn, , , , number] = (record.tags.FEN ?? "").split(" ");
    const startNumber = Number(number) || 1;
    // The ply count from white's move of the first move number: 1 when black moves first.
    const offset = turn === "b" ? 1 : 0;
    const first = Math.max(0, record.moves.length - count);

    return record.moves.slice(first).map((move, index) => {
        const ply = first + index + offset;
        const moveNumber = startNumber + Math.floor(ply / 2);

        if (ply % 2 === 0) {
            return `${moveNumber}.${move.san}`;
        }

        return index === 0 ? `${moveNumber}...${move.san}` : move.san;
    }).join(" ");
}

/** Whether the AI judged or drew on a move of this game, which only the helps allow: a sign they were on. */
function judgedBefore(current: CurrentGame): boolean
{
    return current.game.record.moves.some((move) => /\[%(badge|review|cal|csl) /.test(move.comment ?? ""));
}

/** What the AI gets when it is to move: the facts its level sees (D-60), and its plan. */
function addAiFacts(summary: GameSummary, { game }: CurrentGame): void
{
    const plan = currentPlan(game.record);
    summary.facts = game.facts;

    if (sees(summary.level, "tactics")) {
        summary.possibilities = game.possibilities;
        const { threats } = game;

        if (threats !== undefined) {
            summary.threats = threats;
        }
    }

    if (sees(summary.level, "theory")) {
        const book = knownMoves(summary.fen);

        if (book.length > 0) {
            summary.book = book;
        }
    }

    if (plan !== undefined) {
        summary.plan = plan;
    }
}
