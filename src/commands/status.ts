import { z } from "zod";
import { archivedName, cleanSince, endOf, gameInAnalysis, lastChatStart } from "../games/index.ts";
import { gameFolder } from "../profiles/index.ts";
import { version } from "../version.ts";
import { gameAt } from "./clock.ts";
import type { Context } from "./context.ts";
import { closingLines, type GameSummary, newGameStep, positionLines, sidesLine, type Speech, speechLine, speechOf, summaryOf, withThought, wordLines } from "./game-summary.ts";
import { levelText } from "./levels.ts";
import { closedPage, pageLine } from "./page-link.ts";
import { playerLine } from "./profiles.ts";
import { defineCommand } from "./registry.ts";
import { unansweredWords } from "./say.ts";

interface Status
{
    version: string;
    folder: string;
    /** The board page's address, where the player plays when the chat serves it. */
    page?: string;
    /** No browser has the board page open: the player needs its address first. */
    pageClosed?: true;
    /** Who plays, from the profile in use (D-23), once the player has completed it (D-71). */
    player?: string;
    /** The player's language when it is not English, and their notation when its letters are not SAN's (D-83). */
    speech?: Speech;
    game?: GameSummary;
    /** Why the game on disk cannot be read, when it cannot. */
    problem?: string;
    /** What the player wrote on the board page that the AI has not answered yet, all of it (T-65). */
    words?: string[];
    /** The game in analysis on the board page once none goes on (D-69), which the player may have brought there (T-92). */
    analysis?: { game: string; brought?: true; };
    /** A game going on from before this chat, told once a chat: the player says whether to go on with it. */
    fromBefore?: true;
}

/** What Chesspal sees now, the first call of a chat: a dashboard under 150 tokens while the player is to move, with the next step. */
export const status = defineCommand({
    name: "status",
    description: "Shows what Chesspal sees now: its version, the profile's folder and the game, with your next step. Call it at the start of every chat, "
        + "before anything else.",
    input: z.object({}),
    // Read only for the host: a flag that has fallen is written, as the time already decided.
    readOnly: true,
    alwaysLoad: true,
    showsGame: true,
    run: (_input, context): Status => {
        // The folder is the profile's, in the data folder (D-71): the names of its games are relative to it.
        const folder = gameFolder(context.home());
        const player = playerLine(context);
        const speech = speechOf(folder, context.language);
        const status: Status = { version, folder, ...(player === undefined ? {} : { player }), ...(speech === undefined ? {} : { speech }) };

        if (context.page !== undefined) {
            status.page = context.page;
        }

        if (closedPage(context) !== undefined) {
            status.pageClosed = true;
        }

        const first = firstInChat(context);

        try {
            const current = gameAt(folder, context.now());

            // With no game the player may have written before the first (D-77).
            const words = unansweredWords(context);

            if (words.length > 0) {
                status.words = words;
            }

            if (current !== undefined) {
                status.game = withThought(summaryOf(current, context.now(), archivedName(folder, current)), folder, current);

                if (first && endOf(current.game) === undefined && fromBeforeChat(context, current.started)) {
                    status.fromBefore = true;
                }
            }

            const analysis = current === undefined || status.game?.end !== undefined ? gameInAnalysis(folder) : undefined;

            if (analysis !== undefined) {
                status.analysis = { game: analysis.game, ...(analysis.brought === true ? { brought: true } : {}) };
            }
        } catch (error) {
            status.problem = (error as Error).message;
        }

        return status;
    },
    format: ({ version, folder, page, pageClosed, player, speech, game, problem, words = [], analysis, fromBefore }) =>
        [
            `Chesspal ${version}. Folder: ${folder}`,
            ...(page === undefined ? [] : [pageLine(page, pageClosed === true)]),
            ...(player === undefined ? [] : [player]),
            ...(speech === undefined ? [] : [speechLine(speech)]),
            ...(fromBefore === true ? [fromBeforeLine] : []),
            ...(problem !== undefined ? [problem] : gameLines(game, words, analysis?.brought === true)),
            ...(analysis === undefined ? [] : [analysisLine(analysis)]),
        ].join("\n"),
});

// The game going on as a chat starts: the player may have come back for it, or want another.
const fromBeforeLine = "A game from before this chat is going on: ask the player whether to go on with it. For a new one, " + newGameStep;

/**
 * Whether this is the chat's first status: once a chat where the MCP server keeps what it told, again in a chat cleared or summarized, since its start keys
 * it (D-57); never on the command line.
 */
function firstInChat(context: Context): boolean
{
    const key = `game before ${lastChatStart(context.folder)?.at ?? ""}`;

    if (context.told === undefined || context.told.has(key)) {
        return false;
    }

    context.told.add(key);
    return true;
}

/** Whether a game began before the chat: one a summarized or resumed chat still holds is its own; without the host's word, any game is. */
function fromBeforeChat(context: Context, started: string): boolean
{
    const start = lastChatStart(context.folder);
    return start === undefined || cleanSince(start, started);
}

/** The game in analysis; the next step when the player has just brought it on the board page (T-92). */
function analysisLine({ game, brought }: NonNullable<Status["analysis"]>): string
{
    return brought === true
        ? `The player brought ${game} on the board page to analyse it. Next: call analyse_game {"game": "${game}"}, then keep your review on that page with annotate_game, and go over it with them.`
        : `In analysis on the board page: ${game}; analyse_game {"game": "${game}"} goes over it with the player.`;
}

/** The game's lines; a game the player brought to analyse takes the place of the next step (T-92). */
function gameLines(game: GameSummary | undefined, words: readonly string[], brought: boolean): string[]
{
    if (game === undefined) {
        return ["No game.", ...(brought ? wordLines(words) : closingLines(game, words))];
    }

    const moves = game.lastMoves === "" ? [] : [`Moves: ${game.lastMoves}`];
    return [`Game: ${sidesLine(game.ai)}, ${levelText(game.level)}.`, ...moves, ...positionLines(game), ...(brought ? wordLines(words) : closingLines(game, words))];
}
