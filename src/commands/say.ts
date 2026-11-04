// The talk on the board page (D-51, T-65): a line of the player's or the AI's, saved with the game, and the player's words the AI has not been given yet.
import { endWithMood, type Mood } from "../core/index.ts";
import { archiveEnded, type CurrentGame, endOf, loadGame, saveGame, type Speaker, talkLine, unheardWords, type Words } from "../games/index.ts";
import { gameFolder } from "../profiles/index.ts";
import { gameAt } from "./clock.ts";
import type { Context } from "./context.ts";

/**
 * Adds a line to the talk of the current game, going on or just over, and saves it; the AI's mood once the game is over, which the archive keeps too (D-70). A
 * line refused changes nothing: it throws, in words for whoever spoke.
 */
export function say(folder: string, who: Speaker, text: string, at: Date, mood?: Mood): CurrentGame
{
    const current = gameAt(folder, at);

    if (current === undefined) {
        throw new Error(who === "ai" ? "There is no game: the board page shows your words beside one. Nothing changed." : "There is no game going on: start one in the chat.");
    }

    if (mood !== undefined && endOf(current.game) === undefined) {
        throw new Error("While the game goes on your mood comes with ai_move: say it without mood. Nothing changed.");
    }

    current.talk.push(talkLine(current, who, text, at));

    if (mood !== undefined) {
        endWithMood(current.game, mood);
    }

    saveGame(folder, current);

    if (mood !== undefined) {
        archiveEnded(folder, current);
    }

    return current;
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
        const current = loadGame(gameFolder(context.folder));
        return current === undefined ? [] : unheardWords(current, given);
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
