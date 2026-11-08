// What the chess commands tell about the current game: plain data for the command line's JSON, and the lines an AI reads.
import { type AiLevel, type Facts, figurinesOf, type GameRecord, levelOf, materialOf, moodAt, type MoodNow, sees, type Side, type Square } from "../core/index.ts";
import { type CurrentGame, currentPlan, drawOfferOf, endOf, firstCoachCall, type Speaker, talkLimits, type Thought, thoughtForLastMove } from "../games/index.ts";
import { coachAgent, hasAgent, onQuickModel } from "../host-files/index.ts";
import { helpsIn, languageIn } from "../profiles/index.ts";
import { clockLine, type ClockSummary, clockSummaryOf, gameAt } from "./clock.ts";
import type { Context } from "./context.ts";
import { knownMoves, openingLine } from "./opening-book.ts";
import { boardView, colourName, compactView, materialText } from "./view.ts";

/** The current game, as the commands give it. */
export interface GameSummary
{
    ai: Side;
    /** The AI's level: the layers of facts it gets (D-60). */
    level: AiLevel;
    turn: Side;
    moveNumber: number;
    fen: string;
    /** The last moves, numbered: 3.Bc4 Nf6 4.Ng5 d5. */
    lastMoves: string;
    /** The last move, numbered, with its squares. */
    lastMove?: LastMove;
    /** The opening by Lichess's book (D-15): ECO and name, and the move the game left the book at. */
    opening?: string;
    /** When the AI is to move: the facts of the position (D-26); below the club level, only the check and the legal moves of each piece are shown. */
    facts?: Facts;
    /** When the AI is to move at the master level, in the book: the moves it knows from the position (D-15, D-60). */
    book?: readonly string[];
    /** When the AI is to move: the plan it wrote last. */
    plan?: string;
    /** When the AI is to move: what it thought of the player's move on their time (D-72). */
    thought?: Thought;
    /** When the AI is to move: the helps on, so it may teach (D-78), with a coach that judges the player's moves (D-88), or turned off since it drew on a move. */
    helps?: "on" | "coached" | "off now";
    /** In a game with a time control: the time each side had left when the command ran (D-13). */
    clock?: ClockSummary;
    /** Who offered a draw, while the offer stands (D-65). */
    drawOffer?: Speaker;
    /** The AI's mood while it lasts, in a game going on (D-70). */
    mood?: MoodNow;
    /** When the game is over: how it ended, and its name in the archive once it is there. */
    end?: { result: string; termination?: string; archive?: string; };
}

/** A move numbered as in the game (4.Ng5, 4...d5), with the squares it went from and to. */
export interface LastMove
{
    move: string;
    from: Square;
    to: Square;
}

/** A move played by the AI or the player, with where the game stands after it. */
export interface MovePlayed
{
    /** The move, numbered as in the game: 4.Ng5, 4...d5. */
    move: string;
    /** A + or # the move was written with and does not give. */
    note?: string;
    game: GameSummary;
    /** What went wrong after the move was saved, such as the archive not written. */
    warning?: string;
    /** What the player wrote on the board page that the AI has not been given yet (T-65). */
    words?: string[];
}

/** The game as the commands tell it; a game over with the name it has in the archive, when it is there. */
export function summaryOf(current: CurrentGame, now: Date, archive?: string): GameSummary
{
    const { game, ai } = current;
    const { position, record, lastMove } = game;
    const end = endOf(game);
    const level = levelOf(record);
    const summary: GameSummary = { ai, level, turn: position.turn, moveNumber: position.moveNumber, fen: position.fen, lastMoves: lastMoves(record, 6) };

    if (lastMove !== undefined) {
        summary.lastMove = { move: lastMoves(record, 1), from: lastMove.from, to: lastMove.to };
    }

    const opening = openingLine(record);
    const clock = clockSummaryOf(current, now);
    const drawOffer = drawOfferOf(current);

    if (drawOffer !== undefined) {
        summary.drawOffer = drawOffer;
    }

    const mood = moodAt(record, ai);

    if (end === undefined && mood.mood !== "neutral") {
        summary.mood = mood;
    }

    if (clock !== undefined) {
        summary.clock = clock;
    }

    if (opening !== undefined) {
        summary.opening = opening;
    }

    if (end !== undefined) {
        summary.end = archive === undefined ? end : { ...end, archive };
    } else if (position.turn === ai) {
        addAiFacts(summary, current);
    }

    return summary;
}

/**
 * The summary with what the AI reads when it is to move: what it thought of the player's last move on their time (D-72), and whether the helps are on (D-78),
 * with a coach when `coached`.
 */
export function withThought(summary: GameSummary, folder: string, current: CurrentGame, coached: boolean): GameSummary
{
    if (summary.turn !== summary.ai || summary.end !== undefined) {
        return summary;
    }

    const thought = thoughtForLastMove(folder, current);
    const helps = helpsIn(folder) ? (coached ? "coached" : "on") : judgedBefore(current) ? "off now" : undefined;
    return { ...summary, ...(thought === undefined ? {} : { thought }), ...(helps === undefined ? {} : { helps }) };
}

/** Whether a coach judges the player's moves when the helps are on: in Claude Code, with its agent in the player's folder (D-80, D-88). */
export function coachRuns(context: Context): boolean
{
    return context.host?.() === "claude-code" && hasAgent(context.folder, coachAgent);
}

/** Whether to start the coach, once, after the player's own move has ended the game on the board, with the helps on: it judges that move too (D-88). */
export function coachOnEnd(context: Context, folder: string, current: CurrentGame): boolean
{
    const { game, ai } = current;
    return game.outcome.over && game.position.turn === ai && helpsIn(folder) && coachRuns(context) && firstCoachCall(folder, current);
}

/**
 * How to start the agents, in one message, the one that thinks first, since it needs the time (Priya, review of T-112), and that the player sees nothing of
 * them: their end needs no answer either. The end of the last move's agents, told just after, must not take their place (Priya, playtest of T-112).
 */
export function agentsLine(agents: readonly string[]): string
{
    const prompt = (agent: string) => `the prompt "${agent === coachAgent ? "Coach." : "Ponder."}"`;
    const [first = "", second] = agents;

    if (second === undefined) {
        const why = first === coachAgent ? "Coach the player" : "Think on the player's time";
        return `${why}: start the ${first} agent in the background with ${prompt(first)}; start it even when an agent of the move before has just ended, `
            + "and write nothing about it in the chat, now or when it ends.";
    }

    return `Think on the player's time and coach them: in one message, start two agents in the background, ${first} with ${prompt(first)} and ${second} with `
        + `${prompt(second)}; start them even when an agent of the move before has just ended, and write nothing about them in the chat, now or when they end.`;
}

/** The current game `now`, refused when there is none or when it is over, on time too. */
export function gameGoingOn(folder: string, now: Date): CurrentGame
{
    const current = gameAt(folder, now);

    if (current === undefined) {
        throw new Error("There is no game going on: start one with new_game. Nothing changed.");
    }

    const end = endOf(current.game);

    if (end !== undefined) {
        throw new Error(`The game is over (${endText(end)}): new_game starts another. Nothing changed.`);
    }

    return current;
}

/** Where the game stands: the AI's position to decide on, with its last move unless the lines before named it; the player's turn; or how it ended. */
export function positionLines(game: GameSummary, withLastMove = true): string[]
{
    if (game.end !== undefined || game.turn !== game.ai) {
        return [whereLine(game), ...offerLines(game), ...clockLines(game), ...moodLines(game)];
    }

    return [
        ...headLines(game, withLastMove),
        ...(game.facts === undefined ? [] : (sees(game.level, "tactics") ? compactView : boardView)(game.facts, game.turn)),
        ...(game.book === undefined ? [] : [`Book moves, most named lines first: ${game.book.join(", ")}`]),
        ...(game.plan === undefined ? [] : [`Plan: ${game.plan}`]),
        ...(game.thought === undefined ? [] : [thoughtLine(game.thought, game.level)]),
        ...moodLines(game),
        ...(game.helps === "coached" ? [`${helpsLine} ${coachLine}`] : game.helps === "on" ? [helpsLine] : game.helps === "off now" ? [helpsOffLine] : []),
    ];
}

/** The helps turned on: the AI may teach as the analyst does (D-62, D-78), never playing for the player. */
const helpsLine = "Helps on: the player wants to learn. Tell your intentions, never their best move; draw arrows and squares to show what you say, and write up to "
    + `${talkLimits.aiHelps} characters.`;

/**
 * Where a coach runs, a coach, not the AI, judges the player's moves, and the AI knows it, so that it neither makes up what the coach said nor looks for it
 * (D-88, Priya, review of T-112); where none runs, nobody judges them before the analyst (D-80).
 */
const coachLine = "A coach, not you, judges their moves and gives them hints on the board page; you don't see what it writes.";

/** The helps turned off during a game: what the AI said and drew before no longer holds (Priya, round of D-78). */
const helpsOffLine = `Helps off now: play as at a tournament again: no intentions or arrows, comments of ${talkLimits.ai} characters at most.`;

/** Whether the AI judged or drew on a move of this game, which only the helps allow: a sign they were on. */
function judgedBefore(current: CurrentGame): boolean
{
    return current.game.record.moves.some((move) => /\[%(badge|review|cal|csl) /.test(move.comment ?? ""));
}

/** The head of a view: where the game stands, the last move unless the lines before named it, the opening, the material as the player sees it, and the FEN. */
export function headLines(game: GameSummary, withLastMove = true): string[]
{
    return [
        whereLine(game),
        ...offerLines(game),
        ...(withLastMove && game.lastMove !== undefined ? [`Last move: ${lastMoveText(game.lastMove)}.`] : []),
        ...(game.opening === undefined ? [] : [`Opening: ${game.opening}`]),
        `Material: ${materialText(materialOf(game.fen))}`,
        ...clockLines(game),
        `FEN: ${game.fen}`,
    ];
}

/** The last move, as the player is shown it, with its squares: 4.♞g5 (f3-g5). */
export function lastMoveText({ move, from, to }: LastMove): string
{
    return `${shownMove(move)} (${from}-${to})`;
}

/**
 * A numbered move as the player is shown it, with the pieces' figurines (D-86): the form alone, without the SAN, which the AI copied into its message
 * (Priya, test of D-86): 4.Ng5 is 4.♞g5.
 */
export function shownMove(move: string): string
{
    const [, number = "", san = move] = /^(\d+\.+)(.+)$/.exec(move) ?? [];
    return `${number}${figurinesOf(san)}`;
}

/** The player's language by its English name when it is not English. */
export interface Speech
{
    language: string;
}

/** The player's speech, from the page's settings or the system's language; undefined in English, which the AI speaks unless told. */
export function speechOf(folder: string, systemLanguage: string | undefined): Speech | undefined
{
    const language = languageName(languageIn(folder, systemLanguage));
    return language === undefined ? undefined : { language };
}

/** What the AI is told of the player's speech once a chat (Priya, retest of T-54); the moves are SAN in every language (D-87). */
export function speechLine({ language }: Speech): string
{
    return `The player speaks ${language}.`;
}

/** The lines after a move, which the line before named: its note, where the game stands, a warning. closingLines end them. */
export function moveLines({ note, game, warning }: MovePlayed): string[]
{
    return [...(note === undefined ? [] : [`Note: ${note}`]), ...positionLines(game, false), ...(warning === undefined ? [] : [warning])];
}

/** The last lines of a tool's answer: the player's words from the board page, then the next step, which stays the last line. */
export function closingLines(game: GameSummary | undefined, words: readonly string[] = [], pageClosed = false): string[]
{
    return [...wordLines(words), nextStep(game, words, pageClosed)];
}

/** The player's words from the board page, one line each: lines they broke are joined, so no line of theirs reads as one of Chesspal's. */
export function wordLines(words: readonly string[]): string[]
{
    return words.map((text) => `Player wrote on the board page: «${text.replace(/\s+/g, " ")}»`);
}

/**
 * What the AI does next: the one line every host reads, even where the server's instructions are not shown. Words of the player's ask for an answer. With the
 * board page open in no browser, a new game starts there, never in the chat (T-131).
 */
export function nextStep(game: GameSummary | undefined, words: readonly string[] = [], pageClosed = false): string
{
    const step = pageClosed ? closedPageGameStep : newGameStep;

    if (game === undefined) {
        return words.length === 0 ? `Next: when the player wants a game, ${step}` : `Next: answer the player with ai_say. When they want a game, ${step}`;
    }

    if (game.end !== undefined) {
        return words.length === 0
            ? "Next: tell the player how the game ended, with ai_say and how you feel as its mood if they play on the board page; then offer them, in words, another game or "
                + "to go over this one "
                + `(analyse_game). For another, ${step}`
            : `Next: answer the player with ai_say. When they want another game, ${step}`;
    }

    if (game.turn === game.ai && game.clock?.waiting === true) {
        return "Next: don't move yet: the player starts the game with Start on the board page, and the doorbell wakes you then. End your turn.";
    }

    if (game.turn === game.ai) {
        return words.length === 0
            ? "Next: choose your move, then call ai_move with it, your plan and any comment."
            : "Next: choose your move, then call ai_move with it, your plan and a comment that answers the player.";
    }

    if (game.drawOffer === "player") {
        return "Next: accept the draw with end_game draw_agreed, or answer with ai_say and wait for the player's move.";
    }

    return words.length === 0 ? "Next: wait for the player's move, then call player_move with it." : "Next: answer the player with ai_say, then wait for their move.";
}

/** How a new game starts: the player chooses it in the board page's window, which new_game without choices opens (D-85). */
export const newGameStep = "call new_game without choices: it opens the board page's New game window, where the player chooses the colour, the clock and the level.";

// With the page open in no browser the window cannot open: the player opens the page and presses New game (T-131).
const closedPageGameStep = "they start it on the board page with its New game button, where they choose the colour, the clock and the level: tell them so with "
    + "the page's address, and never offer to set it up in the chat.";

/** Who plays what, from the AI's side. */
export function sidesLine(ai: Side): string
{
    return `you play ${colourName(ai)}, the player ${colourName(ai === "white" ? "black" : "white")}`;
}

/** What the AI gets when it is to move: the facts its level sees (D-60), and its plan. */
function addAiFacts(summary: GameSummary, { game }: CurrentGame): void
{
    const plan = currentPlan(game.record);
    summary.facts = game.facts;

    if (sees(summary.level, "theory")) {
        const book = knownMoves(summary.fen);

        if (book.length > 0) {
            summary.book = book;
        }
    }

    if (plan !== undefined) {
        summary.plan = plan;
    }
}

/** The draw offer that stands, and how to answer it or what becomes of it (D-65). */
function offerLines({ drawOffer, turn, ai }: GameSummary): string[]
{
    if (drawOffer === "ai") {
        return ["Your draw offer stands until the player moves; if they accept it in the chat, end_game draw_agreed ends the game."];
    }

    if (drawOffer === "player") {
        return [turn === ai ? "The player offers a draw: end_game draw_agreed accepts it; your move declines it." : "The player offers a draw before their move; your next move declines it."];
    }

    return [];
}

/** What the AI thought on the player's time, saying by which model and that Chesspal checked only that it is legal: the facts do not cover every blunder (Anatolij, round of T-109). */
function thoughtLine({ move, why }: Thought, level: AiLevel): string
{
    return `Thought on their time ${onQuickModel(level) ? "by a quicker model" : "by your model"} (legal, not checked): ${move}, ${why}`;
}

/** The AI's mood while it lasts, and how long its face shows it (D-70). */
function moodLines({ mood }: GameSummary): string[]
{
    if (mood === undefined) {
        return [];
    }

    const shown = mood.left === 0 ? "until your next move" : `for ${mood.left} more of your moves`;
    return [`Your mood: ${mood.mood}, on your face ${shown}, then neutral by itself.`];
}

/** Who is to move, or how the game ended. */
function clockLines(game: GameSummary): string[]
{
    return game.clock === undefined ? [] : [clockLine(game.clock, game.ai)];
}

function whereLine(game: GameSummary): string
{
    if (game.end !== undefined) {
        const archived = game.end.archive === undefined ? "" : ` Archived in ${game.end.archive}.`;
        return `Game over: ${endText(game.end)}.${archived}`;
    }

    return `${game.turn === game.ai ? "You" : "Player"} (${colourName(game.turn)}) to move, move ${game.moveNumber}.`;
}

function endText({ result, termination }: { result: string; termination?: string; }): string
{
    return termination === undefined ? result : `${result}, ${termination}`;
}

/** The last plies of a record, numbered as a player writes them, from the move number and side of its FEN. */
export function lastMoves(record: GameRecord, count: number): string
{
    const [, turn, , , , number] = (record.tags.FEN ?? "").split(" ");
    const startNumber = Number(number) || 1;
    // The ply count from white's move of the first move number: 1 when black moves first.
    const offset = turn === "b" ? 1 : 0;
    const first = Math.max(0, record.moves.length - count);

    return record.moves.slice(first).map((move, index) => {
        const ply = first + index + offset;
        const moveNumber = startNumber + Math.floor(ply / 2);

        if (ply % 2 === 0) {
            return `${moveNumber}.${move.san}`;
        }

        return index === 0 ? `${moveNumber}...${move.san}` : move.san;
    }).join(" ");
}

/** A language by its English name when it is not English (Italian), from the way the system or the page names it (it-IT, it). */
function languageName(language: string | undefined): string | undefined
{
    const code = language?.split(/[-_]/)[0]?.toLowerCase() ?? "";

    if (!/^[a-z]{2,3}$/.test(code) || code === "en" || code === "und") {
        return undefined;
    }

    const name = new Intl.DisplayNames(["en"], { type: "language" }).of(code);
    return name === undefined || name === code ? undefined : name;
}
