// The level of a game as the AI reads it (D-60, D-61): what it sees, and the refusal of a tool its level does not give.
import { type AiLevel, type Layer, levelOf, sees, suggestedLevel } from "../core/index.ts";
import { type CurrentGame, endOf } from "../games/index.ts";
import { activeProfile } from "../profiles/index.ts";
import type { Context } from "./context.ts";

/** The level of a new game when the call names none: the game before's, else the one that suits the player in use, else the level before levels came. */
export function levelToPlay(context: Context, before: CurrentGame | undefined): AiLevel
{
    return suggestedLevel(before?.game.record, before === undefined ? activeProfile(context.folder)?.level : undefined);
}

/** The level and what the AI sees at it, in few words: at the club level (board and tactical facts: no position). */
export function levelText(level: AiLevel): string
{
    return `at the ${level} level (${seenText[level]})`;
}

/** Throws when the game's level does not give a layer, saying what the level gives instead; a game over gives every layer, to its analysis (D-81). */
export function refuseUnseen(current: CurrentGame, layer: Layer, tool: string): void
{
    const level = levelOf(current.game.record);

    if (!sees(level, layer) && endOf(current.game) === undefined) {
        throw new Error(`${tool} is not yours in this game: you play ${levelText(level)}. Decide with the facts you have.`);
    }
}

const seenText: Readonly<Record<AiLevel, string>> = {
    beginner: "board and legal moves: no tactical facts, no position",
    club: "board and tactical facts: no position",
    strong: "board, tactical and positional facts",
    master: "board, tactical and positional facts, opening book",
};
