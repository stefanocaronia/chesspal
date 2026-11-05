// The talk on the board page (D-51, T-65): the player's words and the AI's answers, kept in game.json beside the PGN.
import { type CurrentGame, endOf, type Speaker, type TalkLine } from "./current-game.ts";

/** The most the player may write in a move, in all their lines, and the most a line of the AI's may hold (D-54). */
export const talkLimits = { player: 200, ai: 300 } as const;

/**
 * A new line of the talk, said when the game has `ply` moves: refused when it is empty or too long. The player writes 200 characters a move in all, the
 * words sent with the move included; the AI speaks once a move of theirs, on their time (D-54, D-72).
 */
export function talkLine(current: CurrentGame, who: Speaker, text: string, at: Date, ply = current.game.record.moves.length): TalkLine
{
    const words = text.trim();
    const most = who === "player" ? wordsLeft(current) : talkLimits.ai;

    if (words === "") {
        throw new WordsRefused("There is nothing to say: write the words first.", "empty");
    }

    if (who === "player" && most === 0) {
        throw new WordsRefused(`You have written your ${talkLimits.player} characters until the AI's next move: write again after it.`, "spent");
    }

    if (words.length > most) {
        const more = who === "player" && most < talkLimits.player;
        throw new WordsRefused(`The words are ${words.length} characters long: write at most ${most}${more ? " more until the AI's next move" : ""}.`, more ? "longer-than-left" : "long", most);
    }

    if (who === "ai") {
        refuseAiWords(current);
    }

    return { who, text: words, ply, at: at.toISOString() };
}

/** Words refused, and why, for the page to say it in the player's language (T-11): none, the move's characters spent, more than a line or what is left holds. */
export class WordsRefused extends Error
{
    readonly reason: "empty" | "spent" | "long" | "longer-than-left";
    readonly most: number;

    constructor(message: string, reason: WordsRefused["reason"], most = 0)
    {
        super(message);
        this.reason = reason;
        this.most = most;
    }
}

/** The lines the player wrote since the AI's last move: those it answers with its next move, and the 200 characters of this move are counted on them. */
export function playerLinesThisMove(current: CurrentGame): TalkLine[]
{
    const since = sinceAiMoved(current);
    return current.talk.filter((line) => line.who === "player" && line.ply >= since);
}

/** How many characters the player may still write for this move; between games a whole line each time, with no count (D-74). */
export function wordsLeft(current: CurrentGame): number
{
    if (endOf(current.game) !== undefined) {
        return talkLimits.player;
    }

    return Math.max(talkLimits.player - playerLinesThisMove(current).reduce((sum, line) => sum + line.text.length, 0), 0);
}

/** Whether the player's last line wakes the chat: the first of a move, and between games the first since the AI last spoke (D-54, D-74). */
export function wakesTheChat(current: CurrentGame): boolean
{
    return endOf(current.game) === undefined ? playerLinesThisMove(current).length === 1 : unanswered(current).length === 1;
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

/**
 * The AI speaks apart from its move once a move of the player's, on their time, with something to say or to answer (D-72), and never while its move waits:
 * it speaks in the move's comment then. Between games it talks freely, about the game just over or to start another (D-74).
 */
function refuseAiWords(current: CurrentGame): void
{
    const { game, ai } = current;
    const since = sinceAiMoved(current);

    if (endOf(game) !== undefined) {
        return;
    }

    if (game.position.turn === ai) {
        throw new Error("It is your move: speak in ai_move's comment. Nothing changed.");
    }

    if (current.talk.some((line) => line.who === "ai" && line.ply >= since)) {
        throw new Error("You have spoken once for this move: say the rest in ai_move's comment. Nothing changed.");
    }
}

/** How many moves the game had just after the AI's last move, 0 before it: what is said since then waits for its next move. */
function sinceAiMoved(current: CurrentGame): number
{
    const moves = current.game.record.moves.length;
    // The last move is the AI's when the AI is not to move; else the AI's is the one before it.
    const lastIsAi = current.game.position.turn !== current.ai;
    return lastIsAi ? moves : moves >= 2 ? moves - 1 : 0;
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
