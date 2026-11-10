// The lines an AI reads in a tool's answer about the current game: where it stands, the move just played, the player's words and what to do next.
import { type AiLevel, type Facts, figurinesOf, materialOf, sees, type Side } from "../core/index.ts";
import { talkLimits, type Thought } from "../games/index.ts";
import { onQuickModel } from "../host-files/index.ts";
import { analystLine, reviewedLine } from "./agents.ts";
import { clockLine } from "./clock.ts";
import { endText, type GameSummary, type LastMove, type MovePlayed } from "./game-summary.ts";
import type { Written } from "./say.ts";
import { boardView, colourName, compactView, materialText } from "./view.ts";

/** Where the game stands: the AI's position to decide on, with its last move unless the lines before named it; the player's turn; or how it ended. */
export function positionLines(game: GameSummary, withLastMove = true): string[]
{
    if (game.end !== undefined || game.turn !== game.ai) {
        return [whereLine(game), ...offerLines(game), ...clockLines(game), ...moodLines(game)];
    }

    return [
        ...headLines(game, withLastMove),
        ...(game.facts === undefined ? [] : viewLines(game.facts, game)),
        ...(game.book === undefined ? [] : [`Book moves, most named lines first: ${game.book.join(", ")}`]),
        ...(game.plan === undefined ? [] : [`Plan: ${game.plan}`]),
        ...(game.thought === undefined ? [] : [thoughtLine(game.thought, game.level)]),
        ...moodLines(game),
        ...(game.helps === "coached" ? [`${helpsLine} ${coachLine}`] : game.helps === "on" ? [helpsLine] : game.helps === "off now" ? [helpsOffLine] : []),
    ];
}

/** The view of the AI's position as its level sees it (D-60, D-100): the tactical facts from the club level, the other side's chances from the strong level. */
function viewLines(facts: Facts, game: GameSummary): string[]
{
    if (!sees(game.level, "tactics")) {
        return boardView(facts, game.turn);
    }

    const possible = game.possibilities === undefined ? undefined : { possibilities: game.possibilities, threats: game.threats, strong: sees(game.level, "strategy") };
    return compactView(facts, game.turn, possible);
}

/** The helps turned on: the AI may teach as the analyst does (D-62, D-78), never playing for the player. */
const helpsLine = "Helps on: the player wants to learn. Tell your intentions, never their best move; draw arrows and squares to show what you say, and write up to "
    + `${talkLimits.aiHelps} characters.`;

/**
 * Where a coach runs, a coach, not the AI, judges the player's moves, and the AI knows it, so that it neither makes up what the coach said nor looks for it
 * (D-88, Priya); where none runs, nobody judges them before the analyst (D-80).
 */
const coachLine = "A coach, not you, judges their moves and gives them hints on the board page; you don't see what it writes.";

/** The helps turned off during a game: what the AI said and drew before no longer holds (Priya, round of D-78). */
const helpsOffLine = `Helps off now: play as at a tournament again: no intentions or arrows, comments of ${talkLimits.ai} characters at most.`;

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

/** The lines after a move, which the line before named: its note, where the game stands, a warning. closingLines end them. */
export function moveLines({ note, game, warning }: MovePlayed): string[]
{
    return [...(note === undefined ? [] : [`Note: ${note}`]), ...positionLines(game, false), ...(warning === undefined ? [] : [warning])];
}

/** The last lines of a tool's answer: the player's words from the board page, then the next step, which stays the last line. */
export function closingLines(game: GameSummary | undefined, words: readonly Written[] = [], pageClosed = false): string[]
{
    return [...wordLines(words), nextStep(game, words, pageClosed)];
}

/**
 * The player's words from the board page, one line each, in analysis with the move the page showed (D-101): lines they broke are joined, so no line of
 * theirs reads as one of Chesspal's.
 */
export function wordLines(words: readonly Written[]): string[]
{
    return words.map(({ text, at }) => `Player wrote on the board page${at === undefined ? "" : `, at ${at}`}: «${text.replace(/\s+/g, " ")}»`);
}

/**
 * What the AI does next: the one line every host reads, even where the server's instructions are not shown. Words of the player's ask for an answer. With the
 * board page open in no browser, a new game starts there, never in the chat.
 */
export function nextStep(game: GameSummary | undefined, words: readonly Written[] = [], pageClosed = false): string
{
    const step = pageClosed ? closedPageGameStep : newGameStep;

    // Words written on a game in analysis: the chat answers them there, and corrects the review where they show it wrong (D-101).
    if (words.some((word) => word.at !== undefined) && (game === undefined || game.end !== undefined)) {
        return "Next: answer the player with ai_say, about the move they were looking at. When they show you something the review missed, first correct that move's "
            + "note with annotate_game, that move only.";
    }

    if (game === undefined) {
        return words.length === 0 ? `Next: when the player wants a game, ${step}` : `Next: answer the player with ai_say. When they want a game, ${step}`;
    }

    if (game.end !== undefined) {
        const analysis = game.end.analyst === "offer"
            ? ` To go over it, on their yes, ${analystLine(game.end.archive)}`
            : game.end.analyst === "done"
            ? ` ${reviewedLine(game.end.archive)}`
            : "";
        return words.length === 0
            ? "Next: tell the player how the game ended, with ai_say and how you feel as its mood if they play on the board page; then offer them, in words, another game or "
                + `to go over this one${analysis === "" ? " (analyse_game)." : `.${analysis}`} For another, ${step}`
            : `Next: answer the player with ai_say.${analysis} When they want another game, ${step}`;
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

// With the page open in no browser the window cannot open: the player opens the page and presses New game.
const closedPageGameStep = "they start it on the board page with its New game button, where they choose the colour, the clock and the level: tell them so with "
    + "the page's address, and never offer to set it up in the chat.";

/** Who plays what, from the AI's side. */
export function sidesLine(ai: Side): string
{
    return `you play ${colourName(ai)}, the player ${colourName(ai === "white" ? "black" : "white")}`;
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

/** What the AI thought on the player's time, saying by which model and that Chesspal checked only that it is legal: the facts do not cover every blunder (Anatolij). */
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
