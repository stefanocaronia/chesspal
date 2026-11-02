import { describe, expect, it } from "vitest";
import { Game, type GameRecord, readPgn, writePgn } from "../src/core/index.ts";

// Morphy against Duke Karl and Count Isouard, Paris 1858.
const opera = "e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7 Qb8+ Nxb8 Rd8#"
    .split(" ");

describe("writing PGN", () => {
    it("writes the seven tags first, then the others, and the moves with their judgments", () => {
        const record: GameRecord = {
            tags: { Annotator: "Chesspal", White: "Morphy", Event: "Paris" },
            moves: [{ san: "e4", nags: [1], comment: "The open game." }, { san: "e5" }, { san: "Nf3", nags: [146, 5] }],
        };

        expect(writePgn(record)).toBe(
            '[Event "Paris"]\n[Site "?"]\n[Date "????.??.??"]\n[Round "?"]\n[White "Morphy"]\n[Black "?"]\n[Result "*"]\n[Annotator "Chesspal"]\n\n'
                + "1. e4! {The open game.} 1... e5 2. Nf3!? $146 *\n",
        );
    });

    it("numbers black's first move from the FEN, announces the FEN with SetUp, and escapes the tags", () => {
        const fen = "4k3/4p3/8/8/8/8/8/4K3 b - - 0 12";
        const pgn = writePgn({ tags: { FEN: fen, White: 'Say "hi"\n\\ there' }, moves: [{ san: "e5" }, { san: "Kd2" }] });

        expect(pgn).toContain('[White "Say \\"hi\\" \\\\ there"]');
        expect(pgn).toContain(`[Result "*"]\n[SetUp "1"]\n[FEN "${fen}"]\n`);
        expect(pgn.endsWith("\n\n12... e5 13. Kd2 *\n")).toBe(true);
        expect(writePgn({ tags: { FEN: fen, SetUp: "1" }, moves: [] })).toContain(`[SetUp "1"]\n[FEN "${fen}"]\n`);
    });

    it("numbers black's move again after a comment or a NAG of white's, and cleans the comments", () => {
        const pgn = writePgn({
            tags: {},
            comment: " a } b ",
            moves: [{ san: "e4", nags: [1] }, { san: "e5" }, { san: "Nf3", nags: [146] }, { san: "Nc6" }, { san: "Bb5", comment: "x }\n y" }, { san: "a6" }],
        });

        expect(pgn.endsWith("\n\n{a b} 1. e4! e5 2. Nf3 $146 2... Nc6 3. Bb5 {x y} 3... a6 *\n")).toBe(true);
    });

    it("keeps its lines under 80 characters", () => {
        const game = new Game({ tags: {}, moves: opera.map((san) => ({ san, comment: "A comment long enough to wrap the line." })) });
        const lines = writePgn(game.record).split("\n");

        expect(lines.length).toBeGreaterThan(30);
        expect(lines.every((line) => line.length < 80)).toBe(true);
    });
});

describe("reading PGN", () => {
    it("reads back what it writes", () => {
        const game = new Game({ tags: { Event: "Paris", Site: "?", Date: "1858.??.??", Round: "?", White: "Morphy", Black: "Allies" }, comment: "An opera.", moves: [] });

        for (const san of opera) {
            game.play(san);
        }

        game.annotate(18, { nags: [2], comment: "It opens the queenside to White's pieces." });
        game.annotate(31, { nags: [3, 18] });

        expect(readPgn(writePgn(game.record))).toEqual([game.record]);
    });

    it("reads ! and ? as NAGs, NAGs, comments and move numbers in any form", () => {
        const [record] = readPgn('[Event "x"]\n\n{Before.} 1.e4!? {A} $14 1...e5 ?! 2. Nf3 {B}\n{C} 2... Nc6 3 . Bb5 *');

        expect(record).toEqual({
            tags: { Event: "x", Result: "*" },
            comment: "Before.",
            moves: [{ san: "e4", nags: [5, 14], comment: "A" }, { san: "e5", nags: [6] }, { san: "Nf3", comment: "B C" }, { san: "Nc6" }, { san: "Bb5" }],
        });
    });

    it("reads a file with a byte order mark and Windows line ends", () => {
        const [record] = readPgn('﻿[Event "x"]\r\n\r\n1. e4 e5\r\n2. Nf3 *\r\n');

        expect(record).toEqual({ tags: { Event: "x", Result: "*" }, moves: [{ san: "e4" }, { san: "e5" }, { san: "Nf3" }] });
    });

    it("skips variations, rest-of-line comments and escape lines", () => {
        const [record] = readPgn("% escape line\n1. e4 (1. d4 d5 (1... Nf6 {deep})) e5 ; a note\n2. Nf3 *");

        expect(record?.moves).toEqual([{ san: "e4" }, { san: "e5" }, { san: "Nf3" }]);
    });

    it("reads several games, with or without a result between them", () => {
        const games = readPgn('[White "A"]\n\n1. e4 1-0\n\n[White "B"]\n\n1. d4\n\n[White "C"]\n\n1. c4 *\n');

        expect(games.map((game) => [game.tags.White, game.tags.Result, game.moves[0]?.san])).toEqual([["A", "1-0", "e4"], ["B", undefined, "d4"], ["C", "*", "c4"]]);
    });

    it("writes each move as SAN, however the PGN wrote it", () => {
        const [record] = readPgn("1. Ng1f3 e7-e5 2. e4 Nf6 3. Be2 d5 4. 0-0 d4 5. c4 dxc3 e.p. *");

        expect(record?.moves.map((move) => move.san)).toEqual(["Nf3", "e5", "e4", "Nf6", "Be2", "d5", "O-O", "d4", "c4", "dxc3"]);
    });

    it("names the line of a move it cannot play", () => {
        expect(() => readPgn('[Event "x"]\n\n1. e4 e5\n2. Ke3 *')).toThrow("Line 4, move 2: Ke3 is not legal here, with White to move.");
        expect(() => readPgn("1. d4 d5 2. Nf3 Nf6 3. Nd2 *")).toThrow("Line 1, move 3: Nd2 could be Nbd2 or Nfd2: say which.");
        expect(() => readPgn("1. e4\n-- 2. d4 *")).toThrow('Line 2, move 1: "--" is not a move');
    });

    it("names the line of what is not PGN", () => {
        expect(() => readPgn("1. e4\n{oops")).toThrow("Line 2: this comment is never closed with }.");
        expect(() => readPgn("1. e4 ) e5")).toThrow("Line 1: this ) closes no variation: remove it.");
        expect(() => readPgn("1. e4 (1. d4")).toThrow("Line 1: a variation is never closed with ).");
        expect(() => readPgn("1. e4 $300")).toThrow("Line 1: $300 is not a NAG");
        expect(() => readPgn("1. e4!!! e5")).toThrow('Line 1: "!!!" is not a judgment');
        expect(() => readPgn("1. e4 ] e5")).toThrow('Line 1: "]" is not PGN: remove it.');
        expect(() => readPgn('[FEN "nonsense"]\n\n1. e4')).toThrow(/^Line 3: The FEN tag is not a valid position/);
    });
});
