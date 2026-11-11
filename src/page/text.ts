// The page's words in the player's language (D-32): Italian or English, from the browser's or as the settings say (D-56).
import type { AiLevel, Badge, DrawColour, IllegalReason, Phase, PieceLetter, Side } from "../core/index.ts";
import type { BadgeKind } from "./board/signs.ts";
import type { Step } from "./game/browse.ts";
import type { HowEnded } from "./game/ending.ts";
import type { StrategyGroup, StrategyRow, Tone } from "./helps/view.ts";
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
    /** The page is served, but no chat hears the player (never started, or just cleared): where to write to wake it; its clock waits. */
    asleep(name: string): string;
    /** The same over a game in analysis, where no clock waits (Zoe). */
    asleepInAnalysis(name: string): string;
    /** The table with no chat at it (D-104): the hosts that open one in a terminal, the model and effort beside each, and the command to type instead. */
    readonly table: {
        readonly label: string;
        noChat(name: string): string;
        install(name: string): string;
        readonly model: string;
        readonly effort: string;
        asHost(host: string): string;
        readonly opening: string;
        again(name: string): string;
        readonly failed: string;
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
    /** After the player's side in the strategy's head. */
    readonly you: string;
    readonly white: string;
    readonly black: string;
    /** Each line of the strategy's table: its name, and what it means for whoever does not know the word (Rosa). */
    readonly rows: Readonly<Record<StrategyRow, readonly [name: string, meaning: string]>>;
    /** The groups the lines stand in, each under its figure. */
    readonly groups: Readonly<Record<StrategyGroup, string>>;
    readonly yes: string;
    readonly notYet: string;
    readonly noMore: string;
    readonly phases: Readonly<Record<Phase, string>>;
    /** Before the open files, beside the phase. */
    readonly openFiles: string;
    /** The bar of the squares each side controls: its title, the word under its middle, and the sentence that says it whole. */
    readonly control: string;
    readonly both: string;
    controlled(white: number, black: number, both: number): string;
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
    /** On the player's picture and the pencil beside them in the menu. */
    readonly editProfile: string;
    readonly yourPicture: string;
    readonly avatars: Readonly<Record<AvatarId, string>>;
    readonly whilePlaying: string;
    /** Above the names on Lichess and chess.com, in the profile window. */
    readonly accounts: string;
    /** The empty field of a name on Lichess or chess.com. */
    readonly username: string;
    /** On the fields of the names on Lichess and chess.com: what they are for. */
    readonly accountTitle: string;
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
    offline: (name) => `${name} is not connected. Write it a message in the window where you opened ${name}, not in this page's chat: the page connects again by itself.`,
    startClocks: "Start",
    thinking: { move: "Thinking about its move", ponder: "Thinking while you play" },
    asleep: (name) => `${name} is not listening: write a message, such as "hi", in the window where you opened ${name}, not here. Its clock waits until it answers.`,
    asleepInAnalysis: (name) => `${name} is not listening: write to it in the window where you opened it, not here.`,
    table: {
        label: "Open a chat",
        noChat: (name) => `To play with ${name}, open its chat: it starts in a window of its own, to keep open.`,
        install: (name) => `To play with ${name}, install Claude Code or Codex, then open this page again.`,
        model: "Model",
        effort: "Effort",
        asHost: (host) => `as set in ${host}`,
        opening: "Opening the chat… In the terminal, if it asks whether you trust the folder, choose Yes with the arrow keys and press Enter.",
        again: (name) => `${name} starts again with a clean chat for the new game…`,
        failed: "The terminal did not open: type the command below in a terminal.",
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
        yourPicture: "Your picture: edit your profile",
        avatars: { "short-hair": "Short hair", bun: "Bun", glasses: "Glasses", beanie: "Beanie", beard: "Beard", curls: "Curls", moustache: "Moustache", "silver-bob": "Silver bob", cat: "Cat", owl: "Owl" },
        whilePlaying: "Finish the game, or resign, before changing player.",
        accounts: "Do you play on Lichess or Chess.com?",
        username: "your username",
        accountTitle: "With your name there, a game you load from there knows which side is yours.",
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
        bringNote: "a PGN played elsewhere, pasted or from a file",
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
            halfOpen: ["Half-open files", "Files with enemy pawns and none of one's own."],
            heavyOnFiles: ["Rooks and queens on open files", "Rooks and queens on open or half-open files."],
            onSeventh: ["Rooks and queens on the seventh", "Rooks and queens on the enemy's second rank: the seventh for White, the second for Black."],
            outposts: ["Outposts", "Squares on one's ranks 4 to 6, defended by a pawn, that no enemy pawn can ever attack."],
            bishopPair: ["Bishop pair", "Both bishops still on the board."],
            space: ["Space (squares in the enemy's half)", "How many squares of the enemy's half one's pieces attack."],
            undeveloped: ["Minor pieces not developed", "Knights and bishops still on their first squares."],
            castled: ["Castling", "How it castled; a dash while it still can, a cross once the king or the rooks have moved."],
            kingAttacks: ["Enemy attacks around the king", "How many enemy attacks fall on the squares next to the king."],
        },
        groups: { pawns: "Pawns", pieces: "Pieces", king: "King" },
        yes: "yes",
        notYet: "not yet",
        noMore: "no more",
        phases: { opening: "Opening", middlegame: "Middlegame", endgame: "Endgame" },
        openFiles: "Open files",
        control: "Squares controlled",
        both: "both",
        controlled: (white, black, both) => `Squares only White's ${white}, only Black's ${black}, both ${both}`,
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
    offline: (name) => `${name} è scollegato. Scrivigli un messaggio nella finestra dove hai aperto ${name}, non nella chat di questa pagina: la pagina si ricollega da sola.`,
    startClocks: "Inizia",
    thinking: { move: "Sta pensando alla sua mossa", ponder: "Pensa mentre giochi tu" },
    asleep: (name) => `${name} non ti sta ascoltando: scrivi un messaggio, per esempio "ciao", nella finestra dove hai aperto ${name}, non qui. Il suo orologio aspetta che risponda.`,
    asleepInAnalysis: (name) => `${name} non ti sta ascoltando: scrivigli nella finestra dove l'hai aperto, non qui.`,
    table: {
        label: "Apri una chat",
        noChat: (name) => `Per giocare con ${name}, apri la sua chat: parte in una finestra a parte, da tenere aperta.`,
        install: (name) => `Per giocare con ${name}, installa Claude Code o Codex, poi apri di nuovo questa pagina.`,
        model: "Modello",
        effort: "Ragionamento",
        asHost: (host) => `come è impostato in ${host}`,
        opening: "Apro la chat… Nel terminale, se ti chiede se ti fidi della cartella, scegli Yes con le frecce e premi Invio.",
        again: (name) => `${name} riparte con una chat pulita per la nuova partita…`,
        failed: "Il terminale non si è aperto: scrivi il comando qui sotto in un terminale.",
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
        yourPicture: "La tua immagine: modifica il profilo",
        avatars: { "short-hair": "Capelli corti", bun: "Chignon", glasses: "Occhiali", beanie: "Berretto", beard: "Barba", curls: "Ricci", moustache: "Baffi", "silver-bob": "Caschetto grigio", cat: "Gatto", owl: "Gufo" },
        whilePlaying: "Finisci la partita, o abbandona, prima di cambiare giocatore.",
        accounts: "Giochi su Lichess o Chess.com?",
        username: "il tuo nome utente",
        accountTitle: "Col tuo nome lì, una partita che carichi da lì sa qual è la tua parte.",
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
        bringNote: "un PGN giocato altrove, incollato o da file",
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
            halfOpen: ["Colonne semiaperte", "Colonne con pedoni nemici e nessuno dei propri."],
            heavyOnFiles: ["Torri e donna su colonne aperte", "Torri e donna su colonne aperte o semiaperte."],
            onSeventh: ["Torri e donna in settima", "Torri e donna sulla seconda traversa del nemico: la settima per il Bianco, la seconda per il Nero."],
            outposts: ["Avamposti", "Case sulle proprie traverse dalla quarta alla sesta, difese da un pedone, che nessun pedone nemico potrà mai attaccare."],
            bishopPair: ["Coppia degli alfieri", "Tutti e due gli alfieri ancora sulla scacchiera."],
            space: ["Spazio (case nella metà avversaria)", "Quante case della metà avversaria attaccano i propri pezzi."],
            undeveloped: ["Pezzi minori non sviluppati", "Cavalli e alfieri ancora sulle case di partenza."],
            castled: ["Arrocco", "Come ha arroccato; un trattino finché può ancora farlo, una croce quando il re o le torri si sono già mossi."],
            kingAttacks: ["Attacchi nemici attorno al re", "Quanti attacchi nemici cadono sulle case accanto al re."],
        },
        groups: { pawns: "Pedoni", pieces: "Pezzi", king: "Re" },
        yes: "sì",
        notYet: "non ancora",
        noMore: "non più",
        phases: { opening: "Apertura", middlegame: "Mediogioco", endgame: "Finale" },
        openFiles: "Colonne aperte",
        control: "Case controllate",
        both: "tutti e due",
        controlled: (white, black, both) => `Case solo del Bianco ${white}, solo del Nero ${black}, di tutti e due ${both}`,
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

/** The words with their first letter capital, to open a sentence. */
function capital(words: string): string
{
    return words.charAt(0).toUpperCase() + words.slice(1);
}
