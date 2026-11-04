// What the chess commands tell about the current game: plain data for the command line's JSON, and the lines an AI reads.
import { type Facts, type GameRecord, materialOf, type Side, type Square } from "../core/index.ts";
import { type CurrentGame, currentPlan, drawOfferOf, endOf, type Speaker } from "../games/index.ts";
import { clockLine, type ClockSummary, clockSummaryOf, gameAt } from "./clock.ts";
import { openingLine } from "./opening-book.ts";
import { colourName, compactView, materialText } from "./view.ts";

/** The current game, as the commands give it. */
export interface GameSummary
{
    ai: Side;
    turn: Side;
    moveNumber: number;
    fen: string;
    /** The last moves, numbered: 3.Bc4 Nf6 4.Ng5 d5. */
    lastMoves: string;
    /** The last move, numbered, with its squares. */
    lastMove?: LastMove;
    /** The opening by Lichess's book (D-15): ECO and name, and the move the game left the book at. */
    opening?: string;
    /** When the AI is to move: the facts of the position (D-26), the legal moves of each piece among them. */
    facts?: Facts;
    /** When the AI is to move: the plan it wrote last. */
    plan?: string;
    /** In a game with a time control: the time each side had left when the command ran (D-13). */
    clock?: ClockSummary;
    /** Who offered a draw, while the offer stands (D-65). */
    drawOffer?: Speaker;
    /** When the game is over: how it ended, and its name in the archive once it is there. */
    end?: { result: string; termination?: string; archive?: string; };
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
    /** What the player wrote on the board page that the AI has not been given yet (T-65). */
    words?: string[];
}

/** The game as the commands tell it; a game over with the name it has in the archive, when it is there. */
export function summaryOf(current: CurrentGame, now: Date, archive?: string): GameSummary
{
    const { game, ai } = current;
    const { position, record, lastMove } = game;
    const end = endOf(game);
    const summary: GameSummary = { ai, turn: position.turn, moveNumber: position.moveNumber, fen: position.fen, lastMoves: lastMoves(record, 6) };

    if (lastMove !== undefined) {
        summary.lastMove = { move: lastMoves(record, 1), from: lastMove.from, to: lastMove.to };
    }

    const opening = openingLine(record);
    const clock = clockSummaryOf(current, now);
    const drawOffer = drawOfferOf(current);

    if (drawOffer !== undefined) {
        summary.drawOffer = drawOffer;
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
        summary.facts = game.facts;
        const plan = currentPlan(record);

        if (plan !== undefined) {
            summary.plan = plan;
        }
    }

    return summary;
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

/** Where the game stands: the AI's position to decide on, with its last move unless the lines before named it; the player's turn; or how it ended. */
export function positionLines(game: GameSummary, withLastMove = true): string[]
{
    if (game.end !== undefined || game.turn !== game.ai) {
        return [whereLine(game), ...offerLines(game), ...clockLines(game)];
    }

    return [
        ...headLines(game, withLastMove),
        ...(game.facts === undefined ? [] : compactView(game.facts, game.turn)),
        ...(game.plan === undefined ? [] : [`Plan: ${game.plan}`]),
    ];
}

/** The head of a view: where the game stands, the last move unless the lines before named it, the opening, the material as the player sees it, and the FEN. */
export function headLines(game: GameSummary, withLastMove = true): string[]
{
    return [
        whereLine(game),
        ...offerLines(game),
        ...(withLastMove && game.lastMove !== undefined ? [`Last move: ${lastMoveText(game.lastMove)}.`] : []),
        ...(game.opening === undefined ? [] : [`Opening: ${game.opening}`]),
        `Material: ${materialText(materialOf(game.fen))}`,
        ...clockLines(game),
        `FEN: ${game.fen}`,
    ];
}

/** A move with its squares: 4.Ng5 (f3-g5). */
export function lastMoveText({ move, from, to }: LastMove): string
{
    return `${move} (${from}-${to})`;
}

/** The lines after a move, which the line before named: its note, where the game stands, a warning. closingLines end them. */
export function moveLines({ note, game, warning }: MovePlayed): string[]
{
    return [...(note === undefined ? [] : [`Note: ${note}`]), ...positionLines(game, false), ...(warning === undefined ? [] : [warning])];
}

/** The last lines of a tool's answer: the player's words from the board page, then the next step, which stays the last line. */
export function closingLines(game: GameSummary | undefined, words: readonly string[] = []): string[]
{
    return [...wordLines(words), nextStep(game, words)];
}

/** The player's words from the board page, one line each: lines they broke are joined, so no line of theirs reads as one of Chesspal's. */
export function wordLines(words: readonly string[]): string[]
{
    return words.map((text) => `Player wrote on the board page: «${text.replace(/\s+/g, " ")}»`);
}

/** What the AI does next: the one line every host reads, even where the server's instructions are not shown. Words of the player's ask for an answer. */
export function nextStep(game: GameSummary | undefined, words: readonly string[] = []): string
{
    if (game === undefined) {
        return "Next: ask the player which colour they want and whether they want a clock, then call new_game.";
    }

    if (game.end !== undefined) {
        return words.length === 0
            ? "Next: tell the player how the game ended, with ai_say if they play on the board page; new_game starts another."
            : "Next: answer the player with ai_say; new_game starts another game.";
    }

    if (game.turn === game.ai) {
        return words.length === 0
            ? "Next: choose your move, then call ai_move with it, your plan and any comment."
            : "Next: choose your move, then call ai_move with it, your plan and a comment that answers the player.";
    }

    if (game.drawOffer === "player") {
        return "Next: accept the draw with end_game draw_agreed, or answer with ai_say and wait for the player's move.";
    }

    return words.length === 0 ? "Next: wait for the player's move, then call player_move with it." : "Next: answer the player with ai_say, then wait for their move.";
}

/** Who plays what, from the AI's side. */
export function sidesLine(ai: Side): string
{
    return `you play ${colourName(ai)}, the player ${colourName(ai === "white" ? "black" : "white")}`;
}

/** The draw offer that stands, and how to answer it or what becomes of it (D-65). */
function offerLines({ drawOffer, turn, ai }: GameSummary): string[]
{
    if (drawOffer === "ai") {
        return ["Your draw offer stands until the player moves; if they accept it in the chat, end_game draw_agreed ends the game."];
    }

    if (drawOffer === "player") {
        return [turn === ai ? "The player offers a draw: end_game draw_agreed accepts it; your move declines it." : "The player offers a draw before their move; your next move declines it."];
    }

    return [];
}

/** Who is to move, or how the game ended. */
function clockLines(game: GameSummary): string[]
{
    return game.clock === undefined ? [] : [clockLine(game.clock, game.ai)];
}

function whereLine(game: GameSummary): string
{
    if (game.end !== undefined) {
        const archived = game.end.archive === undefined ? "" : ` Archived in ${game.end.archive}.`;
        return `Game over: ${endText(game.end)}.${archived}`;
    }

    return `${game.turn === game.ai ? "You" : "Player"} (${colourName(game.turn)}) to move, move ${game.moveNumber}.`;
}

function endText({ result, termination }: { result: string; termination?: string; }): string
{
    return termination === undefined ? result : `${result}, ${termination}`;
}

/** The last plies of a record, numbered as a player writes them, from the move number and side of its FEN. */
function lastMoves(record: GameRecord, count: number): string
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
