// The material on the board (D-20): what each side has taken and who is ahead, counted from the pieces left; a count, never a judgment of the position.
import type { PieceLetter } from "./facts.ts";
import type { Side } from "./game.ts";

/** What each side has taken, the most valuable first, and the material balance in pawns: above zero when White is ahead. */
export interface Material
{
    readonly taken: Readonly<Record<Side, readonly PieceLetter[]>>;
    readonly balance: number;
}

/** The material of a FEN: the pieces each side took, from what the other has left against a full set, and the balance at 1, 3, 3, 5 and 9 pawns. */
export function materialOf(fen: string): Material
{
    const placement = fen.split(" ")[0] ?? "";
    const count = (letter: string): number => placement.split(letter).length - 1;
    const takenFrom = (side: Side): PieceLetter[] => pieces.flatMap((piece) => Array<PieceLetter>(Math.max(0, fullSet[piece] - count(side === "white" ? piece : piece.toLowerCase()))).fill(piece));
    const balance = pieces.reduce((sum, piece) => sum + values[piece] * (count(piece) - count(piece.toLowerCase())), 0);
    return Object.freeze({ taken: Object.freeze({ white: Object.freeze(takenFrom("black")), black: Object.freeze(takenFrom("white")) }), balance });
}

// The pieces that can be taken, the most valuable first, with how many each side starts with and their usual value in pawns.
const pieces: readonly Exclude<PieceLetter, "K">[] = ["Q", "R", "B", "N", "P"];
const fullSet: Readonly<Record<Exclude<PieceLetter, "K">, number>> = { Q: 1, R: 2, B: 2, N: 2, P: 8 };
const values: Readonly<Record<Exclude<PieceLetter, "K">, number>> = { Q: 9, R: 5, B: 3, N: 3, P: 1 };
