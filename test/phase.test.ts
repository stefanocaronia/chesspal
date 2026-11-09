import { describe, expect, it } from "vitest";
import { phaseOf, verdictOf } from "../src/page/app/phase.ts";
import { textFor } from "../src/page/text.ts";

const text = textFor(["en"]);
const game = { pgn: "" };

describe("where the page stands", () => {
    it("is in analysis whatever the game, and nowhere until the server has sent one", () => {
        expect(phaseOf(true, undefined, false, false)).toBe("analysis");
        expect(phaseOf(true, game, false, false)).toBe("analysis");
        expect(phaseOf(false, undefined, false, false)).toBeUndefined();
    });

    it("goes on with a game not over, and sets the table before the first and after one it did not see end (D-77)", () => {
        expect(phaseOf(false, game, false, false)).toBe("going");
        expect(phaseOf(false, null, false, false)).toBe("idle");
        expect(phaseOf(false, game, true, false)).toBe("idle");
        expect(phaseOf(false, game, true, true)).toBe("over");
    });
});

describe("the header's word on the game", () => {
    it("says the analysis, the table set and how a game ended", () => {
        expect(verdictOf("analysis", undefined, undefined, undefined, false, text)).toEqual({ kind: "analysis", verdict: text.analysing });
        expect(verdictOf("idle", undefined, undefined, undefined, false, text)).toEqual({ kind: "idle", verdict: text.noGameNow });
        expect(verdictOf("over", "checkmate", "white", undefined, false, text)).toEqual({ kind: "over", verdict: text.verdict("checkmate", "white") });
    });

    it("says a draw offered, by either side, and declined, while the game goes on (D-65)", () => {
        expect(verdictOf("going", undefined, undefined, "ai", false, text)).toEqual({ kind: "offer", verdict: text.offers });
        expect(verdictOf("going", undefined, undefined, "player", false, text)).toEqual({ kind: "offer", verdict: text.drawOffered });
        expect(verdictOf("going", undefined, undefined, undefined, true, text)).toEqual({ kind: "offer", verdict: text.declines });
        expect(verdictOf("going", undefined, undefined, undefined, false, text)).toEqual({});
    });
});
