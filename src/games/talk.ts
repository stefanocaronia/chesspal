// The talk on the board page (D-51): the player's words and the AI's answers, kept in game.json beside the PGN, or in talk.json with no game (D-77).
import { type CurrentGame, endOf, type Shown, type Speaker, type TalkLine } from "./current-game.ts";
import type { TableTalk } from "./table-talk.ts";

/** The most the player may write in a move, in all their lines, and the most a line of the AI's may hold (D-54); with the helps on, as an analyst's note (D-78). */
export const talkLimits = { player: 200, ai: 300, aiHelps: 700 } as const;

/** Who says a line: the player, the AI in the chat, or the AI's agent thinking on the player's time (D-72), whose lines are the AI's on the page. */
export type Sayer = Speaker | "agent";

/** A talk: a game's, going on or over, or the one with no game, where both talk freely as between games (D-74, D-77). */
export type Talk = CurrentGame | TableTalk;

/**
 * A new line of the talk, said when the game has `ply` moves: refused when it is empty or too long. The player writes 200 characters a move in all, the
 * words sent with the move included; the AI speaks once a move of theirs, on their time, and its agent's word leaves it an answer to what they write after (D-54, D-72).
 */
export function talkLine(
    current: Talk,
    sayer: Sayer,
    text: string,
    at: Date,
    ply = isGame(current) ? current.game.record.moves.length : 0,
    aiMost: number = talkLimits.ai,
    shown?: Shown,
): TalkLine
{
    const who = sayer === "agent" ? "ai" : sayer;
    const words = text.trim();
    const most = who === "player" ? wordsLeft(current) : aiMost;

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

    if (who === "ai" && isGame(current)) {
        refuseAiWords(current, sayer === "agent");
    }

    return { who, text: words, ply, at: at.toISOString(), ...(sayer === "agent" ? { agent: true } : {}), ...(shown === undefined ? {} : { shown }) };
}

/** Words refused, and why, for the page to say it in the player's language: none, the move's characters spent, more than a line or what is left holds. */
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

/** Whether the player's last line wakes the chat: the first of a move, and between games the first since the AI last spoke (D-54, D-74). */
export function wakesTheChat(current: Talk): boolean
{
    return going(current) ? playerLinesThisMove(current).length === 1 : unanswered(current).length === 1;
}

/** Words of the player's, with the key that tells them apart across games, and in analysis the position the page showed (D-101). */
export interface Words
{
    readonly key: string;
    readonly text: string;
    readonly shown?: Shown;
}

/** What the player said that the AI has not answered, but for the words whose keys are in `given`. */
export function unheardWords(current: Talk, given: ReadonlySet<string>): Words[]
{
    return unanswered(current).filter(({ key }) => !given.has(key)).map(({ key, line }) => ({ key, text: line.text, ...(line.shown === undefined ? {} : { shown: line.shown }) }));
}

/** How far a line of the player's got: written, read by the AI in this chat, or answered by its words or its move. */
export type Heard = "sent" | "read" | "answered";

/** How far each line of the talk got: the player's by `Heard`, the AI's undefined (D-53). */
export function heardLines(current: Talk, given: ReadonlySet<string>): (Heard | undefined)[]
{
    const waiting = new Set(unanswered(current).map(({ key }) => key));
    return current.talk.map((line, index) => {
        const key = keyOf(current, index);
        return line.who === "ai" ? undefined : !waiting.has(key) ? "answered" : given.has(key) ? "read" : "sent";
    });
}

/** The lines the player wrote since the AI's last move: those it answers with its next move, and the 200 characters of this move are counted on them. */
function playerLinesThisMove(current: CurrentGame): TalkLine[]
{
    const since = sinceAiMoved(current);
    return current.talk.filter((line) => line.who === "player" && line.ply >= since);
}

/** How many characters the player may still write for this move; between games a whole line each time, with no count (D-74). */
function wordsLeft(current: Talk): number
{
    if (!going(current)) {
        return talkLimits.player;
    }

    return Math.max(talkLimits.player - playerLinesThisMove(current).reduce((sum, line) => sum + line.text.length, 0), 0);
}

/**
 * The AI speaks apart from its move once a move of the player's, on their time, with something to say or to answer (D-72), and never while its move waits:
 * it speaks in the move's comment then. Its agent speaks only first, when the player has written nothing to answer, and its word leaves the chat one answer
 * to what they write after. Between games it talks freely, about the game just over or to start another (D-74).
 */
function refuseAiWords(current: CurrentGame, byAgent: boolean): void
{
    const { game, ai } = current;
    const since = sinceAiMoved(current);

    if (endOf(game) !== undefined) {
        return;
    }

    if (game.position.turn === ai) {
        throw new Error("It is your move: speak in ai_move's comment. Nothing changed.");
    }

    const spoken = current.talk.filter((line) => line.who === "ai" && line.ply >= since);

    if (byAgent) {
        refuseAgentWords(current, spoken);
        return;
    }

    if (spoken.some((line) => line.agent !== true)) {
        throw new Error("You have spoken once for this move: say the rest in ai_move's comment. Nothing changed.");
    }

    if (spoken.length > 0 && unanswered(current).length === 0) {
        throw new Error("You have said a word on the player's time already: speak again only to answer them, else in ai_move's comment. Nothing changed.");
    }
}

/** The agent's word on the player's time: one, and none once they have written, since the chat answers them. */
function refuseAgentWords(current: CurrentGame, spoken: readonly TalkLine[]): void
{
    if (spoken.length > 0) {
        throw new Error("You have spoken for this move already: say nothing more. Nothing changed.");
    }

    if (unanswered(current).length > 0) {
        throw new Error("The player has written to you, and the AI in the chat answers them: say nothing. Nothing changed.");
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
function unanswered(current: Talk): { key: string; line: TalkLine; }[]
{
    const { talk } = current;
    const lastSaid = talk.findLastIndex((line) => line.who === "ai");
    return talk.flatMap((line, index) => index > lastSaid && line.who === "player" && !aiMovedSince(current, line.ply) ? [{ key: keyOf(current, index), line }] : []);
}

/** Whether the AI has moved since the game had `ply` moves: the last move is the AI's when the AI is not to move, and two moves on, one of them is. */
function aiMovedSince(current: Talk, ply: number): boolean
{
    if (!isGame(current)) {
        return false;
    }

    const moves = current.game.record.moves.length;
    return moves > ply + 1 || (moves === ply + 1 && current.game.position.turn !== current.ai);
}

function isGame(current: Talk): current is CurrentGame
{
    return "game" in current;
}

/** Whether a game goes on, with its limits to the talk; none with no game or once it is over. */
function going(current: Talk): current is CurrentGame
{
    return isGame(current) && endOf(current.game) === undefined;
}

function keyOf(current: Talk, index: number): string
{
    return `${current.started}#${index}`;
}
