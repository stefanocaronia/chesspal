// The letters the player writes the pieces with (D-83): SAN's own in English, the language's in the others. What Chesspal shows has the pieces' figurines (D-86).
import { figurines } from "./board-text.ts";

/** A move in SAN as the player is shown it, in every language, with the pieces' figurines for their letters (D-86): Nxe4 is ♘xe4 and e8=Q is e8=♕. */
export function figurinesOf(san: string): string
{
    return san.replace(/^[KQRBN]|(?<==)[QRBN]/g, (letter) => figurines[letter] ?? letter);
}

/** A notation the player writes moves in: English is SAN's own. */
export type Notation = "en" | "it";

/** The notation of a language, as the system or the page names it (it-IT, it): its own where Chesspal knows its letters, else English. */
export function notationOf(language: string | undefined): Notation
{
    return language?.slice(0, 2).toLowerCase() === "it" ? "it" : "en";
}

/**
 * A move written in a notation, in SAN's letters: in Italian Te1 is Re1, Re1 is Ke1 and e8=D or e8d is e8=Q. A letter the notation does not have stays as
 * SAN reads it (Nf3, Bb5), and a pawn never becomes a king, so its R is the rook.
 */
export function sanOf(written: string, notation: Notation): string
{
    if (notation === "en") {
        return written;
    }

    const letters = pieceLetters[notation];
    return written
        .replace(/^[A-Z](?=[a-h1-8x:-]*[a-h][1-8])/, (letter) => letters[letter] ?? letter)
        .replace(/(?<=[1-8]=?)[A-Za-z](?=[+#]?[!?]*$)/, (letter) => letter.toUpperCase() === "R" ? letter : letters[letter.toUpperCase()] ?? letter);
}

/** A move in SAN as the player writes it in a notation: in Italian Nxe4 is Cxe4, Ke1 is Re1 and e8=Q is e8=D. */
export function writtenIn(san: string, notation: Notation): string
{
    if (notation === "en") {
        return san;
    }

    const letters = Object.fromEntries(Object.entries(pieceLetters[notation]).map(([letter, sanLetter]) => [sanLetter, letter]));
    return san.replace(/^[KQRBN]|(?<==)[QRBN]/g, (letter) => letters[letter] ?? letter);
}

// Each language's letters of the pieces, with SAN's for each: R is the Italian king, T its rook.
const pieceLetters: Readonly<Record<Exclude<Notation, "en">, Readonly<Record<string, string>>>> = {
    it: { R: "K", D: "Q", T: "R", A: "B", C: "N" },
};
