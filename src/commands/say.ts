// The talk on the board page (D-51): a line of the player's or the AI's, saved with the game, and the player's words the AI has not been given yet.
import { endWithMood, type Mood } from "../core/index.ts";
import { archiveEnded, endOf, gameInAnalysis, loadGame, loadTableTalk, saveGame, saveTableTalk, type Sayer, type Shown, type TableTalk, type Talk, talkLimits, talkLine, unheardWords, type Words } from "../games/index.ts";
import { gameFolder, helpsIn } from "../profiles/index.ts";
import { shownMove } from "./answer-lines.ts";
import { gameAt } from "./clock.ts";
import type { Context } from "./context.ts";

/**
 * Adds a line to the talk of the current game, going on or just over, and saves it; the AI's mood once the game is over, which the archive keeps too (D-70).
 * With no game the line goes in the talk before it (D-77). A line refused changes nothing: it throws, in words for whoever spoke.
 */
export function say(folder: string, who: Sayer, text: string, at: Date, mood?: Mood, shown?: Shown): Talk
{
    const current = gameAt(folder, at);

    if (current === undefined) {
        return sayAtTable(folder, who, text, at, mood, shown);
    }

    const going = endOf(current.game) === undefined;

    if (mood !== undefined && going) {
        throw new Error("While the game goes on your mood comes with ai_move: say it without mood. Nothing changed.");
    }

    // With the helps on the AI writes as long as the analyst (D-78), and once the game is over as long, to talk it over (D-101).
    current.talk.push(talkLine(current, who, text, at, undefined, aiMost(folder, who, text, going), shown));

    if (mood !== undefined) {
        endWithMood(current.game, mood);
    }

    saveGame(folder, current);

    if (mood !== undefined) {
        archiveEnded(folder, current);
    }

    return current;
}

/** Words of the player's as the AI is given them: their text, and in analysis the move the board page showed as they wrote, 52...♚f6 (D-101). */
export interface Written
{
    readonly text: string;
    readonly place?: string;
}

/** What the player wrote on the board page that the AI has not been given in this chat, given now: each game tool gives it once; never to an agent (D-89). */
export function newWords(context: Context): Written[]
{
    return context.agent === undefined ? give(context, waitingWords(context)) : [];
}

/** Every word of the player's the AI has not answered, given again: status gives them all, for a chat that lost them in a summary. */
export function unansweredWords(context: Context): Written[]
{
    return give(context, waitingWords(context, new Set()));
}

/** What the player wrote on the board page that the AI has not been given in this chat, still to give: the AI's move would count as its answer. */
export function waitingWords(context: Context, given: ReadonlySet<string> = context.given): Words[]
{
    try {
        const folder = gameFolder(context.home());
        return unheardWords(loadGame(folder) ?? loadTableTalk(folder), given);
    } catch {
        // A game.json that cannot be read: the tool says so in its own words.
        return [];
    }
}

/** Gives the words to the AI: from now on they count as given in this chat. Their text, with the move shown in analysis. */
export function give(context: Context, words: readonly Words[]): Written[]
{
    const before = context.given.size;

    for (const { key } of words) {
        context.given.add(key);
    }

    if (context.given.size > before) {
        context.heard?.();
    }

    const analysed = words.some((word) => word.shown !== undefined) ? gameInAnalysis(gameFolder(context.home()))?.game : undefined;
    return words.map(({ text, shown }) => shown === undefined ? { text } : { text, place: placeOf(shown, analysed) });
}

/** Where the page stood: the move shown, as the player saw it, or the start; with the game's name when the page shows another now. */
function placeOf({ game, move }: Shown, analysed: string | undefined): string
{
    return `${move === undefined ? "the start" : shownMove(move)}${game === analysed ? "" : ` of ${game}`}`;
}

/** The most a line of the AI's may hold in the games of `folder`: an analyst's note with the helps on (D-78), or with no game going on (D-101); a longer one is refused. */
function aiMost(folder: string, who: Sayer, text: string, going: boolean): number
{
    if (who !== "ai") {
        return talkLimits.ai;
    }

    if (!going || helpsIn(folder)) {
        return talkLimits.aiHelps;
    }

    if (text.trim().length > talkLimits.ai) {
        throw new Error(`The player has the helps off: write at most ${talkLimits.ai} characters. Nothing changed.`);
    }

    return talkLimits.ai;
}

/** A line of the talk with no game, which starts it the first time; no mood, which only the end of a game takes. */
function sayAtTable(folder: string, who: Sayer, text: string, at: Date, mood: Mood | undefined, shown: Shown | undefined): TableTalk
{
    if (who === "agent") {
        throw new Error("There is no game to think on. Nothing changed.");
    }

    if (mood !== undefined) {
        throw new Error("There is no game: a mood goes with a game's end. Say it without mood. Nothing changed.");
    }

    const before = loadTableTalk(folder);
    const line = talkLine(before, who, text, at, undefined, aiMost(folder, who, text, false), shown);
    const table = { started: before.started === "" ? at.toISOString() : before.started, talk: [...before.talk, line] };
    saveTableTalk(folder, table);
    return table;
}
