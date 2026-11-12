// The page's words in the player's language (D-32): Italian or English, from the browser's or as the settings say (D-56).
import type { AiLevel, Badge, DrawColour, IllegalReason, Phase, PieceLetter, Side } from "../core/index.ts";
import type { BadgeKind } from "./board/signs.ts";
import type { Step } from "./game/browse.ts";
import type { HowEnded } from "./game/ending.ts";
import type { StrategyRow, Tone } from "./helps/view.ts";
import type { AvatarId, Level, Speed } from "./profile/profile.ts";

/** The words of the page in one language. */
export interface Text
{
    readonly language: string;
    readonly flip: string;
    readonly theme: string;
    readonly sounds: string;
    /** The switch that reads the AI's words aloud. */
    readonly voice: string;
    /** Why the voice's switch is off for good: the browser has no voice for the page's language. */
    readonly noVoice: string;
    /** A move the AI wrote as the voice reads it (Stefano): ♞xf6+ as "knight takes f6, check", never the figurine's name. */
    readonly saidMove: (move: SaidMove) => string;
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
    /** The setting that shows a square's name under the pointer. */
    readonly squareNames: string;
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
    /** The buttons that step through the moves. */
    readonly steps: Readonly<Record<Step, string>>;
    readonly noGame: string;
    /** The tooltips of a card's title in the game's column, which folds the card and opens it again (Stefano). */
    readonly foldCard: string;
    readonly openCard: string;
    /** The button that saves the moves alone as a PGN, for Lichess or chess.com, and its tooltip. */
    readonly saveMoves: string;
    readonly saveMovesHint: string;
    /** The header's word between games, on the table set for the next (D-77). */
    readonly noGameNow: string;
    /** A game the AI goes over with the player (D-69): what the header says, the badges it puts on the moves, and its word on the whole game. */
    readonly analysing: string;
    readonly badges: Readonly<Record<Badge, string>>;
    reviewBy(name: string): string;
    /** What the colours the AI draws with a note mean (D-69). */
    readonly drawn: Readonly<Record<DrawColour, string>>;
    /** Who is ahead as the AI estimates it (D-90): the bar in the game's card, the chart of the game in analysis, and what a screen reader says of them. */
    readonly lead: {
        readonly hint: string;
        readonly chart: string;
        readonly chartHint: string;
        readonly even: string;
        /** Before the AI's first estimate. */
        readonly none: string;
        /** On a position after the one the AI estimated. */
        readonly earlier: string;
        readonly drawn: string;
        ahead(side: Side, pawns: string): string;
        mate(side: Side, moves: number): string;
        mated(side: Side): string;
    };
    reviewing(name: string): string;
    /** A game in analysis whose review nobody is finishing, and the button that brings it back to the AI, with its tooltip (D-109). */
    readonly incomplete: string;
    readonly complete: string;
    readonly completeHint: string;
    readonly you: string;
    readonly ai: string;
    readonly sides: Readonly<Record<Side, string>>;
    readonly yourTurn: string;
    /** A player's clock, for a screen reader. */
    readonly clock: (time: string, running: boolean) => string;
    readonly send: string;
    readonly sent: string;
    readonly withMove: string;
    /** In analysis, under the box: the words go with the move shown, or with the whole game at its start (D-101). */
    readonly onMove: string;
    readonly onWholeGame: string;
    readonly talk: string;
    readonly move: string;
    readonly draw: string;
    /** A game closed before any move, which counts for no one. */
    readonly aborted: string;
    readonly checkmate: string;
    /** How a game ended, as the game's card says it under the result. */
    readonly ended: Readonly<Record<HowEnded, string>>;
    readonly opening: string;
    readonly outOfBook: string;
    readonly inBook: string;
    /** Before a new game the chat is cleared in the host named (Claude, Codex), not on the page. */
    clearChat(name: string): string;
    /** The page lost its server, which lives in the host's chat: where to write to bring it back. */
    offline(name: string): string;
    /** The player's folder was set up by an older Chesspal. */
    outdated(name: string): string;
    /** A newer Chesspal on npm (D-108): the header's mark and its window on the table, which installs it between games; a chat's own page says the command. */
    readonly update: {
        mark(version: string): string;
        readonly title: string;
        /** The version out, and the one the table runs when the page knows it. */
        offer(version: string, current: string | undefined): string;
        /** What becomes of the chat at the table: the one Chesspal holds starts again, the one opened by hand is the player's to open again. */
        chatAgain(name: string): string;
        byHand(name: string): string;
        readonly whilePlaying: string;
        readonly install: string;
        installing(version: string): string;
        /** Installed while a game or the chat's answer went on: the table starts again once they end. */
        readonly installed: string;
        /** npm failed: the commands to type follow, each on its line. */
        readonly failed: string;
        /** On a chat's own page: the command to type follows. */
        notice(version: string, name: string): string;
        /** Its ×, which hides it until a newer version still is out. */
        readonly hide: string;
    };
    /** The page is served, but no chat hears the player (never started, or just cleared): where to write to wake it; its clock waits. */
    asleep(name: string): string;
    /** The same over a game in analysis, where no clock waits (Zoe). */
    asleepInAnalysis(name: string): string;
    /** The table with no chat at it (D-104): the hosts that open one in a terminal, the model and effort beside each, and the command to type instead. */
    readonly table: {
        /** The chat's window (D-107): its title, and what it says with no chat at the table, with one it can start again, and with one opened by hand. */
        readonly title: string;
        readonly choose: string;
        /** The same, opened to have a game analysed (D-109). */
        readonly reviewTitle: string;
        readonly reviewChoose: string;
        readonly restartHint: string;
        byHand(name: string): string;
        /** The title of the AI's name, which opens the window: with no chat at the table, and with one. */
        readonly noChat: string;
        readonly change: string;
        install(name: string): string;
        readonly model: string;
        readonly effort: string;
        asHost(host: string): string;
        /** Where the asleep note stands: a chat opening, starting again for a new game, or with another model or host, and waiting to. */
        readonly opening: string;
        again(name: string): string;
        readonly restart: string;
        waiting(name: string): string;
        /** The marks on a start again: the ↻ of the row whose choices changed, and those of the one that waits, to start it at once or let it go. */
        readonly restartChanged: string;
        readonly restartNow: string;
        readonly cancel: string;
        readonly failed: string;
        readonly notRestarted: string;
        readonly typeIt: string;
    };
    /** The thought cloud on the Torretta, by what the AI thinks on: its move, or on the player's time (D-72). */
    thinking: { readonly move: string; readonly ponder: string; };
    /** The button that starts the clocks, which wait for the player from the game's start. */
    readonly startClocks: string;
    /** A command such as /clear written in the page's talk, which is for the host's window. */
    commandHere(name: string): string;
    /** The choice of the piece a pawn becomes on the last rank. */
    readonly promoteTo: string;
    /** A square the piece picked may go to, for a screen reader. */
    readonly canGo: string;
    /** The board for a screen reader: who moves, and the last move. */
    boardLabel(turn: Side, lastMove: string | undefined): string;
    /** A request the server refused, by its code, with the characters left for words too long and the host's name. */
    readonly refused: Readonly<Record<ServerRefusal, (most: number, name: string) => string>>;
    piece(letter: PieceLetter, side: Side): string;
    taken(pieces: readonly string[], ahead: number): string;
    writeTo(name: string): string;
    /** In analysis, the box's placeholder (D-101). */
    askAbout(name: string): string;
    /** The move a line of the player's was written on, to go back to it. */
    goTo(move: string): string;
    readBy(name: string): string;
    wrote(name: string): string;
    /** The header's words after the AI's name: its draw offer that stands, the player's it declined by its move (D-65). */
    readonly offers: string;
    readonly declines: string;
    started(when: string): string;
    lasted(count: number): string;
    won(side: Side): string;
    toMove(side: Side): string;
    /** The header's word on a game over: how it ended and who won. */
    verdict(how: HowEnded | undefined, winner: Side | undefined): string;
    /** Why the board refuses a move (D-18): the piece moved, the square it went to, the piece that forbids it. */
    illegal(move: RefusedMove): string;
    /** The profiles (D-23, D-45): the wizard at the first start, the player's picture, the menu of the profiles. */
    readonly profile: ProfileText;
    /** The new game's dialog (D-48). */
    readonly start: StartText;
    /** The dialog that brings a game played elsewhere to analyse. */
    readonly study: StudyText;
    /** The helps' card (D-78): the facts the AI sees at the game's level. */
    readonly helpsCard: HelpsCardText;
    readonly legend: LegendText;
    /** The guide, from the book in the header, with the credits. */
    readonly guide: GuideText;
    /** The page's foot, under the board. */
    readonly foot: FootText;
}

/** The words of the guide's dialog and of its credits. */
export interface GuideText
{
    readonly title: string;
    /** The index of its pages, for a screen reader. */
    readonly contents: string;
    /** The arrows at a page's foot, for a screen reader: the previous page, the next. */
    readonly previous: string;
    readonly next: string;
    readonly credits: string;
    /** The credits, as the README has them: each a line, with its links in markdown. */
    readonly creditLines: readonly string[];
}

/** The words of the page's foot. */
export interface FootText
{
    readonly onGitHub: string;
    readonly onNpm: string;
    readonly support: string;
}

/** The words of the helps' card. */
export interface HelpsCardText
{
    readonly title: string;
    /** The coach's words in the card (D-88), and the line that opens its hint and closes it. */
    readonly coach: string;
    readonly showHint: string;
    readonly hideHint: string;
    /** What the hint's colours mean, as the coach draws them: never a move (Zoe). */
    readonly drawn: Readonly<Record<DrawColour, string>>;
    readonly tactics: string;
    readonly strategy: string;
    readonly map: string;
    readonly mapHint: string;
    /** The button held to see the board without the arrows and the squares drawn on it (Stefano). */
    readonly bare: string;
    readonly bareHint: string;
    readonly attackers: string;
    readonly defenders: string;
    /** Why a piece is at risk, as a noun (Anatolij's words). */
    readonly undefended: string;
    readonly cheaper: string;
    readonly outnumbered: string;
    /** A pin, after the pinned piece: the piece behind it, then the one that pins it, each with its article. */
    pinnedTo(letter: PieceLetter): string;
    pinnedBy(letter: PieceLetter): string;
    /** A skewer, after the piece in front: the piece behind it; then the one that skewers it, as `pinnedBy`. */
    skeweredBefore(letter: PieceLetter): string;
    readonly nothingAtRisk: string;
    /**
     * A line of the tactics (D-91): a side's pieces at risk, pinned or skewered, or its checks (`toMove` its own, else the ones it would have if it
     * moved), from the player's side when the page knows it.
     */
    line(kind: "risk" | "pin" | "skewer" | "check", side: Side, you: Side | undefined, toMove: boolean): string;
    readonly loose: string;
    /** The loose pieces' counts, the player's and the other side's. */
    readonly yours: string;
    readonly theirs: string;
    /** After the player's side's name in the strategy. */
    readonly you: string;
    readonly white: string;
    readonly black: string;
    /** Each line of the strategy: its name, and what it means for whoever does not know the word (Rosa). */
    readonly rows: Readonly<Record<StrategyRow, readonly [name: string, meaning: string]>>;
    readonly yes: string;
    readonly notYet: string;
    readonly noMore: string;
    readonly phases: Readonly<Record<Phase, string>>;
    /** The bar of the squares each side controls: the sentence that says it whole, and each part's title, "(you)" after the player's side. */
    controlled(white: number, black: number, both: number): string;
    controlledBy(who: Side | "both", count: number, you: boolean): string;
    /** The open files' tile, which counts both sides' together. */
    readonly bothSides: string;
    readonly oppositeBishops: string;
    repetitions(times: number): string;
    fiftyMoves(halfMoves: number): string;
    readonly insufficient: string;
    pawnSquare(pawn: string, caught: boolean): string;
    opposition(side: Side): string;
}

/** The words of the legend of the marks on the board (D-99). */
export interface LegendText
{
    readonly title: string;
    readonly hint: string;
    readonly none: string;
    /** After a judgment's name, what it is. */
    readonly badge: string;
    /** A piece at risk, pinned or skewered: the player's, the other side's, or a side's when the page does not know theirs (D-91). */
    sign(kind: "risk" | "pin" | "skewer", tone: Tone): string;
    readonly pinLine: string;
    readonly skewerLine: string;
    /** After a colour's word, who drew it: the AI by its name, or the coach. */
    drawnBy(name: string): string;
    readonly drawnByCoach: string;
    readonly control: string;
    readonly ends: Readonly<Record<BadgeKind, string>>;
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
    /** The list of the analyses, and the step that loads a new game (D-92), with its line. */
    readonly yours: string;
    readonly bring: string;
    readonly bringNote: string;
    /** The search's hint, and what it says when it finds none. */
    readonly search: string;
    readonly noMatch: string;
    readonly reviewed: string;
    readonly unreviewed: string;
    moves(count: number): string;
    /** How a game of the player's went for them. */
    readonly outcome: { readonly won: string; readonly lost: string; readonly drawn: string; };
    /** A row's menu (D-92): its button, its items with their lines, and the question each asks in the row. */
    readonly more: string;
    readonly redo: string;
    readonly redoNote: string;
    readonly unreview: string;
    readonly unreviewNote: string;
    readonly remove: string;
    askRedo(game: string, by: string | undefined): { readonly question: string; readonly note: string; readonly yes: string; };
    askUnreview(game: string): { readonly question: string; readonly note: string; readonly yes: string; };
    askRemove(game: string, when: string | undefined): { readonly question: string; readonly note: string; readonly yes: string; };
    readonly cancel: string;
    /**
     * The player's latest games on the sites, above the paste field (D-110): the title, the lines while they come, with none, without a name on any site,
     * with its button to the profile, and when both sites did not answer (one alone is said as the profile says it); why the server refused the list; the
     * side the player had; a speed as the site names it, in the player's words.
     */
    readonly siteGames: string;
    readonly siteGamesLoading: string;
    readonly siteGamesNone: string;
    readonly siteGamesNoAccount: string;
    readonly siteGamesProfile: string;
    readonly bothUnreached: string;
    readonly siteGamesRefused: Readonly<Record<"game-going" | "no-accounts" | "no-network", string>>;
    readonly playedAs: Readonly<Record<Side, string>>;
    speed(name: string): string;
    /** The column's button that saves the game in analysis with its review, and its tooltip. */
    readonly download: string;
    readonly downloadHint: string;
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
    /** Under the lead, when a game was played before the wizard. */
    readonly gameMoves: string;
    readonly name: string;
    readonly namePlaceholder: string;
    /** Before the data folder's path. */
    readonly gamesIn: string;
    readonly openFolder: string;
    /** On the button for a moment, once the file manager has opened it. */
    readonly opened: string;
    /** When the system's file manager could not open it. */
    readonly noFolder: string;
    /** Documents as the file manager names it in the player's language: the path on disk says Documents. */
    readonly documents: string;
    readonly avatar: string;
    readonly ownImage: string;
    readonly level: string;
    /** Each level, and a note under it. */
    readonly levels: Readonly<Record<Level, readonly [string, string]>>;
    readonly optional: string;
    /** Under the names on the sites: what Chesspal reads there, and what not. */
    readonly privacy: string;
    /** The speeds of a rating, in the title of the number beside a site's name. */
    readonly speeds: Readonly<Record<Speed, string>>;
    /** The title of a rating: its speed, and the day of the last game at that speed. */
    readonly ratingTitle: (speed: string, played: string | undefined) => string;
    /** The line under the names when a site does not know one, beside its cross. */
    readonly notFound: (site: string) => string;
    /** The line under the names when a site did not answer, beside its dash. */
    readonly unreached: (site: string) => string;
    /** The title of the dots beside a name whose site is being asked. */
    readonly pending: string;
    readonly start: string;
    readonly create: string;
    readonly newProfile: string;
    readonly profiles: string;
    /** Under the profiles' title: what each one keeps. */
    readonly eachOwn: string;
    readonly changePlayer: string;
    readonly back: string;
    /** The profile window's title. */
    readonly yourProfile: string;
    /** On the pencil beside the player in the menu. */
    readonly editProfile: string;
    readonly avatars: Readonly<Record<AvatarId, string>>;
    readonly whilePlaying: string;
    /** Above the names on Lichess and Chess.com and the FIDE rating, in the wizard and the profile window. */
    readonly accounts: string;
    /** The empty field of a name on Lichess or Chess.com. */
    readonly username: string;
    /** On the fields of the names on Lichess and Chess.com: what they are for. */
    readonly accountTitle: string;
    /** The empty field of the FIDE rating, its title, and the line under the fields when it is out of FIDE's range. */
    readonly fidePlaceholder: string;
    readonly fideTitle: string;
    readonly fideRange: (lowest: number, highest: number) => string;
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
    | "pgn-unreadable"
    | "update-game"
    | "update-chat";

/**
 * A move the board refused, as the page names it: why, the piece moved, the square it went to and whether a piece stood there, the piece that forbids
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

/**
 * A move the AI wrote, as the voice reads it: a castling, or the piece, the file or rank it comes from when the move says it, whether it takes, its square
 * and what a pawn becomes; and a check or a mate.
 */
export type SaidMove =
    & ({ readonly castles: "short" | "long"; } | {
        readonly piece: PieceLetter;
        readonly from?: string;
        readonly takes: boolean;
        readonly square: string;
        readonly promotion?: PieceLetter;
    })
    & { readonly check?: "check" | "mate"; };

/** The words for the first of the browser's languages the page speaks, else English. */
export function textFor(languages: readonly string[]): Text
{
    const known = languages.map((language) => language.slice(0, 2).toLowerCase()).find((language) => language === "it" || language === "en");
    return known === "it" ? italian : english;
}

const englishNames: Readonly<Record<PieceLetter, string>> = { K: "king", Q: "queen", R: "rook", B: "bishop", N: "knight", P: "pawn" };
const italianNames: Readonly<Record<PieceLetter, string>> = { K: "re", Q: "donna", R: "torre", B: "alfiere", N: "cavallo", P: "pedone" };

// The words a move is read aloud with: the pieces, castling, where it comes from, where it goes or what it takes, what a pawn becomes, check and mate.
interface MoveWords
{
    readonly names: Readonly<Record<PieceLetter, string>>;
    readonly castles: Readonly<Record<"short" | "long", string>>;
    readonly from: string;
    readonly to: string;
    readonly takes: string;
    readonly promotes: string;
    readonly check: Readonly<Record<"check" | "mate", string>>;
}

const englishMoveWords: MoveWords = {
    names: englishNames,
    castles: { short: "castles short", long: "castles long" },
    from: "from",
    to: "to",
    takes: "takes",
    promotes: "promotes to",
    check: { check: "check", mate: "checkmate" },
};

const italianMoveWords: MoveWords = {
    names: italianNames,
    castles: { short: "arrocco corto", long: "arrocco lungo" },
    from: "da",
    to: "in",
    takes: "prende",
    promotes: "promuove a",
    check: { check: "scacco", mate: "scacco matto" },
};

const english: Text = {
    language: "en",
    flip: "Flip",
    theme: "Light or dark theme",
    sounds: "Sounds",
    voice: "Read the AI's words aloud",
    noVoice: "This browser has no voice for this language: add one in your system's settings",
    saidMove: (move) => moveInWords(englishMoveWords, move),
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
    squareNames: "The square's name under the pointer",
    explain: "Explain the moves refused",
    bookBadges: "Mark the book moves",
    helps: "The AI teaches as you play",
    languageChoice: "Language",
    languages: { auto: "As the browser", it: "Italiano", en: "English" },
    names: {
        nitida: "Nitida",
        torretta: "Torretta",
        capablanca: "Capablanca",
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
    foldCard: "Fold the card",
    openCard: "Open the card",
    saveMoves: "PGN",
    saveMovesHint: "The moves alone, to open on Lichess or chess.com",
    noGameNow: "No game in progress",
    analysing: "Analysis",
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
    lead: {
        hint: "Who is ahead, in pawns, as the AI estimates it: Chesspal does not compute it",
        chart: "How the game went",
        chartHint: "Who was ahead move by move, as the AI estimated it: click to go to that move",
        even: "Even",
        none: "No estimate yet",
        earlier: "Estimated before the last move",
        drawn: "Drawn on the board",
        ahead: (side, pawns) => `${side === "white" ? "White" : "Black"} ahead by ${pawns} pawns`,
        mate: (side, moves) => `${side === "white" ? "White" : "Black"} mates in ${moves}`,
        mated: (side) => `${side === "white" ? "White" : "Black"} is mated`,
    },
    reviewing: (name) => `${name} is going over the game…`,
    incomplete: "Analysis not complete",
    complete: "Complete it",
    completeHint: "Complete the analysis",
    you: "You",
    ai: "AI",
    sides: { white: "White", black: "Black" },
    yourTurn: "your move",
    clock: (time, running) => `Clock: ${time}${running ? ", running" : ""}`,
    send: "Send",
    sent: "Sent",
    withMove: "Or move: your words go with it",
    onMove: "On",
    onWholeGame: "On the whole game",
    talk: "The talk",
    move: "Move",
    draw: "draw",
    aborted: "Game aborted",
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
    outdated: (name) => `Chesspal has been updated, but this folder still has its old files: close the chat with ${name}, run chesspal init in this folder, and open a new chat.`,
    update: {
        mark: (version) => `Chesspal ${version} is out: update`,
        title: "Update Chesspal",
        offer: (version, current) => `Chesspal ${version} is out${current === undefined ? "" : `; this is ${current}`}. The table installs it and starts again by itself.`,
        chatAgain: (name) => `The chat with ${name} starts again too, clean.`,
        byHand: (name) => `You opened the chat with ${name} yourself: afterwards, close it and open a new one.`,
        whilePlaying: "A game is going on: finish it, then update.",
        install: "Update",
        installing: (version) => `Installing ${version}…`,
        installed: "Installed: the table starts again by itself once the game is over.",
        failed: "Chesspal was not updated: close the chat, then type in a terminal, one after the other:",
        notice: (version, name) => `Chesspal ${version} is out: close the chat with ${name}, type this command in a terminal, then open a new chat.`,
        hide: "Hide until the next version",
    },
    offline: (name) => `${name} is not connected. Write it a message in the window where you opened ${name}, not in this page's chat: the page connects again by itself.`,
    startClocks: "Start",
    thinking: { move: "Thinking about its move", ponder: "Thinking while you play" },
    asleep: (name) => `${name} is not listening: write a message, such as "hi", in the window where you opened ${name}, not here. Its clock waits until it answers.`,
    asleepInAnalysis: (name) => `${name} is not listening: write to it in the window where you opened it, not here.`,
    table: {
        title: "Who are you playing?",
        choose: "Choose the chat to play with: it opens in a window of its own, to keep open.",
        reviewTitle: "Who reviews the game?",
        reviewChoose: "Choose the chat that reviews the game: it opens in a window of its own, to keep open.",
        restartHint: "Choose the model and effort, then press Claude Code or Codex: the chat starts again, clean, in the same window, once it has ended its answer. The game stays as it is.",
        byHand: (name) => `You opened this chat yourself: change ${name}'s model with /model in its window, or close it and open one from here, with the choices below.`,
        noChat: "No chat at the table: choose one",
        change: "Change the chat or its model",
        install: (name) => `To play with ${name}, install Claude Code or Codex, then open this page again.`,
        model: "Model",
        effort: "Effort",
        asHost: (host) => `as set in ${host}`,
        opening: "Opening the chat… In the terminal, if it asks whether you trust the folder, choose Yes with the arrow keys and press Enter.",
        again: (name) => `${name} starts again with a clean chat for the new game…`,
        restart: "The chat starts again, clean…",
        waiting: (name) => `${name} starts again once it has ended its answer…`,
        restartChanged: "Starts again, clean, with the new choices",
        restartNow: "Start again now: it cuts the answer it is giving",
        cancel: "Do not start again",
        failed: "The terminal did not open: type the command below in a terminal.",
        notRestarted: "The chat did not start again: close its window, then open another from here.",
        typeIt: "Or type in a terminal:",
    },
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
        "update-game": () => english.update.whilePlaying,
        "update-chat": (most, name) => `${name} is answering: update once it has done.`,
    },
    piece: (letter, side) => `${side} ${englishNames[letter]}`,
    taken: (pieces, ahead) => `Pieces taken: ${pieces.length === 0 ? "none" : pieces.join(", ")}${ahead > 0 ? `; ahead by ${ahead}` : ""}`,
    writeTo: (name) => `Write to ${name}…`,
    askAbout: (name) => `Ask ${name} about this game…`,
    goTo: (move) => `Go to ${move}`,
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
        gameMoves: "The game you started stays in your profile.",
        name: "What's your name?",
        namePlaceholder: "Your name",
        gamesIn: "Your games are in",
        openFolder: "Open the folder",
        opened: "Opened",
        noFolder: "It cannot be opened from here: look for it at the path above.",
        documents: "Documents",
        avatar: "Choose a picture",
        ownImage: "Use a picture of yours",
        level: "How do you play?",
        levels: {
            learning: ["I've just learned", "I know the rules, little more"],
            casual: ["I play now and then", "With friends or on my phone"],
            regular: ["I play often", "Online or at a club"],
            tournament: ["I play tournaments", "At a club, with a rating"],
        },
        optional: "optional",
        privacy: "We only read your public rating. No password.",
        speeds: { rapid: "rapid", classical: "classical", blitz: "blitz" },
        ratingTitle: (speed, played) => (played === undefined ? speed : `${speed} · last game ${played}`),
        notFound: (site) => `${site} has no player of this name`,
        unreached: (site) => `${site} isn't answering: we'll try again later`,
        pending: "Reading your rating…",
        start: "Start playing",
        create: "Done",
        newProfile: "Add a player",
        profiles: "Who's playing?",
        eachOwn: "Each player has their own games and settings.",
        changePlayer: "Change player",
        back: "Back",
        yourProfile: "Your profile",
        editProfile: "Edit your profile",
        avatars: { "short-hair": "Short hair", bun: "Bun", glasses: "Glasses", beanie: "Beanie", beard: "Beard", curls: "Curls", moustache: "Moustache", "silver-bob": "Silver bob", cat: "Cat", owl: "Owl" },
        whilePlaying: "Finish the game, or resign, before changing player.",
        accounts: "Do you play on Lichess, Chess.com or in FIDE tournaments?",
        username: "your username",
        accountTitle: "With your name there, a game you load from there knows which side is yours.",
        fidePlaceholder: "your rating",
        fideTitle: "Your FIDE rating, as FIDE lists it: Chesspal cannot read it by itself.",
        fideRange: (lowest, highest) => `A FIDE rating goes from ${lowest} to ${highest}`,
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
        bring: "Load a game",
        bringNote: "from Lichess or Chess.com, or a PGN pasted or from a file",
        search: "Names, models, openings…",
        noMatch: "No game found",
        reviewed: "reviewed",
        unreviewed: "to review",
        moves: (count) => `${count} ${count === 1 ? "move" : "moves"}`,
        outcome: { won: "won", lost: "lost", drawn: "drawn" },
        more: "More",
        redo: "Analyse again",
        redoNote: "with your chat's model and effort",
        unreview: "Delete the analysis",
        unreviewNote: "the game stays, to review",
        remove: "Delete the game",
        askRedo: (game, by) => ({
            question: `Analyse ${game} again?`,
            note: `${by === undefined ? "The review" : `The review by ${by}`} is deleted; your chat's analyst writes it again, with the model and effort it has now.`,
            yes: "Analyse again",
        }),
        askUnreview: (game) => ({ question: `Delete the analysis of ${game}?`, note: "Its badges, notes and the coach's judgments go; the game stays.", yes: "Delete" }),
        askRemove: (game, when) => ({ question: `Delete the game ${game}${when === undefined ? "" : ` of ${when}`}?`, note: "With its analysis. It cannot be undone.", yes: "Delete" }),
        cancel: "Cancel",
        siteGames: "Your latest games on the sites",
        siteGamesLoading: "Asking Lichess and Chess.com…",
        siteGamesNone: "No finished game on the sites.",
        siteGamesNoAccount: "Your names on Lichess and Chess.com bring your latest games here.",
        siteGamesProfile: "Add them",
        bothUnreached: "Lichess and Chess.com aren't answering: we'll try again later",
        siteGamesRefused: {
            "game-going": "A game is going on: finish it to bring another.",
            "no-accounts": "Your profile names no account on Lichess or Chess.com.",
            "no-network": "Chesspal cannot reach the sites from here.",
        },
        playedAs: { white: "You played White", black: "You played Black" },
        speed: (name) => ({ ultraBullet: "ultrabullet", correspondence: "correspondence", daily: "daily" } as Record<string, string>)[name] ?? readableSpeed(name),
        download: "Annotated PGN",
        downloadHint: "The game with the review's comments and judgments",
        analyseIt: "Analyse the game",
        analyseLast: "Analyse the last game",
    },
    helpsCard: {
        title: "Helps",
        coach: "The coach",
        showHint: "Show hint",
        hideHint: "Hide hint",
        drawn: { green: "idea", red: "threat", yellow: "line", blue: "target" },
        tactics: "Tactics",
        strategy: "Strategy",
        map: "Map",
        mapHint: "Hold it, or the M key, to see who controls each square; on a phone, a touch turns it on and off",
        bare: "Hide the drawings",
        bareHint: "Hold it to see the board without the arrows, the marked squares and the helps' signs; on a phone, a touch hides them and shows them again",
        attackers: "attackers",
        defenders: "defenders",
        undefended: "no defender",
        cheaper: "a cheaper attacker",
        outnumbered: "more attackers than defenders",
        pinnedTo: (letter) => `pinned to the ${englishNames[letter]}`,
        pinnedBy: (letter) => `by the ${englishNames[letter]}`,
        skeweredBefore: (letter) => `ahead of the ${englishNames[letter]}`,
        nothingAtRisk: "No piece at risk, no pins.",
        line: (kind, side, you, toMove) => {
            const name = side === "white" ? "White" : "Black";
            const pieces = { risk: "pieces at risk", pin: "pinned pieces", skewer: "skewered pieces" };

            if (you === undefined) {
                return kind === "check" ? `${name}'s checks${toMove ? "" : `, if it were ${name}'s move`}` : `${name}'s ${pieces[kind]}`;
            }

            if (kind === "check") {
                return side === you ? `Checks you ${toMove ? "can" : "could"} give` : `Checks the opponent ${toMove ? "can" : "could"} give you`;
            }

            return `${side === you ? "Your" : "The opponent's"} ${pieces[kind]}`;
        },
        loose: "Pieces neither attacked nor defended",
        yours: "yours",
        theirs: "the opponent's",
        you: "(you)",
        white: "White",
        black: "Black",
        rows: {
            isolated: ["Isolated pawns", "A pawn with no pawn of its colour on the files beside it: no pawn can defend it."],
            doubled: ["Doubled pawns", "Two pawns of one colour on the same file."],
            backward: ["Backward pawns", "A pawn left behind the pawns beside it, with the square in front of it attacked by an enemy pawn."],
            passed: ["Passed pawns", "No enemy pawn in front of it, on its file or the files beside it."],
            islands: ["Pawn islands", "Groups of pawns on neighbouring files, apart from each other."],
            openFiles: ["Open files", "Files with no pawn of either side."],
            halfOpen: ["Half-open files", "Files with enemy pawns and none of one's own."],
            heavyOnFiles: ["Rooks and queens on open files", "Rooks and queens on open or half-open files."],
            onSeventh: ["Rooks and queens on the seventh", "Rooks and queens on the enemy's second rank: the seventh for White, the second for Black."],
            outposts: ["Outposts", "Squares on one's ranks 4 to 6, defended by a pawn, that no enemy pawn can ever attack."],
            bishopPair: ["Bishop pair", "Both bishops still on the board."],
            space: ["Space", "How many squares of the enemy's half one's pieces attack."],
            undeveloped: ["Minor pieces not developed", "Knights and bishops still on their first squares."],
            castled: ["Castling", "How it castled; a dash while it still can, a cross once the king or the rooks have moved."],
            kingAttacks: ["Enemy attacks around the king", "How many enemy attacks fall on the squares next to the king."],
        },
        yes: "yes",
        notYet: "not yet",
        noMore: "no more",
        phases: { opening: "Opening", middlegame: "Middlegame", endgame: "Endgame" },
        controlled: (white, black, both) => `Squares only White's ${white}, only Black's ${black}, both ${both}`,
        controlledBy: (who, count, you) => {
            if (who === "both") {
                return `Squares both control: ${count}`;
            }

            return `Squares only ${who === "white" ? "White" : "Black"}${you ? " (you)" : ""} controls: ${count}`;
        },
        bothSides: "both sides",
        oppositeBishops: "Bishops of opposite colours",
        repetitions: (times) => `This position has stood ${times} times`,
        fiftyMoves: (halfMoves) => `${halfMoves} half-moves left before the fifty-move draw`,
        insufficient: "Too little material to mate",
        pawnSquare: (pawn, caught) => `The enemy king is ${caught ? "inside" : "outside"} the square of the pawn on ${pawn}`,
        opposition: (side) => `${side === "white" ? "White" : "Black"} has the opposition`,
    },
    legend: {
        title: "Marks on the board",
        hint: "Marks on the board (?)",
        none: "No marks on the board now",
        badge: "the move's judgment",
        sign: (kind, tone) => `${tone === "threat" ? "Your" : tone === "chance" ? "Opponent's" : "A"} ${{ risk: "piece at risk", pin: "pinned piece", skewer: "skewered piece" }[kind]}`,
        pinLine: "The pin's line",
        skewerLine: "The skewer's line",
        drawnBy: (name) => `drawn by ${name}`,
        drawnByCoach: "drawn by the coach",
        control: "How many of White's pieces and of Black's reach the square",
        ends: { crown: "Won", mate: "Checkmated", flag: "Resigned", half: "Draw, half a point each" },
    },
    guide: {
        title: "Guide",
        contents: "Contents",
        previous: "Previous page",
        next: "Next page",
        credits: "Credits",
        creditLines: [
            "The rules: [chess.js](https://github.com/jhlywa/chess.js), under the BSD 2-Clause license.",
            "The openings' names: Lichess's [chess-openings](https://github.com/lichess-org/chess-openings), under CC0.",
            "The pieces: Nitida, Torretta and Capablanca are Chesspal's own, the last after the diagrams of Capablanca's *Chess Fundamentals* (1921), under CC BY 4.0: [their credits](https://github.com/stefanocaronia/chesspal/blob/main/src/page/pieces/CREDITS.md).",
            "The sounds: Chesspal's own.",
        ],
    },
    foot: {
        onGitHub: "Chesspal on GitHub",
        onNpm: "Chesspal on npm",
        support: "Support Chesspal",
    },
};

const italian: Text = {
    language: "it",
    flip: "Gira",
    theme: "Tema chiaro o scuro",
    sounds: "Suoni",
    voice: "Leggi ad alta voce le parole dell'AI",
    noVoice: "Questo browser non ha una voce per questa lingua: aggiungila nelle impostazioni del sistema",
    saidMove: (move) => moveInWords(italianMoveWords, move),
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
    squareNames: "Il nome della casa sotto il puntatore",
    explain: "Spiega le mosse vietate",
    bookBadges: "Segna le mosse da libro",
    helps: "L'AI ti insegna mentre giochi",
    languageChoice: "Lingua",
    languages: { auto: "Come il browser", it: "Italiano", en: "English" },
    names: {
        nitida: "Nitida",
        torretta: "Torretta",
        capablanca: "Capablanca",
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
    foldCard: "Chiudi la scheda",
    openCard: "Apri la scheda",
    saveMoves: "PGN",
    saveMovesHint: "Solo le mosse, da aprire su Lichess o chess.com",
    noGameNow: "Nessuna partita in corso",
    analysing: "Analisi",
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
    lead: {
        hint: "Chi è avanti, in pedoni, secondo la stima dell'AI: Chesspal non lo calcola",
        chart: "Andamento della partita",
        chartHint: "Chi era avanti mossa per mossa, secondo la stima dell'AI: clicca per andare a quella mossa",
        even: "Pari",
        none: "Ancora nessuna stima",
        earlier: "Stimata prima dell'ultima mossa",
        drawn: "Patta sulla scacchiera",
        ahead: (side, pawns) => `Il ${side === "white" ? "Bianco" : "Nero"} è avanti di ${pawns} pedoni`,
        mate: (side, moves) => `Il ${side === "white" ? "Bianco" : "Nero"} dà matto in ${moves}`,
        mated: (side) => `Matto al ${side === "white" ? "Bianco" : "Nero"}`,
    },
    reviewing: (name) => `${name} sta analizzando la partita…`,
    incomplete: "Analisi non completa",
    complete: "Completa",
    completeHint: "Completa l'analisi",
    you: "Tu",
    ai: "AI",
    sides: { white: "Bianco", black: "Nero" },
    yourTurn: "tocca a te",
    clock: (time, running) => `Orologio: ${time}${running ? ", in corsa" : ""}`,
    send: "Manda",
    sent: "Mandato",
    withMove: "Oppure muovi: parte con la mossa",
    onMove: "Su",
    onWholeGame: "Su tutta la partita",
    talk: "Conversazione",
    move: "Mossa",
    draw: "patta",
    aborted: "Partita annullata",
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
    outdated: (name) => `Chesspal è stato aggiornato, ma questa cartella ha ancora i file di prima: chiudi la chat con ${name}, esegui chesspal init in questa cartella e apri una chat nuova.`,
    update: {
        mark: (version) => `È uscito Chesspal ${version}: aggiorna`,
        title: "Aggiorna Chesspal",
        offer: (version, current) => `È uscita la versione ${version} di Chesspal${current === undefined ? "" : `; questa è la ${current}`}. Il tavolo la installa e riparte da solo.`,
        chatAgain: (name) => `Anche la chat con ${name} riparte pulita.`,
        byHand: (name) => `La chat con ${name} l'hai aperta tu: dopo, chiudila e aprine una nuova.`,
        whilePlaying: "C'è una partita in corso: finiscila, poi aggiorna.",
        install: "Aggiorna",
        installing: (version) => `Installo la ${version}…`,
        installed: "Installata: il tavolo riparte da solo a fine partita.",
        failed: "Chesspal non si è aggiornato: chiudi la chat, poi scrivi in un terminale, uno dopo l'altro:",
        notice: (version, name) => `È uscita la versione ${version} di Chesspal: chiudi la chat con ${name}, scrivi questo comando in un terminale e apri una chat nuova.`,
        hide: "Nascondi fino alla prossima versione",
    },
    offline: (name) => `${name} è scollegato. Scrivigli un messaggio nella finestra dove hai aperto ${name}, non nella chat di questa pagina: la pagina si ricollega da sola.`,
    startClocks: "Inizia",
    thinking: { move: "Sta pensando alla sua mossa", ponder: "Pensa mentre giochi tu" },
    asleep: (name) => `${name} non ti sta ascoltando: scrivi un messaggio, per esempio "ciao", nella finestra dove hai aperto ${name}, non qui. Il suo orologio aspetta che risponda.`,
    asleepInAnalysis: (name) => `${name} non ti sta ascoltando: scrivigli nella finestra dove l'hai aperto, non qui.`,
    table: {
        title: "Contro chi giochi?",
        choose: "Scegli la chat con cui giocare: parte in una finestra a parte, da tenere aperta.",
        reviewTitle: "Chi analizza la partita?",
        reviewChoose: "Scegli la chat che analizza la partita: parte in una finestra a parte, da tenere aperta.",
        restartHint: "Scegli modello e ragionamento, poi premi Claude Code o Codex: la chat riparte pulita nella stessa finestra, appena ha finito di rispondere. La partita resta com'è.",
        byHand: (name) => `Questa chat l'hai aperta tu: cambia il modello di ${name} con /model nella sua finestra, oppure chiudila e aprine una da qui, con le scelte qui sotto.`,
        noChat: "Nessuna chat al tavolo: scegline una",
        change: "Cambia la chat o il modello",
        install: (name) => `Per giocare con ${name}, installa Claude Code o Codex, poi apri di nuovo questa pagina.`,
        model: "Modello",
        effort: "Ragionamento",
        asHost: (host) => `come è impostato in ${host}`,
        opening: "Apro la chat… Nel terminale, se ti chiede se ti fidi della cartella, scegli Yes con le frecce e premi Invio.",
        again: (name) => `${name} riparte con una chat pulita per la nuova partita…`,
        restart: "La chat riparte pulita…",
        waiting: (name) => `${name} riparte appena ha finito di rispondere…`,
        restartChanged: "Riparte pulita con le nuove scelte",
        restartNow: "Riparti adesso: interrompe la risposta in corso",
        cancel: "Non ripartire",
        failed: "Il terminale non si è aperto: scrivi il comando qui sotto in un terminale.",
        notRestarted: "La chat non è ripartita: chiudi la sua finestra, poi aprine un'altra da qui.",
        typeIt: "Oppure scrivi in un terminale:",
    },
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
        "update-game": () => italian.update.whilePlaying,
        "update-chat": (most, name) => `${name} sta rispondendo: aggiorna quando ha finito.`,
    },
    // Queen and rook are feminine in Italian.
    piece: (letter, side) => `${italianNames[letter]} ${side === "white" ? (letter === "Q" || letter === "R" ? "bianca" : "bianco") : (letter === "Q" || letter === "R" ? "nera" : "nero")}`,
    taken: (pieces, ahead) => `Pezzi presi: ${pieces.length === 0 ? "nessuno" : pieces.join(", ")}${ahead > 0 ? `; avanti di ${ahead}` : ""}`,
    writeTo: (name) => `Scrivi a ${name}…`,
    askAbout: (name) => `Chiedi ${name === "AI" ? "all'AI" : `a ${name}`} di questa partita…`,
    goTo: (move) => `Vai a ${move}`,
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
        gameMoves: "La partita che hai iniziato resta nel tuo profilo.",
        name: "Come ti chiami?",
        namePlaceholder: "Il tuo nome",
        gamesIn: "Le tue partite stanno in",
        openFolder: "Apri la cartella",
        opened: "Aperta",
        noFolder: "Da qui non si apre: cercala nel percorso scritto qui sopra.",
        documents: "Documenti",
        avatar: "Scegli un'immagine",
        ownImage: "Usa una tua immagine",
        level: "Come giochi?",
        levels: {
            learning: ["Ho appena imparato", "Conosco le regole, poco di più"],
            casual: ["Gioco ogni tanto", "Con amici o sul telefono"],
            regular: ["Gioco spesso", "Online o al circolo"],
            tournament: ["Gioco a torneo", "Al circolo, con punteggio"],
        },
        optional: "facoltativo",
        privacy: "Leggiamo solo il tuo punteggio pubblico. Niente password.",
        speeds: { rapid: "rapid", classical: "classica", blitz: "blitz" },
        ratingTitle: (speed, played) => (played === undefined ? speed : `${speed} · ultima partita il ${played.split("-").reverse().join("/")}`),
        notFound: (site) => `Su ${site} non trovo questo nome`,
        unreached: (site) => `${site} non risponde: riproviamo più tardi`,
        pending: "Leggo il tuo punteggio…",
        start: "Inizia a giocare",
        create: "Fatto",
        newProfile: "Aggiungi un giocatore",
        profiles: "Chi gioca?",
        eachOwn: "Ognuno ha le sue partite e le sue impostazioni.",
        changePlayer: "Cambia giocatore",
        back: "Indietro",
        yourProfile: "Il tuo profilo",
        editProfile: "Modifica il profilo",
        avatars: { "short-hair": "Capelli corti", bun: "Chignon", glasses: "Occhiali", beanie: "Berretto", beard: "Barba", curls: "Ricci", moustache: "Baffi", "silver-bob": "Caschetto grigio", cat: "Gatto", owl: "Gufo" },
        whilePlaying: "Finisci la partita, o abbandona, prima di cambiare giocatore.",
        accounts: "Giochi su Lichess, Chess.com o nei tornei FIDE?",
        username: "il tuo nome utente",
        accountTitle: "Col tuo nome lì, una partita che carichi da lì sa qual è la tua parte.",
        fidePlaceholder: "il tuo punteggio",
        fideTitle: "Il tuo punteggio FIDE, come lo trovi sul sito della FIDE: Chesspal non può leggerlo da sé.",
        fideRange: (lowest, highest) => `Un punteggio FIDE va da ${lowest} a ${highest}`,
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
        bring: "Carica una partita",
        bringNote: "da Lichess o Chess.com, o un PGN incollato o da file",
        search: "Nomi, modelli, aperture…",
        noMatch: "Nessuna partita trovata",
        reviewed: "commentata",
        unreviewed: "da commentare",
        moves: (count) => `${count} ${count === 1 ? "mossa" : "mosse"}`,
        outcome: { won: "vinta", lost: "persa", drawn: "patta" },
        more: "Altro",
        redo: "Rifai l'analisi",
        redoNote: "con il modello e l'effort della tua chat",
        unreview: "Elimina l'analisi",
        unreviewNote: "la partita resta, da commentare",
        remove: "Elimina la partita",
        askRedo: (game, by) => ({
            question: `Rifare l'analisi di ${game}?`,
            note: `${by === undefined ? "L'analisi" : `L'analisi di ${by}`} si cancella; la rifà l'analista della tua chat, col modello e l'effort che ha ora.`,
            yes: "Rifai",
        }),
        askUnreview: (game) => ({ question: `Eliminare l'analisi di ${game}?`, note: "Bollini, note e giudizi dell'allenatore si cancellano; la partita resta.", yes: "Elimina" }),
        askRemove: (game, when) => ({ question: `Eliminare la partita ${game}${when === undefined ? "" : ` del ${when}`}?`, note: "Con la sua analisi. Non si può annullare.", yes: "Elimina" }),
        cancel: "Annulla",
        siteGames: "Le tue ultime partite sui siti",
        siteGamesLoading: "Chiedo a Lichess e Chess.com…",
        siteGamesNone: "Nessuna partita finita sui siti.",
        siteGamesNoAccount: "I tuoi nomi su Lichess e Chess.com portano qui le tue ultime partite.",
        siteGamesProfile: "Aggiungili",
        bothUnreached: "Lichess e Chess.com non rispondono: riproviamo più tardi",
        siteGamesRefused: {
            "game-going": "C'è una partita in corso: finiscila per portarne un'altra.",
            "no-accounts": "Il tuo profilo non ha nomi su Lichess o Chess.com.",
            "no-network": "Da qui Chesspal non raggiunge i siti.",
        },
        playedAs: { white: "Hai giocato col Bianco", black: "Hai giocato col Nero" },
        speed: (name) => ({ ultraBullet: "ultrabullet", classical: "classica", correspondence: "per corrispondenza", daily: "per corrispondenza" } as Record<string, string>)[name] ?? readableSpeed(name),
        download: "PGN annotato",
        downloadHint: "La partita con i commenti e i giudizi della revisione",
        analyseIt: "Analizza la partita",
        analyseLast: "Analizza l'ultima partita",
    },
    helpsCard: {
        title: "Aiuti",
        coach: "L'allenatore",
        showHint: "Mostra il suggerimento",
        hideHint: "Nascondi il suggerimento",
        drawn: { green: "idea", red: "minaccia", yellow: "linea", blue: "obiettivo" },
        tactics: "Tattica",
        strategy: "Strategia",
        map: "Mappa",
        mapHint: "Tienilo premuto, o tieni premuto il tasto M, per vedere chi controlla ogni casa; sul telefono un tocco la accende e la spegne",
        bare: "Nascondi i disegni",
        bareHint: "Tienilo premuto per vedere la scacchiera senza frecce, case segnate e segni degli aiuti; sul telefono un tocco li nasconde e li rimostra",
        attackers: "attaccanti",
        defenders: "difensori",
        undefended: "nessun difensore",
        cheaper: "un attaccante vale meno di lui",
        outnumbered: "più attaccanti che difensori",
        pinnedTo: (letter) => `davanti ${italianWith("a", letter)}`,
        pinnedBy: (letter) => italianWith("da", letter),
        skeweredBefore: (letter) => `con dietro ${italianThe[letter]}`,
        nothingAtRisk: "Nessun pezzo in pericolo, nessuna inchiodatura.",
        line: (kind, side, you, toMove) => {
            const name = side === "white" ? "Bianco" : "Nero";
            const what = { risk: "in pericolo", pin: "inchiodati", skewer: "infilati" };

            if (you === undefined) {
                return kind === "check" ? `Scacchi del ${name}${toMove ? "" : ", se toccasse a lui"}` : `Pezzi del ${name} ${what[kind]}`;
            }

            if (kind === "check") {
                return side === you ? `Scacchi che ${toMove ? "puoi" : "potresti"} dare` : `Scacchi che l'avversario ${toMove ? "può" : "potrebbe"} darti`;
            }

            return `${side === you ? "I tuoi pezzi" : "I pezzi avversari"} ${what[kind]}`;
        },
        loose: "Pezzi né attaccati né difesi",
        yours: "tuoi",
        theirs: "avversari",
        you: "(tu)",
        white: "Bianco",
        black: "Nero",
        rows: {
            isolated: ["Pedoni isolati", "Un pedone senza pedoni del suo colore sulle colonne accanto: nessun pedone può difenderlo."],
            doubled: ["Pedoni doppiati", "Due pedoni dello stesso colore sulla stessa colonna."],
            backward: ["Pedoni arretrati", "Un pedone rimasto indietro rispetto a quelli accanto, con la casa davanti attaccata da un pedone nemico."],
            passed: ["Pedoni passati", "Nessun pedone nemico davanti a lui, né sulla sua colonna né su quelle accanto."],
            islands: ["Isole di pedoni", "Gruppi di pedoni su colonne vicine, separati fra loro."],
            openFiles: ["Colonne aperte", "Colonne senza pedoni di nessuno dei due."],
            halfOpen: ["Colonne semiaperte", "Colonne con pedoni nemici e nessuno dei propri."],
            heavyOnFiles: ["Torri e donna su colonne aperte", "Torri e donna su colonne aperte o semiaperte."],
            onSeventh: ["Torri e donna in settima", "Torri e donna sulla seconda traversa del nemico: la settima per il Bianco, la seconda per il Nero."],
            outposts: ["Avamposti", "Case sulle proprie traverse dalla quarta alla sesta, difese da un pedone, che nessun pedone nemico potrà mai attaccare."],
            bishopPair: ["Coppia degli alfieri", "Tutti e due gli alfieri ancora sulla scacchiera."],
            space: ["Spazio", "Quante case della metà avversaria attaccano i propri pezzi."],
            undeveloped: ["Pezzi minori non sviluppati", "Cavalli e alfieri ancora sulle case di partenza."],
            castled: ["Arrocco", "Come ha arroccato; un trattino finché può ancora farlo, una croce quando il re o le torri si sono già mossi."],
            kingAttacks: ["Attacchi nemici attorno al re", "Quanti attacchi nemici cadono sulle case accanto al re."],
        },
        yes: "sì",
        notYet: "non ancora",
        noMore: "non più",
        phases: { opening: "Apertura", middlegame: "Mediogioco", endgame: "Finale" },
        controlled: (white, black, both) => `Case solo del Bianco ${white}, solo del Nero ${black}, di tutti e due ${both}`,
        controlledBy: (who, count, you) => {
            if (who === "both") {
                return `Case controllate da tutti e due: ${count}`;
            }

            return `Case controllate solo dal ${who === "white" ? "Bianco" : "Nero"}${you ? " (tu)" : ""}: ${count}`;
        },
        bothSides: "tutti e due",
        oppositeBishops: "Alfieri di colore contrario",
        repetitions: (times) => `Questa posizione si è vista ${times} volte`,
        fiftyMoves: (halfMoves) => `Mancano ${halfMoves} semimosse alla patta delle cinquanta mosse`,
        insufficient: "Materiale insufficiente per dare matto",
        pawnSquare: (pawn, caught) => `Il re nemico è ${caught ? "dentro il" : "fuori dal"} quadrato del pedone in ${pawn}`,
        opposition: (side) => `L'opposizione è del ${side === "white" ? "Bianco" : "Nero"}`,
    },
    legend: {
        title: "Segni sulla scacchiera",
        hint: "Segni sulla scacchiera (?)",
        none: "Nessun segno sulla scacchiera ora",
        badge: "il giudizio della mossa",
        sign: (kind, tone) => `${tone === "threat" ? "Tuo pezzo" : tone === "chance" ? "Pezzo avversario" : "Pezzo"} ${{ risk: "in pericolo", pin: "inchiodato", skewer: "infilato" }[kind]}`,
        pinLine: "Linea dell'inchiodatura",
        skewerLine: "Linea dell'infilata",
        drawnBy: (name) => `disegnato da ${name}`,
        drawnByCoach: "disegnato dall'allenatore",
        control: "Quanti pezzi del Bianco e del Nero raggiungono la casa",
        ends: { crown: "Ha vinto", mate: "Scacco matto", flag: "Ha abbandonato", half: "Patta, mezzo punto a testa" },
    },
    guide: {
        title: "Guida",
        contents: "Indice",
        previous: "Pagina precedente",
        next: "Pagina seguente",
        credits: "Crediti",
        creditLines: [
            "Le regole: [chess.js](https://github.com/jhlywa/chess.js), con licenza BSD 2-Clause.",
            "I nomi delle aperture: [chess-openings](https://github.com/lichess-org/chess-openings) di Lichess, con licenza CC0.",
            "I pezzi: Nitida, Torretta e Capablanca sono di Chesspal, l'ultimo dai diagrammi di *Chess Fundamentals* di Capablanca (1921), con licenza CC BY 4.0: [i loro crediti](https://github.com/stefanocaronia/chesspal/blob/main/src/page/pieces/CREDITS.md).",
            "I suoni: di Chesspal.",
        ],
    },
    foot: {
        onGitHub: "Chesspal su GitHub",
        onNpm: "Chesspal su npm",
        support: "Sostieni Chesspal",
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

/** A piece with its article joined to a preposition: "alla donna", "dall'alfiere". */
function italianWith(preposition: "a" | "da", letter: PieceLetter): string
{
    return italianThe[letter].replace(/^il /, `${preposition}l `).replace(/^la /, `${preposition}lla `).replace(/^l'/, `${preposition}ll'`);
}

/** A move in words: "knight from b takes d7, check", "cavallo in f3", "arrocco corto". */
function moveInWords(words: MoveWords, move: SaidMove): string
{
    const promotion = "castles" in move || move.promotion === undefined ? undefined : `${words.promotes} ${words.names[move.promotion]}`;
    const played = "castles" in move
        ? words.castles[move.castles]
        : [words.names[move.piece], ...(move.from === undefined ? [] : [words.from, move.from]), move.takes ? words.takes : words.to, move.square].join(" ");
    return [played, promotion, move.check === undefined ? undefined : words.check[move.check]].filter((part) => part !== undefined).join(", ");
}

/** The words with their first letter capital, to open a sentence. */
function capital(words: string): string
{
    return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A speed the page does not know, as a word: ultraBullet as «ultra bullet». */
function readableSpeed(name: string): string
{
    return name.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}
