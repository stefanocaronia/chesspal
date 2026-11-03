import { describe, expect, it } from "vitest";
import { readPgn } from "../src/core/index.ts";
import { lastWords, pliesOf } from "../src/page/plies.ts";

describe("the moves on the page", () => {
    it("number the moves of a game that starts with Black to move", () => {
        const [record] = readPgn('[FEN "6k1/5ppp/8/8/8/8/5PPP/3R2K1 b - - 0 23"]\n\n23... h6 24. Rd8+ Kh7 *');

        expect(pliesOf(record!)).toEqual([
            { san: "h6", side: "black", number: 23 },
            { san: "Rd8+", side: "white", number: 24 },
            { san: "Kh7", side: "black", number: 24 },
        ]);
    });

    it("keep only the words of a comment, never the AI's plan an ended game shows", () => {
        const [record] = readPgn("1. e4 {[%plan Take the centre.]} e5 {The open game. [%plan Develop the knights.]} 1/2-1/2");

        expect(pliesOf(record!).map((ply) => ply.comment)).toEqual([undefined, "The open game."]);
    });

    it("show the AI's last words: what it said on the page after its last move, or else that move's comment", () => {
        const plies = pliesOf(readPgn('[FEN "6k1/5ppp/8/8/8/8/5PPP/3R2K1 b - - 0 23"]\n\n23... h6 {Air for the king.} 24. Rd8+ *')[0]!);
        const before = { who: "ai", text: "Your move.", ply: 0 } as const;
        const after = { who: "ai", text: "Check, I see.", ply: 2 } as const;

        expect(lastWords(plies, "black", [])).toBe("Air for the king.");
        expect(lastWords(plies, "black", [before])).toBe("Air for the king.");
        expect(lastWords(plies, "black", [before, { who: "player", text: "Hi", ply: 2 }])).toBe("Air for the king.");
        expect(lastWords(plies, "black", [before, after])).toBe("Check, I see.");
        expect(lastWords([], "black", [before])).toBe("Your move.");
    });
});
