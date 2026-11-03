// The talk on the board page (D-51, T-65): the player's words and the AI's answers, kept in game.json beside the PGN.
import { type CurrentGame, endOf, type Speaker, type TalkLine } from "./current-game.ts";

/** The most a line may hold, by who says it (D-54). */
export const talkLimits = { player: 200, ai: 200 } as const;

/**
 * A new line of the talk, said when the game has `ply` moves: refused when it is empty or too long. The player says one line a move, the one sent with
 * the move included; the AI only answers the player's words, on the player's time (D-54).
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

    if (who === "player" && current.talk.some((line) => line.who === "player" && line.ply >= sincePlayerMoved(current))) {
        throw new Error("You have already written for this move: your next words go with your next move.");
    }

    if (who === "ai") {
        refuseAiWords(current);
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

/** How far a line of the player's got: written, read by the AI in this chat, or answered by its words or its move. */
export type Heard = "sent" | "read" | "answered";

/** How far each line of the talk got: the player's by `Heard`, the AI's undefined (D-53). */
export function heardLines(current: CurrentGame, given: ReadonlySet<string>): (Heard | undefined)[]
{
    const waiting = new Set(unanswered(current).map(({ key }) => key));
    return current.talk.map((line, index) => {
        const key = keyOf(current, index);
        return line.who === "ai" ? undefined : !waiting.has(key) ? "answered" : given.has(key) ? "read" : "sent";
    });
}

/** The AI speaks apart from its move only to answer the player, and never while its move waits: it answers in the move's comment then. */
function refuseAiWords(current: CurrentGame): void
{
    const { game, ai } = current;

    if (unanswered(current).length === 0) {
        throw new Error("The player has written nothing to answer: ai_say only answers their words, and a comment rides with your move. Nothing changed.");
    }

    if (game.position.turn === ai && endOf(game) === undefined) {
        throw new Error("It is your move: answer the player in ai_move's comment. Nothing changed.");
    }
}

/** How many moves the game had just after the player's last move, 0 before it: the player's lines since then are this move's. */
function sincePlayerMoved(current: CurrentGame): number
{
    const moves = current.game.record.moves.length;
    // The last move is the AI's when the AI is not to move: the player's is the one before it.
    const lastIsAi = current.game.position.turn !== current.ai;
    return !lastIsAi ? moves : moves >= 2 ? moves - 1 : 0;
}

/** The player's lines after the AI's last words and its last move, each with a key of its own across games. */
function unanswered(current: CurrentGame): { key: string; line: TalkLine; }[]
{
    const { talk, game, ai } = current;
    const moves = game.record.moves.length;
    const lastSaid = talk.findLastIndex((line) => line.who === "ai");
    // The last move is the AI's when the AI is not to move: two moves on, one of them is.
    const aiMovedSince = (ply: number): boolean => moves > ply + 1 || (moves === ply + 1 && game.position.turn !== ai);

    return talk.flatMap((line, index) => index > lastSaid && line.who === "player" && !aiMovedSince(line.ply) ? [{ key: keyOf(current, index), line }] : []);
}

function keyOf(current: CurrentGame, index: number): string
{
    return `${current.started}#${index}`;
}
