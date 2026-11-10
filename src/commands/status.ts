import { z } from "zod";
import { gameReviewOf, leadOf, reviewOf } from "../core/index.ts";
import { archivedName, cleanSince, endOf, gameInAnalysis, lastChatStart } from "../games/index.ts";
import { coachAgent, outdatedHostFiles } from "../host-files/index.ts";
import { gameFolder } from "../profiles/index.ts";
import { version } from "../version.ts";
import { agentsLine, analystLine, analystRuns, coachOnEnd, coachRuns, reviewedLine, withAnalyst } from "./agents.ts";
import { closingLines, newGameStep, positionLines, sidesLine, wordLines } from "./answer-lines.ts";
import { gameAt } from "./clock.ts";
import type { Context } from "./context.ts";
import { type GameSummary, summaryOf, withThought } from "./game-summary.ts";
import { levelText } from "./levels.ts";
import { closedPage, pageGiven, pageLine } from "./page-link.ts";
import { playerLine } from "./profiles.ts";
import { defineCommand } from "./registry.ts";
import { unansweredWords, type Written } from "./say.ts";
import { type Speech, speechLine, speechOf } from "./speech.ts";
import { namedGame } from "./study.ts";

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
    /** The player's language when it is not English. */
    speech?: Speech;
    game?: GameSummary;
    /** Why the game on disk cannot be read, when it cannot. */
    problem?: string;
    /** What the player wrote on the board page that the AI has not answered yet, all of it. */
    words?: Written[];
    /** The game in analysis on the board page once none goes on (D-69), which the player may have brought there. */
    analysis?: { game: string; brought?: true; analyst?: true; review?: string; };
    /** A game going on from before this chat, told once a chat: the player says whether to go on with it. */
    fromBefore?: true;
    /** The coach to start, once, for the player's move that ended the game (D-88). */
    coach?: true;
    /** The files an older init wrote in the player's folder, which this version would write otherwise. */
    outdated?: string[];
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
    run: (input, context): Status => {
        // The folder is the profile's, in the data folder (D-71): the names of its games are relative to it.
        const folder = gameFolder(context.home());
        const player = playerLine(context);
        const speech = speechOf(folder, context.language);
        const outdated = outdatedHostFiles(context.folder, context.platform);
        const status: Status = { version, folder, ...(player === undefined ? {} : { player }), ...(speech === undefined ? {} : { speech }), ...(outdated.length === 0 ? {} : { outdated }) };

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
                status.game = withAnalyst(withThought(summaryOf(current, context.now(), archivedName(folder, current)), folder, current, coachRuns(context)), context, current);

                if (status.pageClosed === true) {
                    pageGiven(context, current.started);
                }

                if (first && endOf(current.game) === undefined && fromBeforeChat(context, current.started)) {
                    status.fromBefore = true;
                }

                // The player's move on the board page that ended the game: the coach judges it too (D-88).
                if (coachOnEnd(context, folder, current)) {
                    status.coach = true;
                }
            }

            const analysis = current === undefined || status.game?.end !== undefined ? gameInAnalysis(folder) : undefined;

            if (analysis !== undefined) {
                // The analyst agent goes over a game the player brought, where it runs, and the chat over what it reviewed (D-89).
                const review = analysis.brought === true ? undefined : reviewProgress(context, analysis.game);
                status.analysis = {
                    game: analysis.game,
                    ...(analysis.brought === true ? { brought: true } : {}),
                    ...(analystRuns(context) ? { analyst: true } : {}),
                    ...(review === undefined ? {} : { review }),
                };
            }
        } catch (error) {
            status.problem = (error as Error).message;
        }

        return status;
    },
    format: ({ version, folder, page, pageClosed, player, speech, game, problem, words = [], analysis, fromBefore, coach, outdated }) =>
        [
            `Chesspal ${version}. Folder: ${folder}`,
            ...(outdated === undefined ? [] : [outdatedLine(outdated)]),
            ...(page === undefined ? [] : [pageLine(page, pageClosed === true)]),
            ...(player === undefined ? [] : [player]),
            ...(speech === undefined ? [] : [speechLine(speech)]),
            ...(fromBefore === true ? [fromBeforeLine] : []),
            ...(problem !== undefined ? [problem] : gameLines(game, words, analysis?.brought === true, pageClosed === true, coach === true)),
            ...(analysis === undefined ? [] : [analysisLine(analysis)]),
        ].join("\n"),
});

/** An older init's files in the player's folder: the player runs init again, with the chat closed, since the host reads them as a chat starts. */
function outdatedLine(files: readonly string[]): string
{
    return `This folder was set up by an older Chesspal (${files.join(", ")}): tell the player, in their language, to close this chat, run "chesspal init" `
        + "in this folder and open a new chat. Until then the agents and your instructions are the old ones.";
}

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

/** The game in analysis, with how far its review has got; the next step when the player has just brought it on the board page. */
function analysisLine({ game, brought, analyst, review }: NonNullable<Status["analysis"]>): string
{
    if (brought === true) {
        return analyst === true
            ? `The player brought ${game} on the board page to analyse it. Next: ${analystLine(game)}`
            : `The player brought ${game} on the board page to analyse it. Next: call analyse_game {"game": "${game}"}, then keep your review on that page with annotate_game, and go over it with them.`;
    }

    const shown = `In analysis on the board page: ${game}${review === undefined ? "" : ` (${review})`}`;
    return analyst === true ? `${shown}. ${reviewedLine(game)}` : `${shown}; analyse_game {"game": "${game}"} goes over it with the player.`;
}

/** How far the review of a game has got, as the board page shows it (Priya): done once it holds the word on the whole game. */
function reviewProgress(context: Context, game: string): string | undefined
{
    try {
        const { record } = namedGame(context, game);

        if (gameReviewOf(record) !== undefined) {
            return "its review is done";
        }

        const noted = record.moves.filter(({ comment }) => {
            const review = reviewOf(comment);
            return review !== undefined && (review.badge !== "book" || review.note !== undefined);
        }).length;
        const estimated = record.moves.filter(({ comment }) => leadOf(comment) !== undefined).length;
        return noted === 0 && estimated === 0 ? "no review yet" : `its review so far: notes on ${noted} moves, who is ahead after ${estimated} of ${record.moves.length}`;
    } catch {
        return undefined;
    }
}

/**
 * The game's lines; a game the player brought to analyse takes the place of the next step. The coach to start goes just before the next step, where
 * the AI acts on it (Priya).
 */
function gameLines(game: GameSummary | undefined, words: readonly Written[], brought: boolean, pageClosed: boolean, coach: boolean): string[]
{
    const closing = [...(coach ? [agentsLine([coachAgent])] : []), ...(brought ? wordLines(words) : closingLines(game, words, pageClosed))];

    if (game === undefined) {
        return ["No game.", ...closing];
    }

    const moves = game.lastMoves === "" ? [] : [`Moves: ${game.lastMoves}`];
    return [`Game: ${sidesLine(game.ai)}, ${levelText(game.level)}.`, ...moves, ...positionLines(game), ...closing];
}
