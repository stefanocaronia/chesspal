import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hasVoice, hush, onReading, reading, skip, speak, spokenMoves } from "../src/page/talk/voice.ts";
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

describe("the bubble the voice reads", () => {
    const voice = textFor(["en"]);
    let said: FakeUtterance[];
    let speaking: boolean;

    beforeEach(() => {
        vi.useFakeTimers();
        said = [];
        speaking = false;
        vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
        vi.stubGlobal("speechSynthesis", {
            getVoices: () => [{ lang: "en-GB", localService: true, default: true }],
            speak: (utterance: FakeUtterance) => said.push(utterance),
            cancel: vi.fn(),
            resume: () => undefined,
            get speaking()
            {
                return speaking;
            },
        });
    });

    afterEach(() => {
        hush();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    const start = (): void => {
        speaking = true;
        said.at(-1)!.onstart?.();
    };

    it("reads the bubbles one after the other, each known as read only once the voice starts it", () => {
        speak([{ key: "one", words: "First." }, { key: "two", words: "Then **Nf3**." }], voice);
        vi.advanceTimersByTime(150);

        expect(said.map((utterance) => utterance.text)).toEqual(["First."]);
        expect(reading()).toBeUndefined();
        start();
        expect(reading()).toBe("one");
        said[0]!.onend?.();
        expect(said.map((utterance) => utterance.text)).toEqual(["First.", "Then knight to f3."]);
        expect(reading()).toBeUndefined();
        start();
        expect(reading()).toBe("two");
        said[1]!.onend?.();
        expect(reading()).toBeUndefined();
    });

    it("skips the bubble read and goes on with the next, and tells who listens", () => {
        const heard: (string | undefined)[] = [];
        const stop = onReading((key) => heard.push(key));
        speak([{ key: "one", words: "A long note." }, { key: "two", words: "The end." }], voice);
        vi.advanceTimersByTime(150);
        start();
        skip("two");
        expect(reading()).toBe("one");

        skip("one");
        expect(reading()).toBeUndefined();
        expect(speechSynthesis.cancel).toHaveBeenCalled();
        said[0]!.onerror?.();
        vi.advanceTimersByTime(150);
        expect(said.at(-1)!.text).toBe("The end.");
        start();
        stop();
        said[1]!.onend?.();
        expect(heard).toEqual(["one", undefined, "two"]);
    });

    it("drops the mark when the voice stops with no event, and when a new word cuts the reading short", () => {
        speak([{ key: "one", words: "Cut short." }, { key: "two", words: "Next." }], voice);
        vi.advanceTimersByTime(150);
        start();
        speaking = false;
        vi.advanceTimersByTime(1000);
        expect(said.at(-1)!.text).toBe("Next.");

        start();
        speak([{ key: "three", words: "News." }], voice);
        expect(reading()).toBeUndefined();
        said[1]!.onend?.();
        vi.advanceTimersByTime(150);
        expect(said.map((utterance) => utterance.text)).toEqual(["Cut short.", "Next.", "News."]);
    });

    it("forgets what waits once hushed", () => {
        speak([{ key: "one", words: "One." }, { key: "two", words: "Two." }], voice);
        vi.advanceTimersByTime(150);
        start();
        hush();
        said[0]!.onend?.();
        vi.advanceTimersByTime(1000);
        expect(said).toHaveLength(1);
        expect(reading()).toBeUndefined();
    });
});

// The browser's utterance, as the page uses it: its words, and the handlers the voice calls.
class FakeUtterance
{
    readonly text: string;
    lang = "";
    voice: unknown;
    onstart?: () => void;
    onend?: () => void;
    onerror?: () => void;

    constructor(text: string)
    {
        this.text = text;
    }
}
