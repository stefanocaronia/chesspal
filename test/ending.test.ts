import { describe, expect, it } from "vitest";
import { Game, readPgn } from "../src/core/index.ts";
import { type EndSeen, type GameState, howEnded, seeEnd } from "../src/page/ending.ts";

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

describe("the end the page saw", () => {
    const read = (...states: GameState[]): boolean[] => {
        let seen: EndSeen = { state: states[0], saw: false };
        return states.map((state) => (seen = seeEnd(seen, state)).saw);
    };

    it("is seen when the game goes from going on to over, and stays while it is over (D-77)", () => {
        expect(read(undefined, "going", "going", "over", "over", "over")).toEqual([false, false, false, true, true, true]);
    });

    it("is not seen on a game already over when the page reads it, nor before the first game", () => {
        expect(read(undefined, "over", "over")).toEqual([false, false, false]);
        expect(read("over", "over")).toEqual([false, false]);
        expect(read(undefined, undefined)).toEqual([false, false]);
    });

    it("ends with the next game, and with a game opened in analysis", () => {
        expect(read("going", "over", "going", "over")).toEqual([false, true, false, true]);
        expect(read("going", "over", undefined, "over")).toEqual([false, true, false, false]);
    });
});
