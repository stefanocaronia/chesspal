// What the AI draws on the board to show what it says, as the analyst (D-69) and the opponent with the helps on (D-78): arrows and squares, as PGN's
// %cal and %csl write them.
import { z } from "zod";
import { arrowOf, type DrawnArrow, type DrawnSquare, squareOf } from "../../core/index.ts";

/** The most a note of the AI's on a move may hold: a few sentences. */
const noteLimit = 700;

// The most arrows, and the most squares, on one move.
const drawLimit = 6;

/** A note of the AI's on a move, as its input reads it: on one line of commands, so without brackets or braces. */
export const noteInput = z.string().trim().min(1).max(noteLimit).regex(/^[^[\]{}]*$/, "write it without [ ] { }");

// A drawing as the AI may write it, spaced or with a dash, as PGN writes it: "R f2 e1" and "Rf2-e1" are Rf2e1 (Priya).
const drawing = z.string().overwrite((text) => text.replace(/[\s-]+/g, ""));

/** The arrows the AI draws, as their input reads them. */
export const arrowsInput = z.array(
    drawing.regex(/^[GRYB][a-h][1-8][a-h][1-8]$/, "an arrow is a colour's letter and two squares: Gf6e4; a single square goes in squares")
        .refine((arrow) => arrow.slice(1, 3) !== arrow.slice(3, 5), "an arrow goes from a square to another: a single square goes in squares"),
).max(drawLimit).optional()
    .describe(
        "arrows on the board, as PGN's %cal writes them: Rf2e1. G green: the better move or the good idea; R red: a threat or the mistake; Y yellow: another way; B blue: a plan.",
    );

/** The squares the AI marks, as their input reads them. */
export const squaresInput = z.array(drawing.regex(/^[GRYB][a-h][1-8]$/, "a square is a colour's letter and the square: Rf2")).max(drawLimit).optional()
    .describe("squares to mark, as PGN's %csl writes them: Rf2; colours as for arrows");

/** The arrows and squares drawn, those that read; none of either left out. */
export function drawingsOf(arrows: readonly string[] = [], squares: readonly string[] = []): { arrows?: DrawnArrow[]; squares?: DrawnSquare[]; }
{
    const drawnArrows = arrows.map(arrowOf).filter((arrow) => arrow !== undefined);
    const drawnSquares = squares.map(squareOf).filter((square) => square !== undefined);
    return { ...(drawnArrows.length === 0 ? {} : { arrows: drawnArrows }), ...(drawnSquares.length === 0 ? {} : { squares: drawnSquares }) };
}
