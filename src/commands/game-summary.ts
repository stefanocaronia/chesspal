// What the chess commands tell about the current game: plain data for the command line's JSON, and the lines an AI reads.
import type { Facts, GameRecord, Side, Square } from "../core/index.ts";
import { type CurrentGame, currentPlan, endOf, loadGame } from "../games/index.ts";
import { colourName, compactView } from "./view.ts";

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
    /** When the AI is to move: the facts of the position (D-26), the legal moves of each piece among them. */
    facts?: Facts;
    /** When the AI is to move: the plan it wrote last. */
    plan?: string;
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
}

/** The game as the commands tell it; a game over with the name it has in the archive, when it is there. */
export function summaryOf(current: CurrentGame, archive?: string): GameSummary
{
    const { game, ai } = current;
    const { position, record, lastMove } = game;
    const end = endOf(game);
    const summary: GameSummary = { ai, turn: position.turn, moveNumber: position.moveNumber, fen: position.fen, lastMoves: lastMoves(record, 6) };

    if (lastMove !== undefined) {
        summary.lastMove = { move: lastMoves(record, 1), from: lastMove.from, to: lastMove.to };
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

/** The current game, refused when there is none or when it is over. */
export function gameGoingOn(folder: string): CurrentGame
{
    const current = loadGame(folder);

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
        return [whereLine(game)];
    }

    return [
        ...headLines(game, withLastMove),
        ...(game.facts === undefined ? [] : compactView(game.facts, game.turn)),
        ...(game.plan === undefined ? [] : [`Plan: ${game.plan}`]),
    ];
}

/** The head of a view: where the game stands, the last move unless the lines before named it, and the FEN. */
export function headLines(game: GameSummary, withLastMove = true): string[]
{
    return [whereLine(game), ...(withLastMove && game.lastMove !== undefined ? [`Last move: ${lastMoveText(game.lastMove)}.`] : []), `FEN: ${game.fen}`];
}

/** A move with its squares: 4.Ng5 (f3-g5). */
export function lastMoveText({ move, from, to }: LastMove): string
{
    return `${move} (${from}-${to})`;
}

/** The lines after a move, which the line before named: its note, where the game stands, a warning, the next step. */
export function moveLines({ note, game, warning }: MovePlayed): string[]
{
    return [...(note === undefined ? [] : [`Note: ${note}`]), ...positionLines(game, false), ...(warning === undefined ? [] : [warning]), nextStep(game)];
}

/** What the AI does next: the one line every host reads, even where the server's instructions are not shown. */
export function nextStep(game: GameSummary | undefined): string
{
    if (game === undefined) {
        return "Next: ask the player which colour they want, then call new_game.";
    }

    if (game.end !== undefined) {
        return "Next: tell the player how the game ended; new_game starts another.";
    }

    return game.turn === game.ai ? "Next: choose your move, then call ai_move with it, your plan and your comment." : "Next: wait for the player's move, then call player_move with it.";
}

/** Who plays what, from the AI's side. */
export function sidesLine(ai: Side): string
{
    return `you play ${colourName(ai)}, the player ${colourName(ai === "white" ? "black" : "white")}`;
}

/** Who is to move, or how the game ended. */
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
