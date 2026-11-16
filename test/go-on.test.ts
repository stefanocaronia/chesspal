import { describe, expect, it } from "vitest";
import { Game, readPgn } from "../src/core/index.ts";
import { goOnFrom } from "../src/page/game/go-on.ts";

describe("what a new game started in analysis goes on from", () => {
    it("is the moves to the position shown, as PGN, without comments or judgments", () => {
        const game = new Game({
            tags: { White: "Ann", Black: "Bob", CarriedPlies: "1" },
            moves: [{ san: "e4", nags: [1], comment: "The open game." }, { san: "e5" }, { san: "Nf3", nags: [2] }],
        });
        const [record] = readPgn(goOnFrom(game));

        expect(record!.moves).toEqual([{ san: "e4" }, { san: "e5" }, { san: "Nf3" }]);
        expect(record!.tags.White).not.toBe("Ann");
        expect(record!.tags.CarriedPlies).toBeUndefined();
    });

    it("keeps the FEN the game started from", () => {
        const fen = "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1";
        const game = new Game({ tags: { SetUp: "1", FEN: fen }, moves: [{ san: "e3" }, { san: "Kd7" }] });
        const [record] = readPgn(goOnFrom(game));

        expect(record!.tags.FEN).toBe(fen);
        expect(record!.moves.map((move) => move.san)).toEqual(["e3", "Kd7"]);
        expect(new Game(record!).position.fen).toBe(game.position.fen);
    });

    it("is the position's FEN when no move led to it", () => {
        const fen = "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1";
        expect(goOnFrom(new Game({ tags: { SetUp: "1", FEN: fen }, moves: [] }))).toBe(fen);
        expect(goOnFrom(new Game({ tags: {}, moves: [] }))).toBe(new Game({ tags: {}, moves: [] }).position.fen);
    });
});
