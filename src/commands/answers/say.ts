// The talk on the board page (D-51): a line of the player's or the AI's, saved with the game, and the player's words the AI has not been given yet.
import { endWithMood, type Mood } from "../../core/index.ts";
import { archiveMood, endOf, gameInAnalysis, loadGame, loadTableTalk, saveGame, saveTableTalk, type Sayer, type Shown, type TableTalk, type Talk, talkLimits, talkLine, unheardWords, type Words } from "../../games/index.ts";
import { gameFolder, helpsIn } from "../../profiles/index.ts";
import type { Context, SeenPosition } from "../registry/index.ts";
import { gameAt } from "./clock.ts";
import { shownMove, shownMoves } from "./lines.ts";
import { openingTags } from "./opening-tags.ts";

/**
 * Adds a line to the talk of the current game, going on or just over, and saves it; the AI's mood once the game is over, which the archive keeps too (D-70).
 * With no game the line goes in the talk before it (D-77). A line refused changes nothing: it throws, in words for whoever spoke. With `answersEachLine`,
 * for a chat the table drives, the AI may answer each line of the player's it has not answered: written after its last words, or given to it since (`owed`).
 */
export function say(folder: string, who: Sayer, text: string, at: Date, mood?: Mood, shown?: Shown, answersEachLine: false | { owed: boolean; } = false): Talk
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
    current.talk.push(talkLine(current, who, text, at, undefined, aiMost(folder, who, text, going), shown, answersEachLine));

    if (mood !== undefined) {
        endWithMood(current.game, mood);
    }

    saveGame(folder, current);

    if (mood !== undefined) {
        archiveMood(folder, current, mood, openingTags(current.game.record));
    }

    return current;
}

/**
 * The AI's words written in its chat outside any tool, which the player of a chat the table drives sees nowhere else: said on the board page as the AI's
 * line, with none of ai_say's limits on when it speaks, cut at the end of a sentence within the longest line the talk takes. What it said, none when empty.
 */
export function sayProse(folder: string, text: string, at: Date): string | undefined
{
    const words = proseLine(text);

    if (words === "") {
        return undefined;
    }

    const current = loadGame(folder);
    const line = { who: "ai" as const, text: words, at: at.toISOString() };

    if (current === undefined) {
        const before = loadTableTalk(folder);
        saveTableTalk(folder, { started: before.started === "" ? at.toISOString() : before.started, talk: [...before.talk, { ...line, ply: 0 }] });
    } else {
        saveGame(folder, { ...current, talk: [...current.talk, { ...line, ply: current.game.record.moves.length }] });
    }

    return words;
}

/**
 * Whether the AI spoke through its tools or moved since `since`, `from` being the game as it was then: a line of its own on the board page, or a move it
 * played after `from`, with a comment or none. The text a turn writes outside the tools is shown only when the AI did neither in it: its words before a move
 * are its reasoning, never the player's to read.
 */
export function aiActedSince(folder: string, since: Date, from: SeenPosition | undefined): boolean
{
    const current = loadGame(folder);
    const talk = current?.talk ?? loadTableTalk(folder).talk;

    if (talk.some((line) => line.who === "ai" && Date.parse(line.at) >= since.getTime())) {
        return true;
    }

    if (current === undefined) {
        return false;
    }

    const first = from?.started === current.started ? from.plies : 0;
    // The AI's moves are those that leave the player to move: the last when it is the player's turn, and every other one before it.
    const aiParity = (current.game.record.moves.length - (current.game.position.turn === current.ai ? 0 : 1)) % 2;
    return current.game.record.moves.some((_move, index) => index >= first && index % 2 === aiParity);
}

/** Prose made one line of the talk: its blank lines and spaces as one, cut at the last end of a sentence within the longest line, or at a word's end. */
function proseLine(text: string): string
{
    const words = text.replace(/\s+/g, " ").trim();
    const most = talkLimits.aiHelps;

    if (words.length <= most) {
        return words;
    }

    const kept = words.slice(0, most);
    const sentence = Math.max(...[". ", "! ", "? ", "… "].map((end) => kept.lastIndexOf(end)));

    if (sentence > 0) {
        return kept.slice(0, sentence + 1);
    }

    return `${kept.slice(0, Math.max(kept.lastIndexOf(" "), most - 1))}…`;
}

/**
 * Words of the player's as the AI is given them: their text, and in analysis the move the board page showed as they wrote, 52...♚f6 (D-101), with the
 * variation they played there as PGN writes it (D-116).
 */
export interface Written
{
    readonly text: string;
    readonly place?: string;
    readonly variation?: string;
    /** The game of the variation, when it is not the one in analysis. */
    readonly variationGame?: string;
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
        context.givenSinceWords?.add(key);
    }

    if (context.given.size > before) {
        context.heard?.();
    }

    const analysed = words.some((word) => word.shown !== undefined) ? gameInAnalysis(gameFolder(context.home()))?.game : undefined;
    return words.map(({ text, shown }) => {
        if (shown === undefined) {
            return { text };
        }

        const place = placeOf(shown, analysed);

        if (shown.variation === undefined) {
            return { text, place };
        }

        return shown.game === analysed ? { text, place, variation: shown.variation.text } : { text, place, variation: shown.variation.text, variationGame: shown.game };
    });
}

/**
 * Where the page stood: the move shown, as the player saw it, or the start; on a variation, its move shown and the whole variation, or the game's move with
 * the variation set aside (D-116); with the game's name when the page shows another now.
 */
function placeOf({ game, move, variation }: Shown, analysed: string | undefined): string
{
    const there = move === undefined ? "the start" : shownMove(move);
    const other = game === analysed ? "" : variation === undefined ? ` of ${game}` : ` in ${game}`;

    if (variation === undefined) {
        return `${there}${other}`;
    }

    const line = `the variation ${shownMoves(variation.text)}`;
    return `${variation.move === undefined ? `${there}, ${line} set aside` : `${shownMove(variation.move)} of ${line}`}${other}`;
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
