import { describe, expect, it } from "vitest";
import { Game } from "../src/core/index.ts";
import { backOf, motionOf, playedOn, rearranged } from "../src/page/board/motion.ts";
import { piecesOf } from "../src/page/board/squares.ts";

const played = (...moves: string[]): Game => {
    const game = new Game();
    moves.forEach((move) => game.play(move));
    return game;
};

describe("how the pieces move on the board", () => {
    it("slides a move's piece over the one it takes, but for a piece the player dragged there", () => {
        const before = played("e4", "d5");
        const after = played("e4", "d5", "exd5");
        const move = after.lastMove!;
        const was = piecesOf(before.position.fen);
        expect(playedOn(was, piecesOf(after.position.fen), move)).toBe(true);
        expect(motionOf(move, undefined, undefined, was)).toEqual({ slides: new Map([["d5", "e4"]]), taken: { square: "d5", letter: "p" } });
        expect(motionOf(move, "e4d5", undefined, was)).toEqual({ slides: new Map() });
    });

    it("takes a pawn en passant from beside the square it lands on", () => {
        const before = played("e4", "a6", "e5", "d5");
        const after = played("e4", "a6", "e5", "d5", "exd6");
        expect(motionOf(after.lastMove!, undefined, undefined, piecesOf(before.position.fen)).taken).toEqual({ square: "d5", letter: "p" });
    });

    it("slides a castling's rook always, and home again when the move is taken back", () => {
        const after = played("e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "O-O");
        const castling = after.lastMove!;
        expect(motionOf(castling, "e1g1", undefined, new Map()).slides).toEqual(new Map([["f1", "h1"]]));
        expect(backOf(castling).slides).toEqual(new Map([["e1", "g1"], ["h1", "f1"]]));
    });

    it("moves each piece of a jump through the game to the nearest square like it, fading the rest", () => {
        const start = piecesOf(new Game().position.fen);
        const later = piecesOf(played("e4", "e5", "Nf3", "Nc6", "Nxe5", "Nxe5").position.fen);
        const motion = rearranged(start, later);
        expect(motion.slides.get("e4")).toBe("e2");
        expect(motion.slides.get("e5")).toBe("b8");
        expect(motion.gone).toEqual(expect.arrayContaining([{ square: "g1", letter: "N" }, { square: "e7", letter: "p" }]));
        expect(motion.appear?.size).toBe(0);
    });
});
