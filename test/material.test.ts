import { describe, expect, it } from "vitest";
import { materialOf } from "../src/core/index.ts";

describe("the material", () => {
    it("is even, with nothing taken, at the start", () => {
        expect(materialOf("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")).toEqual({ taken: { white: [], black: [] }, balance: 0 });
    });

    it("lists what each side took, the most valuable first, and the balance in pawns", () => {
        // The Morra Gambit accepted, after 12.Bxe6 fxe6: Black took a bishop and two pawns, White a bishop and a pawn.
        expect(materialOf("r2q1rk1/pp2b1pp/2nppn2/4p3/4P3/2N1BN1P/PP2QPP1/R2R2K1 w - - 0 13")).toEqual({ taken: { white: ["B", "P"], black: ["B", "P", "P"] }, balance: -1 });
    });

    it("counts a promoted piece where it stands, and the pawn it was as gone", () => {
        expect(materialOf("Q3k3/8/8/8/8/8/1PPPPPPP/RNBQKBNR b KQ - 0 1")).toMatchObject({ taken: { black: ["P"] }, balance: 2 * 9 + 2 * 5 + 4 * 3 + 7 });
    });
});
