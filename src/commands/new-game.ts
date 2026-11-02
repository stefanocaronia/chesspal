import { z } from "zod";
import { Game, type GameRecord, pgnDate, readPgn, type Side } from "../core/index.ts";
import { archivedName, archiveGame, type CurrentGame, endOf, loadGame, saveGame, startOfNewGame, withoutPlans } from "../games/index.ts";
import { type GameSummary, nextStep, positionLines, sidesLine, summaryOf } from "./game-summary.ts";
import { defineCommand } from "./registry.ts";

interface NewGame
{
    game: GameSummary;
    /** Where the game before went: one going on, unfinished; one over, when its archive could not be written at its end. */
    archived?: { name: string; finished: boolean; };
}

/** A new game against the player, from the standard position or from a FEN or PGN; a game going on is never lost (D-41). */
export const newGame = defineCommand({
    name: "new_game",
    description: "Starts a new game against the player, from the standard position or from a FEN or PGN they give. Ask them first which colour they want. "
        + 'Example: new_game {ai_colour: "black"}.',
    input: z.object({
        ai_colour: z.enum(["white", "black", "random"]).describe("the colour you play: random draws it"),
        from: z.string().optional().describe("a FEN or a PGN to go on from, instead of the standard position"),
        replace: z.boolean().default(false).describe("start even though a game is going on: it goes to the archive unfinished"),
    }),
    alwaysLoad: true,
    positionals: ["ai_colour"],
    run: ({ ai_colour: colour, from, replace }, context): NewGame => {
        const before = loadGame(context.folder);
        const going = before !== undefined && endOf(before.game) === undefined ? before : undefined;

        if (going !== undefined && !replace) {
            const { moveNumber } = going.game.position;
            throw new Error(`A game is going on, at move ${moveNumber}: end it with end_game, or call new_game with replace: true, which archives it unfinished. Nothing changed.`);
        }

        const ai = colour === "random" ? (context.random() < 0.5 ? "white" : "black") : colour;
        const started = startOfNewGame(context.folder, context.now(), before);
        const current: CurrentGame = { game: startingGame(from, ai, started), ai, started: started.toISOString() };
        const archived = before === undefined || (going === undefined && archivedName(context.folder, before) !== undefined) ? undefined : archiveBefore(context.folder, before);
        saveGame(context.folder, current);
        return archived === undefined ? { game: summaryOf(current) } : { game: summaryOf(current), archived: { name: archived, finished: going === undefined } };
    },
    format: ({ game, archived }) =>
        [
            `New game: ${sidesLine(game.ai)}.`,
            ...(archived === undefined ? [] : [`The game before is in ${archived.name}${archived.finished ? "" : ", unfinished"}.`]),
            ...positionLines(game),
            nextStep(game),
        ].join("\n"),
});

// A FEN's board: eight ranks of pieces and empty counts.
const fenPattern = /^[pnbrqkPNBRQK1-8]+(?:\/[pnbrqkPNBRQK1-8]+){7}(?:\s|$)/;

function archiveBefore(folder: string, before: CurrentGame): string
{
    try {
        return archiveGame(folder, before);
    } catch (error) {
        throw new Error(`${(error as Error).message} Nothing changed.`, { cause: error });
    }
}

/** The new game: the standard position, or the one a FEN or PGN gives, which must still be going on. Its tags are Chesspal's: an imported game gives its position only. */
function startingGame(from: string | undefined, ai: Side, started: Date): Game
{
    const tags = { Event: "Chesspal", Date: pgnDate(started), White: ai === "white" ? "AI" : "Player", Black: ai === "black" ? "AI" : "Player" };
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
