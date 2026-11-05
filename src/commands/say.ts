// The talk on the board page (D-51, T-65): a line of the player's or the AI's, saved with the game, and the player's words the AI has not been given yet.
import { endWithMood, type Mood } from "../core/index.ts";
import { archiveEnded, endOf, loadGame, loadTableTalk, saveGame, saveTableTalk, type Sayer, type TableTalk, type Talk, talkLimits, talkLine, unheardWords, type Words } from "../games/index.ts";
import { gameFolder, helpsIn } from "../profiles/index.ts";
import { gameAt } from "./clock.ts";
import type { Context } from "./context.ts";

/**
 * Adds a line to the talk of the current game, going on or just over, and saves it; the AI's mood once the game is over, which the archive keeps too (D-70).
 * With no game the line goes in the talk before it (D-77). A line refused changes nothing: it throws, in words for whoever spoke.
 */
export function say(folder: string, who: Sayer, text: string, at: Date, mood?: Mood): Talk
{
    const current = gameAt(folder, at);

    if (current === undefined) {
        return sayAtTable(folder, who, text, at, mood);
    }

    if (mood !== undefined && endOf(current.game) === undefined) {
        throw new Error("While the game goes on your mood comes with ai_move: say it without mood. Nothing changed.");
    }

    // With the helps on the AI writes as long as the analyst (D-78).
    current.talk.push(talkLine(current, who, text, at, undefined, aiMost(folder)));

    if (mood !== undefined) {
        endWithMood(current.game, mood);
    }

    saveGame(folder, current);

    if (mood !== undefined) {
        archiveEnded(folder, current);
    }

    return current;
}

/** The most a line of the AI's may hold in the games of `folder`: an analyst's note with the helps on (D-78). */
export function aiMost(folder: string): number
{
    return helpsIn(folder) ? talkLimits.aiHelps : talkLimits.ai;
}

/** What the player wrote on the board page that the AI has not been given in this chat, given now: each game tool gives it once. */
export function newWords(context: Context): string[]
{
    return give(context, waitingWords(context));
}

/** Every word of the player's the AI has not answered, given again: status gives them all, for a chat that lost them in a summary. */
export function unansweredWords(context: Context): string[]
{
    return give(context, waitingWords(context, new Set()));
}

/** What the player wrote on the board page that the AI has not been given in this chat, still to give: the AI's move would count as its answer. */
export function waitingWords(context: Context, given: ReadonlySet<string> = context.given): Words[]
{
    try {
        const folder = gameFolder(context.folder);
        return unheardWords(loadGame(folder) ?? loadTableTalk(folder), given);
    } catch {
        // A game.json that cannot be read: the tool says so in its own words.
        return [];
    }
}

/** Gives the words to the AI: from now on they count as given in this chat. Their text. */
export function give(context: Context, words: readonly Words[]): string[]
{
    const before = context.given.size;

    for (const { key } of words) {
        context.given.add(key);
    }

    if (context.given.size > before) {
        context.heard?.();
    }

    return words.map(({ text }) => text);
}

/** A line of the talk with no game, which starts it the first time; no mood, which only the end of a game takes. */
function sayAtTable(folder: string, who: Sayer, text: string, at: Date, mood: Mood | undefined): TableTalk
{
    if (who === "agent") {
        throw new Error("There is no game to think on. Nothing changed.");
    }

    if (mood !== undefined) {
        throw new Error("There is no game: a mood goes with a game's end. Say it without mood. Nothing changed.");
    }

    const before = loadTableTalk(folder);
    const table = { started: before.started === "" ? at.toISOString() : before.started, talk: [...before.talk, talkLine(before, who, text, at)] };
    saveTableTalk(folder, table);
    return table;
}
