import { describe, expect, it } from "vitest";
import { Game, readPgn } from "../src/core/index.ts";
import { endSoundOf, soundOf } from "../src/page/sounds.ts";

describe("the board's sounds", () => {
    it("sound a move, a capture, a check, a mate and a draw by how the board stands after it, and nothing before the first move", () => {
        const after = (pgn: string): Game => new Game(readPgn(pgn)[0]);

        expect(soundOf(new Game())).toBeUndefined();
        expect(soundOf(after("1. e4 *"))).toBe("move");
        expect(soundOf(after("1. e4 d5 2. exd5 *"))).toBe("capture");
        expect(soundOf(after("1. e4 f5 2. Qh5+ *"))).toBe("check");
        expect(soundOf(after("1. f3 e5 2. g4 Qh4# 0-1"))).toBe("mate");
        expect(soundOf(after('[FEN "7k/8/6K1/8/8/8/8/5Q2 w - - 0 1"]\n\n1. Qf7 1/2-1/2'))).toBe("draw");
    });

    it("sound a game ended without a move by how it ended: a resignation, a flag fallen, a draw agreed (T-100)", () => {
        expect(endSoundOf("resignation")).toBe("resign");
        expect(endSoundOf("time")).toBe("flag");
        expect(endSoundOf("agreement")).toBe("draw");
        expect(endSoundOf("checkmate")).toBeUndefined();
        expect(endSoundOf(undefined)).toBeUndefined();
    });
});
