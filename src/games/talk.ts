// The talk on the board page (D-51, T-65): the player's words and the AI's answers, kept in game.json beside the PGN.
import type { CurrentGame, Speaker, TalkLine } from "./current-game.ts";

/** The most a line may hold, by who says it, and how many of the player's lines may wait for the AI's answer. */
export const talkLimits = { player: 500, ai: 400, waiting: 3 } as const;

/**
 * A new line of the talk, said when the game has `ply` moves: refused when it is empty or too long, and the player's words without a move when
 * `talkLimits.waiting` of theirs already wait for an answer. Words that come with a move are answered with it.
 */
export function talkLine(current: CurrentGame, who: Speaker, text: string, at: Date, ply = current.game.record.moves.length): TalkLine
{
    const words = text.trim();
    const most = talkLimits[who];

    if (words === "") {
        throw new Error("There is nothing to say: write the words first.");
    }

    if (words.length > most) {
        throw new Error(`The words are ${words.length} characters long: write at most ${most}.`);
    }

    const alone = ply === current.game.record.moves.length;

    if (who === "player" && alone && unanswered(current).length >= talkLimits.waiting) {
        throw new Error(`The AI has not answered your last ${talkLimits.waiting} messages yet: wait for its answer.`);
    }

    return { who, text: words, ply, at: at.toISOString() };
}

/** Words of the player's, with the key that tells them apart across games. */
export interface Words
{
    readonly key: string;
    readonly text: string;
}

/** What the player said that the AI has not answered, but for the words whose keys are in `given`. */
export function unheardWords(current: CurrentGame, given: ReadonlySet<string>): Words[]
{
    return unanswered(current).filter(({ key }) => !given.has(key)).map(({ key, line }) => ({ key, text: line.text }));
}

/** The player's lines after the AI's last words and its last move, each with a key of its own across games. */
function unanswered(current: CurrentGame): { key: string; line: TalkLine; }[]
{
    const { talk, game, ai } = current;
    const moves = game.record.moves.length;
    const lastSaid = talk.findLastIndex((line) => line.who === "ai");
    // The last move is the AI's when the AI is not to move: two moves on, one of them is.
    const aiMovedSince = (ply: number): boolean => moves > ply + 1 || (moves === ply + 1 && game.position.turn !== ai);

    return talk.flatMap((line, index) => index > lastSaid && line.who === "player" && !aiMovedSince(line.ply) ? [{ key: `${current.started}#${index}`, line }] : []);
}
