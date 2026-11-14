// The AI's mood (D-70): the AI gives it with a move, which keeps it in its comment as [%mood …], beside [%plan], for three of the AI's moves, a surprise for
// one; or as the game ends, on its last move, which keeps it.
import type { Game, Side } from "./game.ts";
import type { GameRecord } from "./record.ts";

/** The moods of the AI, which the Torretta shows. */
export const moods = ["neutral", "happy", "surprised", "worried", "thoughtful", "sad"] as const;

/** A mood of the AI. */
export type Mood = (typeof moods)[number];

/** How many of the AI's moves each mood lasts, the one it comes with included: a surprise is a flash (Julián). */
const moodMoves: Readonly<Record<Mood, number>> = { neutral: 0, happy: 3, surprised: 1, worried: 3, thoughtful: 3, sad: 3 };

/** The AI's mood at a point of a game, and how many more of its moves keep it before it fades: 0 when its next move ends it. */
export interface MoodNow
{
    readonly mood: Mood;
    readonly left: number;
}

/** The mood as a move's comment carries it. */
export function moodTag(mood: Mood): string
{
    return `[%mood ${mood}]`;
}

/** The mood a move's comment carries, if it carries one. */
export function moodOf(comment: string | undefined): Mood | undefined
{
    const found = moodPattern.exec(comment ?? "")?.[1];
    return moods.find((mood) => mood === found);
}

/** Gives the AI's mood on the last move of a game that has ended, in place of the one it had: the face the game ends with. A game without moves keeps none. */
export function endWithMood(game: Game, mood: Mood): void
{
    const plies = game.record.moves.length;

    if (plies > 0) {
        game.annotate(plies, { comment: withMood(game.record.moves[plies - 1]?.comment, mood) });
    }
}

/** A game's record with the mood it ends with on its last move, in place of the one it had, as endWithMood gives it: the rest of the record as it is. */
export function recordWithMood(record: GameRecord, mood: Mood): GameRecord
{
    const last = record.moves.length - 1;
    return { ...record, moves: record.moves.map((move, index) => index === last ? { ...move, comment: withMood(move.comment, mood) } : move) };
}

/** The AI's mood after the first `plies` moves of a record: the last it gave, while it lasts, else neutral. A mood on the player's move is the one the game ended with. */
export function moodAt(record: GameRecord, ai: Side, plies = record.moves.length): MoodNow
{
    // The ply count from white's move of the first move number: 1 when black moves first.
    const offset = record.tags.FEN?.split(" ")[1] === "b" ? 1 : 0;
    const aiMoves = (index: number): boolean => ((index + offset) % 2 === 0 ? "white" : "black") === ai;
    let since = 0;

    for (let index = Math.min(plies, record.moves.length) - 1; index >= 0; index--) {
        const mood = moodOf(record.moves[index]?.comment);

        if (mood !== undefined) {
            const left = moodMoves[mood] - 1 - since;
            return mood === "neutral" || left < 0 ? neutral : { mood, left };
        }

        if (aiMoves(index)) {
            since++;
        }
    }

    return neutral;
}

/** The record without moods: another game's are not the AI's. */
export function withoutMoods(record: GameRecord): GameRecord
{
    return { ...record, moves: record.moves.map((move) => ({ ...move, comment: move.comment?.replace(moodPattern, "") })) };
}

const neutral: MoodNow = { mood: "neutral", left: 0 };
const moodPattern = /\s*\[%mood ([a-z]+)\]/;

// A move's comment with the mood in place of the one it had.
function withMood(comment: string | undefined, mood: Mood): string
{
    const kept = comment?.replace(moodPattern, "");
    return kept === undefined || kept === "" ? moodTag(mood) : `${kept} ${moodTag(mood)}`;
}
