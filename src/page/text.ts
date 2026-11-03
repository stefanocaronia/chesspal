// The page's words in the player's language (D-32): Italian or English, from the browser's, until the profiles say which (T-19).
import type { PieceLetter, Side } from "../core/index.ts";

/** The words of the page in one language. */
export interface Text
{
    readonly language: string;
    readonly flip: string;
    readonly theme: string;
    readonly sounds: string;
    readonly newGame: string;
    readonly abandonGame: string;
    readonly board: string;
    readonly game: string;
    readonly moves: string;
    readonly noGame: string;
    readonly you: string;
    readonly ai: string;
    readonly sides: Readonly<Record<Side, string>>;
    readonly yourTurn: string;
    readonly send: string;
    readonly sent: string;
    readonly withMove: string;
    readonly fold: string;
    readonly unfold: string;
    readonly started: string;
    readonly move: string;
    piece(letter: PieceLetter, side: Side): string;
    taken(pieces: readonly string[], ahead: number): string;
    writeTo(name: string): string;
    readBy(name: string): string;
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
    sounds: "Sounds",
    newGame: "New game",
    abandonGame: "Start a new game? The one going on goes to the archive unfinished.",
    board: "Chessboard",
    game: "The game",
    moves: "Moves",
    noGame: "No game yet: start one in the chat.",
    you: "You",
    ai: "AI",
    sides: { white: "White", black: "Black" },
    yourTurn: "your move",
    send: "Send",
    sent: "Sent",
    withMove: "Or move: your words go with it",
    fold: "Fold the column",
    unfold: "Show the game",
    started: "Started",
    move: "Move",
    piece: (letter, side) => `${side} ${englishNames[letter]}`,
    taken: (pieces, ahead) => `Pieces taken: ${pieces.length === 0 ? "none" : pieces.join(", ")}${ahead > 0 ? `; ahead by ${ahead}` : ""}`,
    writeTo: (name) => `Write to ${name}…`,
    readBy: (name) => `Read by ${name}`,
};

const italian: Text = {
    language: "it",
    flip: "Gira",
    theme: "Tema chiaro o scuro",
    sounds: "Suoni",
    newGame: "Nuova partita",
    abandonGame: "Iniziare una nuova partita? Quella in corso va nell'archivio, non finita.",
    board: "Scacchiera",
    game: "La partita",
    moves: "Mosse",
    noGame: "Nessuna partita: iniziane una nella chat.",
    you: "Tu",
    ai: "AI",
    sides: { white: "Bianco", black: "Nero" },
    yourTurn: "tocca a te",
    send: "Manda",
    sent: "Mandato",
    withMove: "Oppure muovi: parte con la mossa",
    fold: "Ripiega la colonna",
    unfold: "Mostra la partita",
    started: "Iniziata",
    move: "Mossa",
    // Queen and rook are feminine in Italian.
    piece: (letter, side) => `${italianNames[letter]} ${side === "white" ? (letter === "Q" || letter === "R" ? "bianca" : "bianco") : (letter === "Q" || letter === "R" ? "nera" : "nero")}`,
    taken: (pieces, ahead) => `Pezzi presi: ${pieces.length === 0 ? "nessuno" : pieces.join(", ")}${ahead > 0 ? `; avanti di ${ahead}` : ""}`,
    writeTo: (name) => `Scrivi a ${name}…`,
    readBy: (name) => `Letto da ${name}`,
};
