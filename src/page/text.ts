// The page's words in the player's language (D-32): Italian or English, from the browser's, until the profiles say which (T-19).
import type { PieceLetter, Side } from "../core/index.ts";

/** The words of the page in one language. */
export interface Text
{
    readonly language: string;
    readonly flip: string;
    readonly theme: string;
    readonly board: string;
    readonly game: string;
    readonly moves: string;
    readonly noGame: string;
    readonly you: string;
    readonly ai: string;
    readonly sides: Readonly<Record<Side, string>>;
    piece(letter: PieceLetter, side: Side): string;
    taken(pieces: readonly string[], ahead: number): string;
}

/** The words for the first of the browser's languages the page speaks, else English. */
export function textFor(languages: readonly string[]): Text
{
    const known = languages.map((language) => language.slice(0, 2).toLowerCase()).find((language) => language === "it" || language === "en");
    return known === "it" ? italian : english;
}

const englishNames: Readonly<Record<PieceLetter, string>> = { K: "king", Q: "queen", R: "rook", B: "bishop", N: "knight", P: "pawn" };
const italianNames: Readonly<Record<PieceLetter, string>> = { K: "re", Q: "donna", R: "torre", B: "alfiere", N: "cavallo", P: "pedone" };

const english: Text = {
    language: "en",
    flip: "Flip",
    theme: "Light or dark theme",
    board: "Chessboard",
    game: "Game",
    moves: "Moves",
    noGame: "No game yet: start one in the chat.",
    you: "You",
    ai: "AI",
    sides: { white: "White", black: "Black" },
    piece: (letter, side) => `${side} ${englishNames[letter]}`,
    taken: (pieces, ahead) => `Pieces taken: ${pieces.length === 0 ? "none" : pieces.join(", ")}${ahead > 0 ? `; ahead by ${ahead}` : ""}`,
};

const italian: Text = {
    language: "it",
    flip: "Gira",
    theme: "Tema chiaro o scuro",
    board: "Scacchiera",
    game: "Partita",
    moves: "Mosse",
    noGame: "Nessuna partita: iniziane una nella chat.",
    you: "Tu",
    ai: "AI",
    sides: { white: "Bianco", black: "Nero" },
    // Queen and rook are feminine in Italian.
    piece: (letter, side) => `${italianNames[letter]} ${side === "white" ? (letter === "Q" || letter === "R" ? "bianca" : "bianco") : (letter === "Q" || letter === "R" ? "nera" : "nero")}`,
    taken: (pieces, ahead) => `Pezzi presi: ${pieces.length === 0 ? "nessuno" : pieces.join(", ")}${ahead > 0 ? `; avanti di ${ahead}` : ""}`,
};
