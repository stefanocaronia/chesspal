// The page's words in the player's language (D-32): Italian or English, from the browser's, until the profiles say which (T-19).
import type { IllegalReason, PieceLetter, Side } from "../core/index.ts";
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
    /** The player's draws and resignation in a game going on (D-65). */
    readonly offerDraw: string;
    /** The ½'s title while the player cannot offer: when they can. */
    readonly offerDrawWhen: string;
    readonly drawOffered: string;
    readonly acceptDraw: string;
    readonly declineDraw: string;
    readonly declineDrawTitle: string;
    readonly resign: string;
    readonly resignGame: string;
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
    readonly explain: string;
    readonly languageChoice: string;
    readonly languages: Readonly<Record<"auto" | "it" | "en", string>>;
    /** The names of the settings' choices by their ids: the piece sets, the boards' skins, the pieces' colours, the marks' colours. */
    readonly names: Readonly<Record<string, string>>;
    readonly game: string;
    readonly moves: string;
    /** The buttons that step through the moves (T-88). */
    readonly steps: Readonly<Record<Step, string>>;
    readonly noGame: string;
    readonly you: string;
    readonly ai: string;
    readonly sides: Readonly<Record<Side, string>>;
    readonly yourTurn: string;
    /** A player's clock, for a screen reader (T-37). */
    readonly clock: (time: string, running: boolean) => string;
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
    /** The choice of the piece a pawn becomes on the last rank (T-11). */
    readonly promoteTo: string;
    /** A square the piece picked may go to, for a screen reader (T-11). */
    readonly canGo: string;
    /** The board for a screen reader (T-11): who moves, and the last move. */
    boardLabel(turn: Side, lastMove: string | undefined): string;
    /** A request the server refused, by its code (T-11), with the characters left for words too long. */
    readonly refused: Readonly<Record<ServerRefusal, (most: number) => string>>;
    piece(letter: PieceLetter, side: Side): string;
    taken(pieces: readonly string[], ahead: number): string;
    writeTo(name: string): string;
    readBy(name: string): string;
    wrote(name: string): string;
    /** The header's words after the AI's name: its draw offer that stands, the player's it declined by its move (D-65). */
    readonly offers: string;
    readonly declines: string;
    started(when: string): string;
    lasted(count: number): string;
    won(side: Side): string;
    toMove(side: Side): string;
    /** The header's word on a game over (T-77): how it ended and who won. */
    verdict(how: HowEnded | undefined, winner: Side | undefined): string;
    /** Why the board refuses a move (T-11, D-18): the piece moved, the square it went to, the piece that forbids it. */
    illegal(move: RefusedMove): string;
}

/** The refusals the page server gives a code to, for the page to say them in the player's language. */
export type ServerRefusal =
    | "no-game"
    | "ai-to-move"
    | "illegal"
    | "clear-chat"
    | "words-empty"
    | "words-spent"
    | "words-long"
    | "words-longer-than-left"
    | "draw-offered"
    | "draw-none"
    | "draw-early";

/**
 * A move the board refused (T-11), as the page names it: why, the piece moved, the square it went to and whether a piece stood there, the piece that forbids
 * it, and the square the reason concerns besides (the rook's corner, the square castling crosses).
 */
export interface RefusedMove
{
    readonly reason: IllegalReason;
    readonly piece: PieceLetter;
    readonly to: string;
    readonly takes: boolean;
    readonly by?: { readonly letter: PieceLetter; readonly side: Side; readonly square: string; };
    readonly at?: string;
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
    offerDraw: "Offer a draw",
    offerDrawWhen: "Offer a draw: on your turn, once each side has moved",
    drawOffered: "You offered a draw",
    acceptDraw: "Accept",
    declineDraw: "Decline",
    declineDrawTitle: "Decline: moving declines it too",
    resign: "Resign",
    resignGame: "Resign this game?",
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
    explain: "Explain the moves refused",
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
    game: "The game",
    moves: "Moves",
    steps: { first: "Start", back: "Previous move", forward: "Next move", last: "Back to the game" },
    noGame: "No game yet: start one in the chat.",
    you: "You",
    ai: "AI",
    sides: { white: "White", black: "Black" },
    yourTurn: "your move",
    clock: (time, running) => `Clock: ${time}${running ? ", running" : ""}`,
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
        time: "on time",
    },
    opening: "Opening",
    outOfBook: "Out of book since move",
    inBook: "In book",
    promoteTo: "Promote to",
    canGo: "a legal move",
    boardLabel: (turn, lastMove) => `Chessboard, ${english.toMove(turn)}${lastMove === undefined ? "" : `, last move ${lastMove}`}`,
    clearChat: "Before a new game, clear the chat: write /clear there, or open a new chat. A clean chat plays faster.",
    refused: {
        "no-game": () => "There is no game going on: start one in the chat.",
        "ai-to-move": () => "Wait for the AI's move.",
        illegal: () => "That move is not legal here.",
        "clear-chat": () => english.clearChat,
        "words-empty": () => "Write something first.",
        "words-spent": () => "You have used up your words for this move: write again after the AI's move.",
        "words-long": (most) => `Write at most ${most} characters.`,
        "words-longer-than-left": (most) => `You have ${most} characters left until the AI's move.`,
        "draw-offered": () => "A draw offer stands already.",
        "draw-none": () => "There is no draw offer to answer.",
        "draw-early": () => "You can offer a draw once each side has made a move.",
    },
    piece: (letter, side) => `${side} ${englishNames[letter]}`,
    taken: (pieces, ahead) => `Pieces taken: ${pieces.length === 0 ? "none" : pieces.join(", ")}${ahead > 0 ? `; ahead by ${ahead}` : ""}`,
    writeTo: (name) => `Write to ${name}…`,
    readBy: (name) => `Read by ${name}`,
    wrote: (name) => `${name} wrote`,
    offers: "offers a draw",
    declines: "declines the draw",
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
    illegal: (move) => move.reason === "shape" ? englishMoves[move.piece] : englishIllegal[move.reason]({ ...move, by: englishCulprit(move.by) }),
};

const italian: Text = {
    language: "it",
    flip: "Gira",
    theme: "Tema chiaro o scuro",
    sounds: "Suoni",
    newGame: "Nuova partita",
    abandonGame: "Iniziare una nuova partita? Quella in corso va nell'archivio, non finita.",
    offerDraw: "Proponi patta",
    offerDrawWhen: "Proponi patta: nel tuo turno, dopo una mossa a testa",
    drawOffered: "Hai proposto patta",
    acceptDraw: "Accetta",
    declineDraw: "Rifiuta",
    declineDrawTitle: "Rifiuta: anche muovere rifiuta",
    resign: "Abbandona",
    resignGame: "Abbandonare la partita?",
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
    explain: "Spiega le mosse vietate",
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
    game: "La partita",
    moves: "Mosse",
    steps: { first: "Inizio", back: "Mossa precedente", forward: "Mossa successiva", last: "Torna alla partita" },
    noGame: "Nessuna partita: iniziane una nella chat.",
    you: "Tu",
    ai: "AI",
    sides: { white: "Bianco", black: "Nero" },
    yourTurn: "tocca a te",
    clock: (time, running) => `Orologio: ${time}${running ? ", in corsa" : ""}`,
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
        time: "per tempo",
    },
    opening: "Apertura",
    outOfBook: "Fuori teoria dalla mossa",
    inBook: "In teoria",
    promoteTo: "Promuovi a",
    canGo: "mossa possibile",
    boardLabel: (turn, lastMove) => `Scacchiera, ${italian.toMove(turn)}${lastMove === undefined ? "" : `, ultima mossa ${lastMove}`}`,
    clearChat: "Prima di una nuova partita azzera la chat: scrivi /clear, o aprine una nuova. Con la chat pulita l'AI gioca più veloce.",
    refused: {
        "no-game": () => "Nessuna partita in corso: iniziane una nella chat.",
        "ai-to-move": () => "Aspetta la mossa dell'AI.",
        illegal: () => "Questa mossa qui non è legale.",
        "clear-chat": () => italian.clearChat,
        "words-empty": () => "Scrivi prima qualcosa.",
        "words-spent": () => "Hai finito le parole per questa mossa: scrivi di nuovo dopo quella dell'AI.",
        "words-long": (most) => `Scrivi al massimo ${most} caratteri.`,
        "words-longer-than-left": (most) => `Ti restano ${most} caratteri fino alla mossa dell'AI.`,
        "draw-offered": () => "C'è già una proposta di patta.",
        "draw-none": () => "Non c'è una proposta di patta a cui rispondere.",
        "draw-early": () => "Puoi proporre patta dopo una mossa a testa.",
    },
    // Queen and rook are feminine in Italian.
    piece: (letter, side) => `${italianNames[letter]} ${side === "white" ? (letter === "Q" || letter === "R" ? "bianca" : "bianco") : (letter === "Q" || letter === "R" ? "nera" : "nero")}`,
    taken: (pieces, ahead) => `Pezzi presi: ${pieces.length === 0 ? "nessuno" : pieces.join(", ")}${ahead > 0 ? `; avanti di ${ahead}` : ""}`,
    writeTo: (name) => `Scrivi a ${name}…`,
    readBy: (name) => `Letto da ${name}`,
    wrote: (name) => `${name} ha scritto`,
    offers: "propone patta",
    declines: "rifiuta la patta",
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
    illegal: (move) => move.reason === "shape" ? italianMoves[move.piece] : italianIllegal[move.reason]({ ...move, by: italianCulprit(move.by) }),
};

// Why a move is refused, from the piece moved, the square it went to and the piece that forbids it, each named with its article.
type Reason = (move: Omit<RefusedMove, "by"> & { readonly by: string; }) => string;

// How each piece moves, said when it was taken where it cannot go (Anatolij's words).
const englishMoves: Readonly<Record<PieceLetter, string>> = {
    K: "The king moves one square; two only to castle.",
    Q: "The queen moves in a straight line or diagonally.",
    R: "The rook moves only along ranks and files.",
    B: "The bishop moves only diagonally.",
    N: "The knight jumps in an L: two squares one way and one to the side.",
    P: "A pawn moves straight ahead one square, two from its starting square, and captures one square diagonally forward.",
};

const englishIllegal: Readonly<Record<Exclude<IllegalReason, "shape">, Reason>> = {
    own: ({ to }) => `One of your pieces already stands on ${to}.`,
    blocked: ({ by }) => `${capital(by)} is in the way.`,
    "pawn-straight": () => "A pawn takes only diagonally: straight ahead it needs an empty square.",
    "pawn-double": () => "A pawn goes two squares only from its starting square.",
    "pawn-diagonal": () => "A pawn goes diagonally only to take a piece.",
    "en-passant-late": ({ by }) => `${capital(by)} can be taken en passant only right after its two-square move.`,
    check: ({ by }) => `You are in check from ${by}, and this move does not get you out of it.`,
    pinned: ({ piece, by }) => `The ${englishNames[piece]} is pinned: if you move it, ${by} gives check to your king.`,
    attacked: ({ to, takes, by }) => takes ? `The king cannot take on ${to}: ${by} defends that square.` : `The king cannot go to ${to}: ${by} attacks that square.`,
    "castle-lost": () => "You can no longer castle on that side: the king or that rook has already moved.",
    "castle-rook-gone": ({ at }) => `Your rook on ${at} is gone: you cannot castle on that side.`,
    "castle-blocked": ({ by }) => `To castle, no piece may stand between the king and the rook: ${by} does.`,
    "castle-check": ({ by }) => `You cannot castle out of check: ${by} gives it.`,
    "castle-through": ({ at, by }) => `The king cannot castle through or onto ${at}: ${by} attacks that square.`,
};

const italianThe: Readonly<Record<PieceLetter, string>> = { K: "il re", Q: "la donna", R: "la torre", B: "l'alfiere", N: "il cavallo", P: "il pedone" };

const italianMoves: Readonly<Record<PieceLetter, string>> = {
    K: "Il re si muove di una casa; di due solo per arroccare.",
    Q: "La donna si muove in linea retta o in diagonale.",
    R: "La torre si muove solo per righe e colonne.",
    B: "L'alfiere si muove solo in diagonale.",
    N: "Il cavallo salta a L: due case in una direzione e una di lato.",
    P: "Il pedone avanza dritto di una casa, di due dalla casa di partenza, e cattura di una casa in diagonale.",
};

const italianIllegal: Readonly<Record<Exclude<IllegalReason, "shape">, Reason>> = {
    own: ({ to }) => `In ${to} c'è già un tuo pezzo.`,
    blocked: ({ by }) => `${capital(by)} sbarra la strada.`,
    "pawn-straight": () => "Il pedone cattura solo in diagonale: in avanti gli serve una casa libera.",
    "pawn-double": () => "Il pedone avanza di due case solo dalla sua casa di partenza.",
    "pawn-diagonal": () => "Il pedone va in diagonale solo per catturare.",
    "en-passant-late": ({ by }) => `${capital(by)} si prende en passant solo subito dopo il suo passo doppio.`,
    check: ({ by }) => `Sei sotto scacco e questa mossa non lo para: lo dà ${by}.`,
    pinned: ({ by }) => `Questo pezzo è inchiodato: se lo sposti, ${by} dà scacco al tuo re.`,
    attacked: ({ to, takes, by }) => takes ? `Il re non può prendere in ${to}: ${by} difende quella casa.` : `Il re non può andare in ${to}: ${by} controlla quella casa.`,
    "castle-lost": () => "Da quel lato non puoi più arroccare: il re o quella torre si sono già mossi.",
    "castle-rook-gone": ({ at }) => `Non c'è più la tua torre in ${at}: da quel lato non si arrocca.`,
    "castle-blocked": ({ by }) => `Per arroccare non ci devono essere pezzi fra il re e la torre: c'è ${by}.`,
    "castle-check": ({ by }) => `Sotto scacco non si arrocca: lo dà ${by}.`,
    "castle-through": ({ at, by }) => `Arroccando il re passerebbe per ${at}, e ${by} controlla quella casa.`,
};

/** The piece that forbids a move, with its article and square; a king with its colour, beside the player's own. */
function englishCulprit(by: RefusedMove["by"]): string
{
    return by === undefined ? "" : `the ${by.letter === "K" ? `${by.side} ` : ""}${englishNames[by.letter]} on ${by.square}`;
}

function italianCulprit(by: RefusedMove["by"]): string
{
    return by === undefined ? "" : `${italianThe[by.letter]}${by.letter === "K" ? (by.side === "white" ? " bianco" : " nero") : ""} in ${by.square}`;
}

/** The words with their first letter capital, to open a sentence. */
function capital(words: string): string
{
    return words.charAt(0).toUpperCase() + words.slice(1);
}
