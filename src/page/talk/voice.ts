// The AI's words read aloud (Stefano's idea, IDEE.md): the browser's own voices, a local one first, so the words stay on the computer where it can.
import type { PieceLetter } from "../../core/index.ts";
import type { SaidMove, Text } from "../text.ts";

/** What the voice needs of the page's words: the language it reads in, how it says a move and the words of the mark that skips a reading. */
export type Voice = Pick<Text, "language" | "saidMove" | "skipReading">;

/** One bubble's words to read, by the key the page knows the bubble by. */
export interface Reading
{
    readonly key: string;
    readonly words: string;
}

/** Reads the bubbles aloud one after the other in the voice's language, the moves in words, cutting short what was being read. */
export function speak(readings: readonly Reading[], voice: Voice): void
{
    if (typeof speechSynthesis === "undefined") {
        return;
    }

    stop();
    queue = readings.map((reading) => ({ key: reading.key, said: spokenMoves(reading.words.replace(/\*\*/g, ""), voice.saidMove).trim() })).filter((reading) => reading.said !== "");
    language = voice.language;
    readNextSoon();
}

/** Stops reading the bubble the key names, when it is the one read, and goes on with the next. */
export function skip(key: string): void
{
    if (current?.key === key) {
        stop();
        readNextSoon();
    }
}

/** Stops reading, and forgets what was waiting. */
export function hush(): void
{
    if (typeof speechSynthesis !== "undefined") {
        queue = [];
        stop();
    }
}

/** The key of the bubble being read, from the moment the voice starts it to its end; none while nothing is read. */
export function reading(): string | undefined
{
    return current?.started === true ? current.key : undefined;
}

/** Calls the listener whenever the bubble being read changes: what it returns stops it. */
export function onReading(listener: (key: string | undefined) => void): () => void
{
    listeners.add(listener);

    return () => {
        listeners.delete(listener);
    };
}

/** Whether the browser has a voice for the language: without one the words cannot be read. */
export function hasVoice(language: string): boolean
{
    return typeof speechSynthesis !== "undefined" && readerFor(language) !== undefined;
}

/** Calls the listener whenever the browser's voices change, since Chrome lists them late: what it returns stops it. */
export function onVoices(listener: () => void): () => void
{
    if (typeof speechSynthesis === "undefined") {
        return () => undefined;
    }

    speechSynthesis.addEventListener("voiceschanged", listener);
    return () => speechSynthesis.removeEventListener("voiceschanged", listener);
}

/**
 * The words with each move the AI wrote said in words, since a voice reads ♟g4 as "chess pawn g4": ♞xf6+, Nxf6+, exd5, O-O, e8=♛. A square alone, e4,
 * stays as it is; a pawn's move becomes words only with its figurine, a capture, a promotion or a check, and without the file it takes from.
 */
export function spokenMoves(words: string, say: (move: SaidMove) => string): string
{
    return words.replace(movePattern, (move: string, ...found: unknown[]) => {
        const { castles, figurine, letter, from, takes, square, promotion, check } = found.at(-1) as MoveParts;
        const checked = check === undefined ? {} : { check: check === "+" ? "check" : "mate" } as const;

        if (castles !== undefined) {
            return say({ castles: castles.length > 3 ? "long" : "short", ...checked });
        }

        if (square === undefined || (figurine === undefined && letter === undefined && takes === undefined && promotion === undefined && check === undefined)) {
            return move;
        }

        const piece = figurine === undefined ? ((letter ?? "P") as PieceLetter) : pieceOf(figurine);
        const promoted = promotion === undefined ? {} : { promotion: pieceOf(promotion) };
        // A pawn's file, exd5, goes unsaid: "pawn takes d5".
        const said = from === undefined || from === "" || piece === "P" ? {} : { from };
        return say({ piece, ...said, takes: takes !== undefined, square, ...promoted, ...checked });
    });
}

// What waits to be read, what is read and in which language, and who wants to know which bubble is read.
let queue: { key: string; said: string; }[] = [];
let current: Read | undefined;
let language = "";
let pending: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<(key: string | undefined) => void>();

// A bubble being read: the utterance is held so the browser does not drop it, and its events with it, before it ends.
interface Read
{
    readonly key: string;
    readonly utterance: SpeechSynthesisUtterance;
    started: boolean;
    watch?: ReturnType<typeof setInterval>;
}

// Chrome drops words spoken right after a cancel, and lists its voices late the first time: the words wait a moment.
function readNextSoon(): void
{
    pending = setTimeout(readNext, 150);
}

function readNext(): void
{
    const next = queue.shift();

    if (next === undefined) {
        return;
    }

    const utterance = new SpeechSynthesisUtterance(next.said);
    const reader = readerFor(language);
    utterance.lang = reader?.lang ?? language;

    if (reader !== undefined) {
        utterance.voice = reader;
    }

    const reading: Read = { key: next.key, utterance, started: false };
    current = reading;

    // A cancel fires end or error in some browsers and nothing in others: only the events of the utterance read now count, and the page drops its own at once.
    utterance.onstart = () => {
        if (current === reading) {
            reading.started = true;
            // The voice may stop with no event at all: a look each second at whether it still speaks, so no mark stays on a bubble nobody reads.
            reading.watch = setInterval(() => {
                if (current === reading && !speechSynthesis.speaking) {
                    finished(reading);
                }
            }, 1000);
            tell();
        }
    };

    utterance.onend = () => finished(reading);
    utterance.onerror = () => finished(reading);
    speechSynthesis.resume();
    speechSynthesis.speak(utterance);
}

function finished(reading: Read): void
{
    if (current === reading) {
        drop();
        readNext();
    }
}

// Cuts short what is read, keeping what waits.
function stop(): void
{
    clearTimeout(pending);
    drop();
    speechSynthesis.cancel();
}

function drop(): void
{
    const was = current;
    clearInterval(was?.watch);
    current = undefined;

    if (was?.started === true) {
        tell();
    }
}

function tell(): void
{
    const key = reading();

    for (const listener of listeners) {
        listener(key);
    }
}

// A move in SAN, with the pieces' letters or figurines, as the AI writes it; the parts named, castling apart.
const movePattern =
    /(?<![\w♔-♟])(?:(?<castles>O-O(?:-O)?|0-0(?:-0)?)|(?:(?<figurine>[♔-♟])[\uFE0E\uFE0F]?|(?<letter>[KQRBN]))?(?<from>[a-h]?[1-8]?)(?<takes>[x×])?(?<square>[a-h][1-8])(?:=?(?<promotion>[QRBN]|[♔-♟]))?[\uFE0E\uFE0F]?)(?<check>\+\+|[+#])?(?![\w♔-♟])/gu;

interface MoveParts
{
    readonly castles?: string;
    readonly figurine?: string;
    readonly letter?: string;
    readonly from?: string;
    readonly takes?: string;
    readonly square?: string;
    readonly promotion?: string;
    readonly check?: string;
}

// A piece's letter, or its figurine: White's run ♔♕♖♗♘♙ and Black's ♚♛♜♝♞♟, in SAN's order.
function pieceOf(sign: string): PieceLetter
{
    return ("KQRBN".includes(sign) ? sign : "KQRBNP".charAt(((sign.codePointAt(0) ?? 0) - 0x2654) % 6)) as PieceLetter;
}

/** A voice for the language: a local one first, the browser's default among them first. */
function readerFor(language: string): SpeechSynthesisVoice | undefined
{
    const voices = speechSynthesis.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith(language.toLowerCase()));
    const local = voices.filter((voice) => voice.localService);
    return local.find((voice) => voice.default) ?? local[0] ?? voices[0];
}
