import { describe, expect, it } from "vitest";
import { readPgn } from "../src/core/index.ts";
import { pliesOf } from "../src/page/plies.ts";

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
});
