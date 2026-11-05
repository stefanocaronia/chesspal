// The page's words in the player's language (D-32): Italian or English, from the browser's or as the settings say (D-56).
import type { AiLevel, Badge, DrawColour, IllegalReason, PieceLetter, Side } from "../core/index.ts";
import type { Step } from "./browse.ts";
import type { HowEnded } from "./ending.ts";
import type { AvatarId, Level, RatingSite } from "./profile.ts";

/** The words of the page in one language. */
export interface Text
{
    readonly language: string;
    readonly flip: string;
    readonly theme: string;
    readonly sounds: string;
    /** The switch that reads the AI's words aloud. */
    readonly voice: string;
    readonly newGame: string;
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
    /** The setting that marks the opening book's moves while the game goes on. */
    readonly bookBadges: string;
    /** The setting that makes the AI teach during the game (D-78). */
    readonly helps: string;
    readonly languageChoice: string;
    readonly languages: Readonly<Record<"auto" | "it" | "en", string>>;
    /** The names of the settings' choices by their ids: the piece sets, the boards' skins, the pieces' colours, the marks' colours. */
    readonly names: Readonly<Record<string, string>>;
    readonly game: string;
    readonly moves: string;
    /** The buttons that step through the moves (T-88). */
    readonly steps: Readonly<Record<Step, string>>;
    readonly noGame: string;
    /** The header's word between games, on the table set for the next (D-77). */
    readonly noGameNow: string;
    /** A game the AI goes over with the player (D-69): what the header says, the badges it puts on the moves, and its word on the whole game. */
    readonly analysing: string;
    readonly badges: Readonly<Record<Badge, string>>;
    reviewBy(name: string): string;
    /** What the colours the AI draws with a note mean (D-69). */
    readonly drawn: Readonly<Record<DrawColour, string>>;
    reviewing(name: string): string;
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
    /** Before a new game the chat is cleared in the host named (Claude, Codex), not on the page. */
    clearChat(name: string): string;
    /** The page lost its server, which lives in the host's chat: where to write to bring it back. */
    offline(name: string): string;
    /** The page is served, but no chat hears the player (never started, or just cleared): where to write to wake it; its clock waits. */
    asleep(name: string): string;
    /** The button that starts the clocks, which wait for the player from the game's start. */
    readonly startClocks: string;
    /** A command such as /clear written in the page's talk, which is for the host's window. */
    commandHere(name: string): string;
    /** The choice of the piece a pawn becomes on the last rank (T-11). */
    readonly promoteTo: string;
    /** A square the piece picked may go to, for a screen reader (T-11). */
    readonly canGo: string;
    /** The board for a screen reader (T-11): who moves, and the last move. */
    boardLabel(turn: Side, lastMove: string | undefined): string;
    /** A request the server refused, by its code (T-11), with the characters left for words too long and the host's name. */
    readonly refused: Readonly<Record<ServerRefusal, (most: number, name: string) => string>>;
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
    /** The profiles (D-23, D-45): the wizard at the first start, the player's picture, the menu of the profiles. */
    readonly profile: ProfileText;
    /** The new game's dialog (D-48, T-58). */
    readonly start: StartText;
    /** The dialog that brings a game played elsewhere to analyse (T-92). */
    readonly study: StudyText;
}

/** The words of the dialog that brings a game to analyse. */
export interface StudyText
{
    /** The header's button and the dialog's title. */
    readonly title: string;
    readonly paste: string;
    readonly file: string;
    readonly note: string;
    readonly start: string;
    /** The list of the analyses, and the part that brings a new game. */
    readonly yours: string;
    readonly bring: string;
    readonly reviewed: string;
    readonly unreviewed: string;
    moves(count: number): string;
    /** The column's button that saves the game in analysis with its review. */
    readonly download: string;
    /** The column's button under a game just over, which opens it in analysis. */
    readonly analyseIt: string;
    /** The same from the table set for the next game, where the last one no longer shows (D-77). */
    readonly analyseLast: string;
}

/** The words of the new game's dialog. */
export interface StartText
{
    readonly colour: string;
    readonly colours: Readonly<Record<Side | "random", string>>;
    readonly level: string;
    /** Each level of the AI's: its name, a note under it, and what the AI sees there (D-61). */
    readonly levels: Readonly<Record<AiLevel, readonly [name: string, note: string, sees: string]>>;
    readonly clock: string;
    /** Beside the clock's title: how to read 10+5. */
    readonly clockNote: string;
    readonly noClock: string;
    /** Above the button, while a game goes on. */
    readonly abandons: string;
    readonly start: string;
}

/** The words of the profiles. */
export interface ProfileText
{
    readonly welcome: string;
    readonly lead: string;
    /** Under the lead, when a game was played before the first profile. */
    readonly gameMoves: string;
    readonly name: string;
    readonly namePlaceholder: string;
    readonly avatar: string;
    readonly ownImage: string;
    readonly level: string;
    /** Each level, and a note under it. */
    readonly levels: Readonly<Record<Level, readonly [string, string]>>;
    readonly rating: string;
    readonly optional: string;
    readonly ratingPlaceholder: string;
    readonly ratingLabel: string;
    readonly siteLabel: string;
    readonly sites: Readonly<Record<RatingSite, string>>;
    readonly start: string;
    readonly create: string;
    readonly newProfile: string;
    readonly profiles: string;
    /** Under the profiles' title: what each one keeps. */
    readonly eachOwn: string;
    readonly changePlayer: string;
    readonly back: string;
    readonly changePicture: string;
    readonly yourPicture: string;
    readonly avatars: Readonly<Record<AvatarId, string>>;
    readonly whilePlaying: string;
    readonly badImage: string;
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
    | "draw-early"
    | "profile-game"
    | "game-going"
    | "pgn-unreadable";

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
    voice: "Read the AI's words aloud",
    newGame: "New game",
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
    bookBadges: "Mark the book moves",
    helps: "The AI teaches as you play",
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
    noGame: "No game yet: press + to start one, or ask for one in the chat.",
    noGameNow: "No game in progress",
    analysing: "Analysis in progress",
    badges: {
        brilliant: "Brilliant",
        great: "Great move",
        best: "Best move",
        excellent: "Excellent",
        good: "Good",
        book: "Book",
        inaccuracy: "Inaccuracy",
        mistake: "Mistake",
        miss: "Miss",
        blunder: "Blunder",
    },
    reviewBy: (name) => `${name}'s review`,
    drawn: { green: "better", red: "threat", yellow: "another way", blue: "plan" },
    reviewing: (name) => `${name} is going over the game…`,
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
    clearChat: (name) => `Before a new game, clear your chat with ${name}: in the window where you opened ${name}, not here, write /clear, then a message such as "new game". A clean chat plays faster.`,
    offline: (name) => `${name} is not connected. Write it a message in the window where you opened ${name}, not in this page's chat: the page connects again by itself.`,
    startClocks: "Start",
    asleep: (name) => `${name} is not listening: write a message, such as "hi", in the window where you opened ${name}, not here. Its clock waits until it answers.`,
    commandHere: (name) => `/clear and the other commands go in the window where you opened ${name}, not here.`,
    refused: {
        "no-game": () => "There is no game going on: press + to start one, or ask for one in the chat.",
        "ai-to-move": () => "Wait for the AI's move.",
        illegal: () => "That move is not legal here.",
        "clear-chat": (most, name) => english.clearChat(name),
        "words-empty": () => "Write something first.",
        "words-spent": () => "You have used up your words for this move: write again after the AI's move.",
        "words-long": (most) => `Write at most ${most} characters.`,
        "words-longer-than-left": (most) => `You have ${most} characters left until the AI's move.`,
        "draw-offered": () => "A draw offer stands already.",
        "draw-none": () => "There is no draw offer to answer.",
        "draw-early": () => "You can offer a draw once each side has made a move.",
        "profile-game": () => english.profile.whilePlaying,
        "game-going": () => "A game is going on: finish it before you bring another to analyse.",
        "pgn-unreadable": () => "Chesspal cannot read this PGN: check you copied the whole game, its tags and its moves.",
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
    profile: {
        welcome: "Welcome to Chesspal",
        lead: "One minute, and we play. You can change it all whenever you like.",
        gameMoves: "The game you started goes into your profile.",
        name: "What's your name?",
        namePlaceholder: "Your name",
        avatar: "Choose a picture",
        ownImage: "Use a picture of yours",
        level: "How do you play?",
        levels: {
            learning: ["I've just learned", "I know the rules, little more"],
            casual: ["I play now and then", "With friends or on my phone"],
            regular: ["I play often", "Online or at a club"],
            tournament: ["I play tournaments", "I have a FIDE rating"],
        },
        rating: "Do you have a rating?",
        optional: "optional",
        ratingPlaceholder: "e.g. 1450",
        ratingLabel: "Rating",
        siteLabel: "Where",
        sites: { "lichess": "on Lichess", "chess.com": "on Chess.com", "fide": "FIDE" },
        start: "Start playing",
        create: "Done",
        newProfile: "Add a player",
        profiles: "Who's playing?",
        eachOwn: "Each player has their own games and settings.",
        changePlayer: "Change player",
        back: "Back",
        changePicture: "Change picture",
        yourPicture: "Your picture: change it",
        avatars: { "short-hair": "Short hair", bun: "Bun", glasses: "Glasses", beanie: "Beanie", beard: "Beard", curls: "Curls", cat: "Cat", owl: "Owl" },
        whilePlaying: "Finish the game, or resign, before changing player.",
        badImage: "That picture won't open: try another photo (the ones from a phone usually work).",
    },
    start: {
        colour: "You play",
        colours: { white: "White", black: "Black", random: "Either" },
        level: "The AI's level",
        levels: {
            beginner: ["Beginner", "Board and legal moves", "The AI sees the board and its legal moves; Chesspal tells it no hanging pieces or threats."],
            club: ["Club", "Plus hanging pieces and threats", "The AI sees the board and tactics; no strategy, no theory."],
            strong: ["Strong", "Plus structure: pawns, files, king", "The AI sees the board, tactics and strategy; no theory."],
            master: ["Master", "As Strong, plus the opening book", "The AI sees the board, tactics, strategy and theory."],
        },
        clock: "Clock",
        clockNote: "minutes each + seconds a move",
        noClock: "None",
        abandons: "The game going on goes to the archive unfinished.",
        start: "Start",
    },
    study: {
        title: "Analyses",
        paste: "Paste the game's PGN",
        file: "or choose a .pgn file",
        note: "The game is kept to study; the AI goes over it with you in the chat.",
        start: "Analyse",
        yours: "Your analyses",
        bring: "Bring a game",
        reviewed: "reviewed",
        unreviewed: "to review",
        moves: (count) => `${count} ${count === 1 ? "move" : "moves"}`,
        download: "Save PGN",
        analyseIt: "Analyse the game",
        analyseLast: "Analyse the last game",
    },
};

const italian: Text = {
    language: "it",
    flip: "Gira",
    theme: "Tema chiaro o scuro",
    sounds: "Suoni",
    voice: "Leggi ad alta voce le parole dell'AI",
    newGame: "Nuova partita",
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
    bookBadges: "Segna le mosse da libro",
    helps: "L'AI ti insegna mentre giochi",
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
    noGame: "Nessuna partita: premi + per iniziarne una, o chiedila nella chat.",
    noGameNow: "Nessuna partita in corso",
    analysing: "Analisi in corso",
    badges: {
        brilliant: "Geniale",
        great: "Ottima mossa",
        best: "Mossa migliore",
        excellent: "Eccellente",
        good: "Buona",
        book: "Teoria",
        inaccuracy: "Imprecisione",
        mistake: "Errore",
        miss: "Occasione persa",
        blunder: "Errore grave",
    },
    reviewBy: (name) => `Il giudizio di ${name}`,
    drawn: { green: "meglio", red: "minaccia", yellow: "altra via", blue: "piano" },
    reviewing: (name) => `${name} sta analizzando la partita…`,
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
    clearChat: (name) =>
        `Prima di una nuova partita azzera la conversazione con ${name}: nella finestra dove hai aperto ${name}, non qui, scrivi /clear e poi un messaggio, per esempio "nuova partita". Con la chat pulita l'AI gioca più veloce.`,
    offline: (name) => `${name} è scollegato. Scrivigli un messaggio nella finestra dove hai aperto ${name}, non nella chat di questa pagina: la pagina si ricollega da sola.`,
    startClocks: "Inizia",
    asleep: (name) => `${name} non ti sta ascoltando: scrivi un messaggio, per esempio "ciao", nella finestra dove hai aperto ${name}, non qui. Il suo orologio aspetta che risponda.`,
    commandHere: (name) => `/clear e gli altri comandi vanno scritti nella finestra dove hai aperto ${name}, non qui.`,
    refused: {
        "no-game": () => "Nessuna partita in corso: premi + per iniziarne una, o chiedila nella chat.",
        "ai-to-move": () => "Aspetta la mossa dell'AI.",
        illegal: () => "Questa mossa qui non è legale.",
        "clear-chat": (most, name) => italian.clearChat(name),
        "words-empty": () => "Scrivi prima qualcosa.",
        "words-spent": () => "Hai finito le parole per questa mossa: scrivi di nuovo dopo quella dell'AI.",
        "words-long": (most) => `Scrivi al massimo ${most} caratteri.`,
        "words-longer-than-left": (most) => `Ti restano ${most} caratteri fino alla mossa dell'AI.`,
        "draw-offered": () => "C'è già una proposta di patta.",
        "draw-none": () => "Non c'è una proposta di patta a cui rispondere.",
        "draw-early": () => "Puoi proporre patta dopo una mossa a testa.",
        "profile-game": () => italian.profile.whilePlaying,
        "game-going": () => "C'è una partita in corso: finiscila prima di portarne un'altra da analizzare.",
        "pgn-unreadable": () => "Chesspal non riesce a leggere questo PGN: controlla di aver copiato la partita intera, intestazioni e mosse.",
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
    profile: {
        welcome: "Ti diamo il benvenuto in Chesspal",
        lead: "Un minuto, e giochiamo. Puoi cambiare tutto quando vuoi.",
        gameMoves: "La partita che avevi iniziato va nel tuo profilo.",
        name: "Come ti chiami?",
        namePlaceholder: "Il tuo nome",
        avatar: "Scegli un'immagine",
        ownImage: "Usa una tua immagine",
        level: "Come giochi?",
        levels: {
            learning: ["Ho appena imparato", "Conosco le regole, poco di più"],
            casual: ["Gioco ogni tanto", "Con amici o sul telefono"],
            regular: ["Gioco spesso", "Online o al circolo"],
            tournament: ["Gioco a torneo", "Ho un punteggio FIDE"],
        },
        rating: "Hai un punteggio?",
        optional: "facoltativo",
        ratingPlaceholder: "es. 1450",
        ratingLabel: "Punteggio",
        siteLabel: "Dove",
        sites: { "lichess": "su Lichess", "chess.com": "su Chess.com", "fide": "FIDE" },
        start: "Inizia a giocare",
        create: "Fatto",
        newProfile: "Aggiungi un giocatore",
        profiles: "Chi gioca?",
        eachOwn: "Ognuno ha le sue partite e le sue impostazioni.",
        changePlayer: "Cambia giocatore",
        back: "Indietro",
        changePicture: "Cambia immagine",
        yourPicture: "La tua immagine: cambiala",
        avatars: { "short-hair": "Capelli corti", bun: "Chignon", glasses: "Occhiali", beanie: "Berretto", beard: "Barba", curls: "Ricci", cat: "Gatto", owl: "Gufo" },
        whilePlaying: "Finisci la partita, o abbandona, prima di cambiare giocatore.",
        badImage: "Questa immagine non si apre: prova con un'altra foto (quelle del telefono di solito vanno bene).",
    },
    start: {
        colour: "Giochi col",
        colours: { white: "Bianco", black: "Nero", random: "A caso" },
        level: "Livello dell'AI",
        levels: {
            beginner: ["Principiante", "Scacchiera e mosse legali", "L'AI vede la scacchiera e le sue mosse legali; Chesspal non le dice pezzi in presa né minacce."],
            club: ["Circolo", "Più pezzi in presa e minacce", "L'AI vede scacchiera e tattica; niente strategia, niente teoria."],
            strong: ["Forte", "Più la struttura: pedoni, colonne, re", "L'AI vede scacchiera, tattica e strategia; niente teoria."],
            master: ["Maestro", "Come Forte, più il libro delle aperture", "L'AI vede scacchiera, tattica, strategia e teoria."],
        },
        clock: "Orologio",
        clockNote: "minuti a testa + secondi a mossa",
        noClock: "Senza",
        abandons: "La partita in corso va nell'archivio, non finita.",
        start: "Inizia",
    },
    study: {
        title: "Analisi",
        paste: "Incolla il PGN della partita",
        file: "oppure scegli un file .pgn",
        note: "La partita resta tra quelle da studiare; l'AI la commenta con te nella chat.",
        start: "Analizza",
        yours: "Le tue analisi",
        bring: "Porta una partita",
        reviewed: "commentata",
        unreviewed: "da commentare",
        moves: (count) => `${count} ${count === 1 ? "mossa" : "mosse"}`,
        download: "Scarica PGN",
        analyseIt: "Analizza la partita",
        analyseLast: "Analizza l'ultima partita",
    },
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
