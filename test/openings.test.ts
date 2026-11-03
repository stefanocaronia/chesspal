import { describe, expect, it } from "vitest";
import { indexOpenings, openingOf, outOfBookMove, readPgn } from "../src/core/index.ts";

const book = indexOpenings([
    "eco\tname\tpgn",
    "C20\tKing's Pawn Game\t1. e4 e5",
    "C44\tKing's Knight Opening: Normal Variation\t1. e4 e5 2. Nf3 Nc6",
    "C50\tItalian Game\t1. e4 e5 2. Nf3 Nc6 3. Bc4",
    "C50\tItalian Game: Giuoco Piano\t1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5",
].join("\n"));

const record = (pgn: string) => readPgn(pgn)[0]!;

describe("the opening", () => {
    it("names the family and the variation of the last book position, in book", () => {
        expect(openingOf(record("1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 *"), book)).toEqual({
            eco: "C50",
            name: "Italian Game: Giuoco Piano",
            family: "Italian Game",
            variation: "Giuoco Piano",
            ply: 6,
            inBook: true,
        });
    });

    it("keeps the last named opening after the game leaves the book, with the move it left at", () => {
        const opening = openingOf(record("1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. d3 *"), book)!;
        expect(opening).toMatchObject({ name: "Italian Game", ply: 5, inBook: false });
        expect(outOfBookMove(opening)).toBe(3);
    });

    it("finds a book position reached in another order", () => {
        expect(openingOf(record("1. Nf3 Nc6 2. e4 e5 *"), book)).toMatchObject({ eco: "C44", variation: "Normal Variation", inBook: true });
    });

    it("has none before the first book position, or from another starting position", () => {
        expect(openingOf(record("1. a3 *"), book)).toBeUndefined();
        expect(openingOf(record('[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]\n\n1. e4 *'), book)).toBeUndefined();
    });

    it("refuses a book line longer than the depth the game is looked up to", () => {
        const moves = Array.from({ length: 21 }, (_, index) => `${index + 1}. Nf3 Nf6 ${index + 1}... Ng1 Ng8`).join(" ");
        expect(() => indexOpenings(`A00\tToo Long\t${moves}`)).toThrow(/past the book's depth/);
    });
});
