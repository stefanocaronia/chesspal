// The AI's levels (D-60): layers of facts, never a weaker search. Each level sees the layers of the one below it, and one more.
import type { GameRecord } from "./record.ts";

/** The AI's levels, the weakest first. */
export const aiLevels = ["beginner", "club", "strong", "master"] as const;
export type AiLevel = (typeof aiLevels)[number];

/** The layers of facts: the board as the player sees it (D-59), the tactical view (D-26), the positional profile (T-12), the opening book's moves (D-15). */
const layers = ["board", "tactics", "strategy", "theory"] as const;
export type Layer = (typeof layers)[number];

/** The PGN tag that keeps a game's level, so the archive keeps it too. */
export const levelTag = "AILevel";

/** The level of the games played before levels came: the AI saw the board, the tactical view and the positional profile. */
const formerLevel: AiLevel = "strong";

/** The level to suggest by how the player says they play (D-23), a step below their strength: strong only when they choose it. */
export const levelForPlayer: Readonly<Record<string, AiLevel>> = { learning: "beginner", casual: "beginner", regular: "club", tournament: "master" };

/** The level of a new game the player does not choose: the game before's, else the one that suits how the player says they play, else the former one. */
export function suggestedLevel(before: GameRecord | undefined, playerLevel: string | undefined): AiLevel
{
    if (before !== undefined) {
        return levelOf(before);
    }

    return (playerLevel === undefined ? undefined : levelForPlayer[playerLevel]) ?? formerLevel;
}

/** The layers a level sees, the board first. */
export function layersOf(level: AiLevel): readonly Layer[]
{
    return layers.slice(0, aiLevels.indexOf(level) + 1);
}

/** Whether a level sees a layer. */
export function sees(level: AiLevel, layer: Layer): boolean
{
    return layers.indexOf(layer) <= aiLevels.indexOf(level);
}

/** The level a game is played at, by its tag; a game without one was played before levels came. */
export function levelOf(record: GameRecord): AiLevel
{
    const tag = record.tags[levelTag];
    return isLevel(tag) ? tag : formerLevel;
}

function isLevel(text: string | undefined): text is AiLevel
{
    return (aiLevels as readonly (string | undefined)[]).includes(text);
}
