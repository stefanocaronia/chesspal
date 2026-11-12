import { afterEach, describe, expect, it, vi } from "vitest";
import { hasVoice, spokenMoves } from "../src/page/talk/voice.ts";
import { textFor } from "../src/page/text.ts";

const italian = textFor(["it"]).saidMove;
const english = textFor(["en"]).saidMove;

describe("the moves the voice reads", () => {
    it("says the AI's moves in words in the page's language, with figurines or SAN's letters", () => {
        expect(spokenMoves("Gioco ♟︎g4, poi ♞xf6+ e Bb5#.", italian)).toBe("Gioco pedone in g4, poi cavallo prende f6, scacco e alfiere in b5, scacco matto.");
        expect(spokenMoves("12...♜e8 and 13. Nbd2", english)).toBe("12...rook to e8 and 13. knight from b to d2");
        expect(spokenMoves("exd5, then e8=♛+", english)).toBe("pawn takes d5, then pawn to e8, promotes to queen, check");
        expect(spokenMoves("O-O, poi O-O-O+", italian)).toBe("arrocco corto, poi arrocco lungo, scacco");
    });

    it("leaves a square alone, and words that only look like a move", () => {
        expect(spokenMoves("The pawn on e4 holds d5. OK, B4 paper.", english)).toBe("The pawn on e4 holds d5. OK, B4 paper.");
    });
});

describe("the voices of the browser", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("has no voice where the browser cannot speak", () => {
        expect(hasVoice("en")).toBe(false);
    });

    it("has a voice only for the languages the browser lists", () => {
        vi.stubGlobal("speechSynthesis", { getVoices: () => [{ lang: "it-IT", localService: true, default: false }] });

        expect(hasVoice("it")).toBe(true);
        expect(hasVoice("en")).toBe(false);
    });
});
