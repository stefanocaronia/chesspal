import { describe, expect, it } from "vitest";
import { readPgn } from "../src/core/index.ts";
import { talkLimits } from "../src/games/index.ts";
import { aiSpoke, aiWords, playerWords, pliesOf, talkLimits as pageLimits } from "../src/page/plies.ts";

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

    it("show the AI's words since the player's move before its last ones, comments and lines in the order said, never none once it spoke", () => {
        // Black is the AI: 23... h6 is its move, 24. Rd8+ the player's.
        const plies = pliesOf(readPgn('[FEN "6k1/5ppp/8/8/8/8/5PPP/3R2K1 b - - 0 23"]\n\n23... h6 {Air for the king.} 24. Rd8+ *')[0]!);
        const before = { who: "ai", text: "Your move.", ply: 0 } as const;
        const after = { who: "ai", text: "Check, I see.", ply: 2 } as const;
        const alsoAfter = { who: "ai", text: "Let me think.", ply: 2 } as const;

        expect(aiWords([], "black", [])).toEqual([]);
        expect(aiWords([], "black", [before])).toEqual(["Your move."]);
        expect(aiWords(plies, "black", [before])).toEqual(["Your move.", "Air for the king."]);
        // The player moved since: the last words stay until new ones come.
        expect(aiWords(plies, "black", [before, { who: "player", text: "Hi", ply: 2 }])).toEqual(["Your move.", "Air for the king."]);
        expect(aiWords(plies, "black", [before, after, alsoAfter])).toEqual(["Check, I see.", "Let me think."]);
    });

    it("count each time the AI spoke, its comments and its lines, never the player's", () => {
        const plies = pliesOf(readPgn('[FEN "6k1/5ppp/8/8/8/8/5PPP/3R2K1 b - - 0 23"]\n\n23... h6 {Air for the king.} 24. Rd8+ {A check.} *')[0]!);
        const talk = [{ who: "ai", text: "Your move.", ply: 0 }, { who: "player", text: "Hi", ply: 2 }] as const;

        expect(aiSpoke([], "black", [])).toBe(0);
        expect(aiSpoke(plies, "black", talk)).toBe(2);
    });

    it("show the player's last words, those sent with their move included, until they write again", () => {
        const plies = pliesOf(readPgn("1. e4 e5 2. Nf3 *")[0]!);
        const sent = { who: "player", text: "Before Nf3.", ply: 2, heard: "answered" } as const;
        const withMove = { who: "player", text: "With Nf3.", ply: 3, heard: "sent" } as const;

        expect(playerWords(plies, "black", [sent, { who: "ai", text: "Hm.", ply: 3 }, withMove])).toEqual([withMove]);
        expect(playerWords(plies.slice(0, 2), "black", [sent])).toEqual([sent]);
        // After 2...d6 the player still sees what they wrote before 2.Nf3.
        const later = pliesOf(readPgn("1. e4 e5 2. Nf3 d6 3. c3 *")[0]!);
        expect(playerWords(later, "black", [sent, { who: "ai", text: "Hm.", ply: 3 }])).toEqual([sent]);
        expect(playerWords(later, "black", [])).toEqual([]);
    });

    it("hold the player's words to the server's limits", () => {
        expect(pageLimits).toEqual({ line: talkLimits.player });
    });
});
