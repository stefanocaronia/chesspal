import { describe, expect, it } from "vitest";
import { readPgn } from "../src/core/index.ts";
import { talkLimits } from "../src/games/index.ts";
import { aiSpoke, aiWords, playerWords, pliesOf, talkLimits as pageLimits, withBook } from "../src/page/plies.ts";

describe("the moves on the page", () => {
    it("number the moves of a game that starts with Black to move", () => {
        const [record] = readPgn('[FEN "6k1/5ppp/8/8/8/8/5PPP/3R2K1 b - - 0 23"]\n\n23... h6 24. Rd8+ Kh7 *');

        expect(pliesOf(record!)).toEqual([
            { san: "h6", side: "black", number: 23 },
            { san: "Rd8+", side: "white", number: 24 },
            { san: "Kh7", side: "black", number: 24 },
        ]);
    });

    it("carry the book's badge on the book's first moves while the game goes on, never over the AI's own review", () => {
        const [record] = readPgn("1. e4 e5 {[%badge best]} 2. Nf3 Nc6 *");
        const badges = (book: number): unknown[] => withBook(pliesOf(record!), book).map((ply) => ply.review?.badge);

        expect(badges(3)).toEqual(["book", "best", "book", undefined]);
        expect(badges(0)).toEqual([undefined, "best", undefined, undefined]);
    });

    it("keep only the words of a comment, never the AI's plan an ended game shows nor the mark of a draw offer", () => {
        const [record] = readPgn("1. e4 {[%plan Take the centre.]} e5 {The open game. [%plan Develop the knights.]} 2. Nf3 {(=)} Nc6 {(=) No, thanks.} 1/2-1/2");

        expect(pliesOf(record!).map((ply) => ply.comment)).toEqual([undefined, "The open game.", undefined, "No, thanks."]);
    });

    it("show all the AI's words of the game, comments and lines in the order said", () => {
        // Black is the AI: 23... h6 is its move, 24. Rd8+ the player's.
        const plies = pliesOf(readPgn('[FEN "6k1/5ppp/8/8/8/8/5PPP/3R2K1 b - - 0 23"]\n\n23... h6 {Air for the king.} 24. Rd8+ *')[0]!);
        const before = { who: "ai", text: "Your move.", ply: 0 } as const;
        const after = { who: "ai", text: "Check, I see.", ply: 2 } as const;
        const alsoAfter = { who: "ai", text: "Let me think.", ply: 2 } as const;

        expect(aiWords([], "black", [])).toEqual([]);
        expect(aiWords([], "black", [before])).toEqual(["Your move."]);
        expect(aiWords(plies, "black", [before, { who: "player", text: "Hi", ply: 2 }])).toEqual(["Your move.", "Air for the king."]);
        expect(aiWords(plies, "black", [before, after, alsoAfter])).toEqual(["Your move.", "Air for the king.", "Check, I see.", "Let me think."]);
    });

    it("count each time the AI spoke, its comments and its lines, never the player's", () => {
        const plies = pliesOf(readPgn('[FEN "6k1/5ppp/8/8/8/8/5PPP/3R2K1 b - - 0 23"]\n\n23... h6 {Air for the king.} 24. Rd8+ {A check.} *')[0]!);
        const talk = [{ who: "ai", text: "Your move.", ply: 0 }, { who: "player", text: "Hi", ply: 2 }] as const;

        expect(aiSpoke([], "black", [])).toBe(0);
        expect(aiSpoke(plies, "black", talk)).toBe(2);
    });

    it("show all the player's words of the game, never the AI's", () => {
        const sent = { who: "player", text: "Before Nf3.", ply: 2, heard: "answered" } as const;
        const withMove = { who: "player", text: "With Nf3.", ply: 3, heard: "sent" } as const;

        expect(playerWords([sent, { who: "ai", text: "Hm.", ply: 3 }, withMove])).toEqual([sent, withMove]);
        expect(playerWords([])).toEqual([]);
    });

    it("hold the player's words to the server's limits", () => {
        expect(pageLimits).toEqual({ line: talkLimits.player });
    });
});
