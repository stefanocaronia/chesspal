import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bookPlies, openingLine } from "../src/commands/answers/index.ts";
import { bookPlaceOf, Game, indexBook, indexOpenings, type OpeningBook, type OpeningIndex, openingOf, outOfBookMove, positionKeysOf, readPgn } from "../src/core/index.ts";

const lines = [
    "eco\tname\tpgn",
    "C20\tKing's Pawn Game\t1. e4 e5",
    "C44\tKing's Knight Opening: Normal Variation\t1. e4 e5 2. Nf3 Nc6",
    "C50\tItalian Game\t1. e4 e5 2. Nf3 Nc6 3. Bc4",
    "C50\tItalian Game: Giuoco Piano\t1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5",
].join("\n");
const book = indexOpenings(lines);
const moves = indexBook(lines);
const standardStart = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const record = (pgn: string) => readPgn(pgn)[0]!;

describe("the opening", () => {
    it("names the family and the variation of the last book position", () => {
        expect(openingOf(record("1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 *"), book)).toEqual({
            eco: "C50",
            name: "Italian Game: Giuoco Piano",
            family: "Italian Game",
            variation: "Giuoco Piano",
            ply: 6,
        });
    });

    it("keeps the last named opening after the game leaves the named positions", () => {
        expect(openingOf(record("1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. d3 *"), book)).toMatchObject({ name: "Italian Game", ply: 5 });
    });

    it("finds a book position reached in another order", () => {
        expect(openingOf(record("1. Nf3 Nc6 2. e4 e5 *"), book)).toMatchObject({ eco: "C44", variation: "Normal Variation" });
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

describe("where the game left the book (D-68)", () => {
    it("counts the plies a line reaches, named or on the way, to the first it does not, and names the last opening reached past it", () => {
        expect(bookPlaceOf(positionKeysOf(record("1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. d3 *")), book, moves)).toMatchObject({ opening: { name: "Italian Game", ply: 5 }, plies: 5 });
        expect(bookPlaceOf(positionKeysOf(record("1. e4 e5 2. Nf3 d6 3. Nc3 Nc6 *")), book, moves)).toMatchObject({ opening: { eco: "C20" }, plies: 3 });
        expect(bookPlaceOf(positionKeysOf(record("1. e4 e5 2. Nf3 Nc6 *")), book)).toMatchObject({ opening: { eco: "C44" }, plies: 0 });
    });

    it("takes a FEN tag of the standard start as the standard start, and has no place for another position", () => {
        expect(bookPlaceOf(positionKeysOf(record(`[FEN "${standardStart}"]\n\n1. e4 e5 2. Nf3 Nc6 *`)), book, moves)).toMatchObject({ opening: { eco: "C44" }, plies: 4 });
        expect(bookPlaceOf(positionKeysOf(record('[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]\n\n1. e4 *')), book, moves)).toBeUndefined();
    });

    it("is the move of the first ply past the book's, White's or Black's, and none while every ply is the book's", () => {
        expect(outOfBookMove(7, 6)).toBe(4);
        expect(outOfBookMove(8, 7)).toBe(4);
        expect(outOfBookMove(1, 0)).toBe(1);
        expect(outOfBookMove(14, 14)).toBeUndefined();
        // Browsed back to a move the book reaches, the game shown is still in it.
        expect(outOfBookMove(10, 14)).toBeUndefined();
    });
});

describe("the book the build made, for the AI and the page alike (D-68)", () => {
    // The page names the opening from the index it fetches, and has the book's plies from the server.
    const index = JSON.parse(readFileSync(new URL("../dist/core/openings.json", import.meta.url), "utf8")) as OpeningIndex;
    const najdorf = "1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3 e5 7. Nb3 Be6";

    it("keeps a game in book while a line reaches every position, past the last named one", () => {
        const game = record(`${najdorf} *`);
        expect(bookPlies(game)).toBe(14);
        expect(openingLine(game)).toBe("B90 Sicilian Defense: Najdorf Variation, English Attack");
        expect(openingOf(game, index)).toMatchObject({ eco: "B90", ply: 11 });
        expect(outOfBookMove(game.moves.length, bookPlies(game))).toBeUndefined();
    });

    it("keeps in book a game whose FEN tag is the standard start", () => {
        const game = record(`[FEN "${standardStart}"]\n\n${najdorf} *`);
        expect(bookPlies(game)).toBe(14);
        expect(openingLine(game)).toBe("B90 Sicilian Defense: Najdorf Variation, English Attack");
    });

    it("finds the same place from a live game's positions as from its record replayed", () => {
        const lines = JSON.parse(readFileSync(new URL("../dist/core/book.json", import.meta.url), "utf8")) as OpeningBook;
        const knights = Array.from({ length: 11 }, (_, index) => `${2 * index + 1}. Nf3 Nf6 ${2 * index + 2}. Ng1 Ng8`).join(" ");
        const games = [
            `${najdorf} *`,
            "1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. Rg1 Nf6 *",
            `${knights} *`,
            "1. Nf3 c5 2. e4 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 *",
        ].map((pgn) => record(pgn));

        expect(games[2]!.moves.length).toBeGreaterThan(40);
        expect(bookPlaceOf(positionKeysOf(games[3]!), index, lines)).toMatchObject({ opening: { eco: "B90" }, plies: 10 });

        for (const game of games) {
            expect(bookPlaceOf(new Game(game).positionKeys, index, lines)).toEqual(bookPlaceOf(positionKeysOf(game), index, lines));
        }
    });

    it("gives a live game played move by move the same line at every ply as its record replayed", () => {
        const game = new Game();

        for (const { san } of record(`${najdorf} 8. Qd2 h5 9. h3 Nbd7 10. O-O-O b5 *`).moves) {
            game.play(san);
            expect(openingLine(game)).toBe(openingLine({ ...game.record }));
        }

        expect(openingLine(game)).toBe("B90 Sicilian Defense: Najdorf Variation, English Attack (out of book since move 8)");
    });

    it("says the move the game left the book at, a move of White's or of Black's", () => {
        expect(openingLine(record(`${najdorf} 8. Qd2 h5 9. h3 Nbd7 *`))).toBe("B90 Sicilian Defense: Najdorf Variation, English Attack (out of book since move 8)");
        expect(openingLine(record("1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. Rg1 Nf6 *"))).toBe("C50 Italian Game: Giuoco Piano (out of book since move 4)");
        expect(openingLine(record("1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Rb8 5. d4 *"))).toBe("C53 Italian Game: Classical Variation (out of book since move 4)");
    });
});
