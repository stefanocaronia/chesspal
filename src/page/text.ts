// The page's words in the player's language (D-32): Italian or English, from the browser's, until the profiles say which (T-19).
import type { PieceLetter, Side } from "../core/index.ts";
import type { Step } from "./browse.ts";
import type { HowEnded } from "./ending.ts";

/** The words of the page in one language. */
export interface Text
{
    readonly language: string;
    readonly flip: string;
    readonly theme: string;
    readonly sounds: string;
    readonly newGame: string;
    readonly abandonGame: string;
    readonly settings: string;
    readonly close: string;
    readonly look: string;
    readonly themeChoice: string;
    readonly themes: Readonly<Record<"system" | "light" | "dark", string>>;
    readonly boardSkin: string;
    readonly pieceSet: string;
    readonly pieceColours: string;
    readonly marksColour: string;
    readonly play: string;
    readonly dots: string;
    readonly languageChoice: string;
    readonly languages: Readonly<Record<"auto" | "it" | "en", string>>;
    /** The names of the settings' choices by their ids: the piece sets, the boards' skins, the pieces' colours, the marks' colours. */
    readonly names: Readonly<Record<string, string>>;
    readonly board: string;
    readonly game: string;
    readonly moves: string;
    /** The buttons that step through the moves (T-88). */
    readonly steps: Readonly<Record<Step, string>>;
    readonly noGame: string;
    readonly you: string;
    readonly ai: string;
    readonly sides: Readonly<Record<Side, string>>;
    readonly yourTurn: string;
    readonly send: string;
    readonly sent: string;
    readonly withMove: string;
    readonly talk: string;
    readonly move: string;
    readonly draw: string;
    readonly checkmate: string;
    /** How a game ended, as the game's card says it under the result (T-77). */
    readonly ended: Readonly<Record<HowEnded, string>>;
    readonly opening: string;
    readonly outOfBook: string;
    readonly inBook: string;
    readonly clearChat: string;
    piece(letter: PieceLetter, side: Side): string;
    taken(pieces: readonly string[], ahead: number): string;
    writeTo(name: string): string;
    readBy(name: string): string;
    wrote(name: string): string;
    started(when: string): string;
    lasted(count: number): string;
    won(side: Side): string;
    toMove(side: Side): string;
    /** The header's word on a game over (T-77): how it ended and who won. */
    verdict(how: HowEnded | undefined, winner: Side | undefined): string;
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
    settings: "Settings",
    close: "Close",
    look: "Look",
    themeChoice: "Theme",
    themes: { system: "As the system", light: "Light", dark: "Dark" },
    boardSkin: "Board",
    pieceSet: "Pieces",
    pieceColours: "Pieces' colours",
    marksColour: "Arrows and marked squares",
    play: "Play",
    dots: "Dots on the legal moves",
    languageChoice: "Language",
    languages: { auto: "As the browser", it: "Italiano", en: "English" },
    names: {
        nitida: "Nitida",
        torretta: "Torretta",
        cburnett: "cburnett",
        azzurro: "Blue",
        verde: "Green",
        noce: "Walnut",
        ardesia: "Slate",
        grigio: "Grey",
        lavanda: "Lavender",
        ciliegio: "Cherry wood",
        menta: "Mint",
        carta: "Paper",
        classico: "Classic",
        avorio: "Ivory and ebony",
        notte: "Midnight",
        bordeaux: "Burgundy",
        arancione: "Orange",
        rosso: "Red",
        blu: "Blue",
    },
    board: "Chessboard",
    game: "The game",
    moves: "Moves",
    steps: { first: "Start", back: "Previous move", forward: "Next move", last: "Back to the game" },
    noGame: "No game yet: start one in the chat.",
    you: "You",
    ai: "AI",
    sides: { white: "White", black: "Black" },
    yourTurn: "your move",
    send: "Send",
    sent: "Sent",
    withMove: "Or move: your words go with it",
    talk: "The talk",
    move: "Move",
    draw: "draw",
    checkmate: "checkmate",
    ended: {
        checkmate: "checkmate",
        stalemate: "stalemate",
        "insufficient material": "insufficient material",
        "threefold repetition": "threefold repetition",
        "fifty moves": "fifty-move rule",
        resignation: "resignation",
        agreement: "agreed",
    },
    opening: "Opening",
    outOfBook: "Out of book since move",
    inBook: "In book",
    clearChat: "Before a new game, clear the chat: write /clear there, or open a new chat. A clean chat plays faster.",
    piece: (letter, side) => `${side} ${englishNames[letter]}`,
    taken: (pieces, ahead) => `Pieces taken: ${pieces.length === 0 ? "none" : pieces.join(", ")}${ahead > 0 ? `; ahead by ${ahead}` : ""}`,
    writeTo: (name) => `Write to ${name}…`,
    readBy: (name) => `Read by ${name}`,
    wrote: (name) => `${name} wrote`,
    started: (when) => `started ${when}`,
    lasted: (count) => `${count} ${count === 1 ? "move" : "moves"}`,
    won: (side) => `${side === "white" ? "White" : "Black"} wins`,
    toMove: (side) => `${side === "white" ? "White" : "Black"} to move`,
    verdict: (how, winner) => {
        if (winner !== undefined) {
            return how === undefined ? english.won(winner) : `${capital(english.ended[how])} · ${english.won(winner)}`;
        }

        return how === "agreement" ? "Draw agreed" : how === undefined ? "Draw" : `Draw · ${english.ended[how]}`;
    },
};

const italian: Text = {
    language: "it",
    flip: "Gira",
    theme: "Tema chiaro o scuro",
    sounds: "Suoni",
    newGame: "Nuova partita",
    abandonGame: "Iniziare una nuova partita? Quella in corso va nell'archivio, non finita.",
    settings: "Impostazioni",
    close: "Chiudi",
    look: "Aspetto",
    themeChoice: "Tema",
    themes: { system: "Come il sistema", light: "Chiaro", dark: "Scuro" },
    boardSkin: "Scacchiera",
    pieceSet: "Pezzi",
    pieceColours: "Colori dei pezzi",
    marksColour: "Frecce e case segnate",
    play: "Gioco",
    dots: "Pallini sulle mosse legali",
    languageChoice: "Lingua",
    languages: { auto: "Come il browser", it: "Italiano", en: "English" },
    names: {
        nitida: "Nitida",
        torretta: "Torretta",
        cburnett: "cburnett",
        azzurro: "Azzurro",
        verde: "Verde",
        noce: "Noce",
        ardesia: "Ardesia",
        grigio: "Grigio",
        lavanda: "Lavanda",
        ciliegio: "Ciliegio",
        menta: "Menta",
        carta: "Carta",
        classico: "Classico",
        avorio: "Avorio ed ebano",
        notte: "Blu notte",
        bordeaux: "Bordeaux",
        arancione: "Arancione",
        rosso: "Rosso",
        blu: "Blu",
    },
    board: "Scacchiera",
    game: "La partita",
    moves: "Mosse",
    steps: { first: "Inizio", back: "Mossa precedente", forward: "Mossa successiva", last: "Torna alla partita" },
    noGame: "Nessuna partita: iniziane una nella chat.",
    you: "Tu",
    ai: "AI",
    sides: { white: "Bianco", black: "Nero" },
    yourTurn: "tocca a te",
    send: "Manda",
    sent: "Mandato",
    withMove: "Oppure muovi: parte con la mossa",
    talk: "Conversazione",
    move: "Mossa",
    draw: "patta",
    checkmate: "scacco matto",
    ended: {
        checkmate: "scacco matto",
        stalemate: "stallo",
        "insufficient material": "materiale insufficiente",
        "threefold repetition": "triplice ripetizione",
        "fifty moves": "regola delle 50 mosse",
        resignation: "abbandono",
        agreement: "d'accordo",
    },
    opening: "Apertura",
    outOfBook: "Fuori teoria dalla mossa",
    inBook: "In teoria",
    clearChat: "Prima di una nuova partita azzera la chat: scrivi /clear, o aprine una nuova. Con la chat pulita l'AI gioca più veloce.",
    // Queen and rook are feminine in Italian.
    piece: (letter, side) => `${italianNames[letter]} ${side === "white" ? (letter === "Q" || letter === "R" ? "bianca" : "bianco") : (letter === "Q" || letter === "R" ? "nera" : "nero")}`,
    taken: (pieces, ahead) => `Pezzi presi: ${pieces.length === 0 ? "nessuno" : pieces.join(", ")}${ahead > 0 ? `; avanti di ${ahead}` : ""}`,
    writeTo: (name) => `Scrivi a ${name}…`,
    readBy: (name) => `Letto da ${name}`,
    wrote: (name) => `${name} ha scritto`,
    started: (when) => `iniziata ${when}`,
    lasted: (count) => `${count} ${count === 1 ? "mossa" : "mosse"}`,
    won: (side) => `vince il ${side === "white" ? "Bianco" : "Nero"}`,
    toMove: (side) => `muove il ${side === "white" ? "Bianco" : "Nero"}`,
    verdict: (how, winner) => {
        if (winner !== undefined) {
            return how === undefined ? capital(italian.won(winner)) : `${capital(italian.ended[how])} · ${italian.won(winner)}`;
        }

        return how === "agreement" ? "Patta d'accordo" : how === undefined ? "Patta" : `Patta · ${italian.ended[how]}`;
    },
};

/** The words with their first letter capital, to open a sentence. */
function capital(words: string): string
{
    return words.charAt(0).toUpperCase() + words.slice(1);
}
