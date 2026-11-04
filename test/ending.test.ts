import { describe, expect, it } from "vitest";
import { Game, readPgn } from "../src/core/index.ts";
import { howEnded } from "../src/page/ending.ts";

describe("how a game ended", () => {
    it("is the board's ending when the board ended it", () => {
        const mated = new Game(readPgn("1. f3 e5 2. g4 Qh4# 0-1")[0]);

        expect(howEnded(mated.outcome, undefined)).toBe("checkmate");
    });

    it("is a resignation, an agreement or a flag that fell by the record's Termination", () => {
        const going = new Game().outcome;

        expect(howEnded(going, "White resigns")).toBe("resignation");
        expect(howEnded(going, "White resigns and Black cannot mate")).toBe("resignation");
        // Games played elsewhere (D-68): chess.com's, in English and Italian, and Lichess's.
        expect(howEnded(going, "Sebysa13 ha vinto per abbandono")).toBe("resignation");
        expect(howEnded(going, "Sebysa13 won by resignation")).toBe("resignation");
        expect(howEnded(going, "Time forfeit")).toBe("time");
        expect(howEnded(going, "Game drawn by agreement")).toBe("agreement");
        expect(howEnded(going, "Normal")).toBeUndefined();
        expect(howEnded(going, "draw agreed")).toBe("agreement");
        expect(howEnded(going, "Black lost on time")).toBe("time");
        expect(howEnded(going, "Black ran out of time and White cannot mate")).toBe("time");
    });

    it("is unknown while the game goes on or the record does not say", () => {
        const going = new Game().outcome;

        expect(howEnded(going, undefined)).toBeUndefined();
        expect(howEnded(going, "Abandoned")).toBeUndefined();
    });
});
