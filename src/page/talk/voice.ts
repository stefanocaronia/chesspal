// The AI's words read aloud (Stefano's idea, IDEE.md): the browser's own voices, a local one first, so the words stay on the computer where it can.
import type { PieceLetter } from "../../core/index.ts";
import type { SaidMove, Text } from "../text.ts";

/** What the voice needs of the page's words: the language it reads in and how it says a move. */
export type Voice = Pick<Text, "language" | "saidMove">;

/** Reads the words aloud in the voice's language, the moves in words, cutting short what was being read. */
export function speak(words: string, voice: Voice): void
{
    if (typeof speechSynthesis === "undefined") {
        return;
    }

    const said = spokenMoves(words.replace(/\*\*/g, ""), voice.saidMove).trim();
    speechSynthesis.cancel();
    clearTimeout(pending);

    if (said === "") {
        return;
    }

    // Chrome drops words spoken right after a cancel, and lists its voices late the first time: the words wait a moment.
    pending = setTimeout(() => {
        const utterance = new SpeechSynthesisUtterance(said);
        const reader = readerFor(voice.language);
        utterance.lang = reader?.lang ?? voice.language;

        if (reader !== undefined) {
            utterance.voice = reader;
        }

        speechSynthesis.resume();
        speechSynthesis.speak(utterance);
    }, 150);
}

/** Stops reading. */
export function hush(): void
{
    if (typeof speechSynthesis !== "undefined") {
        clearTimeout(pending);
        speechSynthesis.cancel();
    }
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

let pending: ReturnType<typeof setTimeout> | undefined;

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
