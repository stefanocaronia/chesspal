import { z } from "zod";
import { Game, type GameRecord, pgnDate, readPgn, type Side, startClock, type TimeControl, timeControlOf, timeControlTag } from "../core/index.ts";
import { archivedName, archiveGame, cleanSince, type CurrentGame, endOf, lastChatStart, saveGame, startOfNewGame, withoutPlans } from "../games/index.ts";
import { gameAt } from "./clock.ts";
import type { Context } from "./context.ts";
import { type GameSummary, nextStep, positionLines, sidesLine, summaryOf } from "./game-summary.ts";
import { pastGameLines } from "./past-games.ts";
import { defineCommand } from "./registry.ts";

interface NewGame
{
    game: GameSummary;
    /** Where the game before went: one going on, unfinished; one over, when its archive could not be written at its end. */
    archived?: { name: string; finished: boolean; };
    /** The last games played with this player, for a chat that starts clean (D-57). */
    past: string[];
}

/** A new game against the player, from the standard position or from a FEN or PGN; a game going on is never lost (D-41). */
export const newGame = defineCommand({
    name: "new_game",
    description: "Starts a new game against the player, from the standard position or from a FEN or PGN they give. Ask them first which colour they want, and whether "
        + 'they want a clock. Example: new_game {ai_colour: "black", clock: "10+5"}.',
    input: z.object({
        ai_colour: z.enum(["white", "black", "random"]).describe("the colour you play: random draws it"),
        from: z.string().optional().describe("a FEN or a PGN to go on from, instead of the standard position"),
        clock: z.string().optional().describe("the time control, minutes each and seconds added after each move, such as 10+5 or 3+0; none for a game without a clock"),
        replace: z.boolean().default(false).describe("start even though a game is going on: it goes to the archive unfinished"),
    }),
    alwaysLoad: true,
    positionals: ["ai_colour"],
    run: ({ ai_colour: colour, from, clock, replace }, context): NewGame => {
        const control = clock === undefined ? undefined : timeControlFrom(clock);
        const now = context.now();
        const before = gameAt(context.folder, now);
        const going = before !== undefined && endOf(before.game) === undefined ? before : undefined;

        if (going !== undefined && !replace) {
            const { moveNumber } = going.game.position;
            throw new Error(`A game is going on, at move ${moveNumber}: end it with end_game, or call new_game with replace: true, which archives it unfinished. Nothing changed.`);
        }

        if (before !== undefined && chatToClear(context, before)) {
            throw new ChatNotClear();
        }

        const ai = colour === "random" ? (context.random() < 0.5 ? "white" : "black") : colour;
        const started = startOfNewGame(context.folder, now, before);
        const game = startingGame(from, ai, started, control);
        const current: CurrentGame = control === undefined
            ? { game, ai, started: started.toISOString(), talk: [] }
            : { game, ai, started: started.toISOString(), talk: [], clock: startClock(control, now) };
        const archived = before === undefined || (going === undefined && archivedName(context.folder, before) !== undefined) ? undefined : archiveBefore(context.folder, before);
        saveGame(context.folder, current);
        const past = pastGameLines(context.folder, remembered);
        return archived === undefined ? { game: summaryOf(current, now), past } : { game: summaryOf(current, now), archived: { name: archived, finished: going === undefined }, past };
    },
    format: ({ game, archived, past }) =>
        [
            `New game: ${sidesLine(game.ai)}.`,
            ...(archived === undefined ? [] : [`The game before is in ${archived.name}${archived.finished ? "" : ", unfinished"}.`]),
            ...(past.length === 0 ? [] : ["Last games with this player (past_games gives more, and their moves):", ...past]),
            ...positionLines(game),
            nextStep(game),
        ].join("\n"),
});

/** The refusal of a new game in a chat that still holds the game before (D-57): the board page says it in the player's language. */
export class ChatNotClear extends Error
{
    constructor()
    {
        super(
            "The game before was played in this chat: ask the player to write /clear here, which empties the chat and keeps the games on disk, then "
                + "start the new game. A clean chat plays faster and costs less. Nothing changed.",
        );
    }
}

/** How many of the last games new_game recalls. */
const remembered = 3;

/** From how many plies a game played in a chat asks for a clean one before the next (D-57): one left after a few moves does not. */
export const pliesBeforeClearing = 20;

// A FEN's board: eight ranks of pieces and empty counts.
const fenPattern = /^[pnbrqkPNBRQK1-8]+(?:\/[pnbrqkPNBRQK1-8]+){7}(?:\s|$)/;

/** Whether the chat must be cleared first: a game of some length was played in it, and the host says how chats start (Claude Code's hook, T-85). */
function chatToClear(context: Context, before: CurrentGame): boolean
{
    const start = lastChatStart(context.folder);
    return context.host?.() === "claude-code" && start !== undefined && before.game.record.moves.length >= pliesBeforeClearing && !cleanSince(start, before.started);
}

function archiveBefore(folder: string, before: CurrentGame): string
{
    try {
        return archiveGame(folder, before);
    } catch (error) {
        throw new Error(`${(error as Error).message} Nothing changed.`, { cause: error });
    }
}

/** The new game: the standard position, or the one a FEN or PGN gives, which must still be going on. Its tags are Chesspal's: an imported game gives its position only. */
function startingGame(from: string | undefined, ai: Side, started: Date, control: TimeControl | undefined): Game
{
    const tags = {
        Event: "Chesspal",
        Date: pgnDate(started),
        White: ai === "white" ? "AI" : "Player",
        Black: ai === "black" ? "AI" : "Player",
        ...(control === undefined ? {} : { TimeControl: timeControlTag(control) }),
    };
    let game: Game;

    try {
        const record = from === undefined ? { tags: {}, moves: [] } : importedRecord(from.trim());
        const fen: Record<string, string> = record.tags.FEN === undefined ? {} : { SetUp: "1", FEN: record.tags.FEN };
        game = new Game({ tags: { ...tags, ...fen }, moves: record.moves });
    } catch (error) {
        throw new Error(`from: ${(error as Error).message} Nothing changed.`);
    }

    const end = endOf(game);

    if (end !== undefined) {
        throw new Error(`from holds a game already over (${end.result}): give one still going on, or leave from out for a new game. Nothing changed.`);
    }

    return game;
}

function timeControlFrom(clock: string): TimeControl
{
    try {
        return timeControlOf(clock);
    } catch (error) {
        throw new Error(`clock: ${(error as Error).message} Nothing changed.`);
    }
}

function importedRecord(from: string): GameRecord
{
    if (fenPattern.test(from)) {
        return { tags: { SetUp: "1", FEN: from }, moves: [] };
    }

    const records = readPgn(from);
    const [record] = records;

    if (record === undefined || records.length > 1) {
        throw new Error(`it holds ${records.length} games: give one, in PGN, or a FEN.`);
    }

    // Another game's [%plan] comments are not the AI's plans.
    return withoutPlans(record);
}
