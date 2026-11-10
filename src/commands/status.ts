import { z } from "zod";
import { gameReviewOf, leadOf, reviewOf } from "../core/index.ts";
import { archivedName, cleanSince, endOf, gameInAnalysis, lastChatStart } from "../games/index.ts";
import { outdatedHostFiles } from "../host-files/index.ts";
import { gameFolder } from "../profiles/index.ts";
import { version } from "../version.ts";
import { analystLine, analystRuns, coachOnEnd, coachOnEndLine, coachRuns, goneOver, reviewedLine, withAnalyst } from "./agents.ts";
import { closingLines, newGameStep, positionLines, shownMoves, sidesLine, wordLines } from "./answer-lines.ts";
import { gameAt } from "./clock.ts";
import type { Context } from "./context.ts";
import { type GameSummary, summaryOf, withThought } from "./game-summary.ts";
import { instructionsRead } from "./instructions.ts";
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
    analysis?: { game: string; brought?: true; analyst?: "done" | "offer"; review?: string; };
    /** A game going on from before this chat, told once a chat: the player says whether to go on with it. */
    fromBefore?: true;
    /** The coach to start, once, for the player's move that ended the game (D-88). */
    coach?: true;
    /** The files an older init wrote in the player's folder, which this version would write otherwise. */
    outdated?: string[];
    /** The chat has not read the opponent's instructions since it started, or was cleared or summarized (D-102). */
    unread?: true;
}

/** What Chesspal sees now, the first call of a chat: a dashboard under 150 tokens while the player is to move, with the next step. */
export const status = defineCommand({
    name: "status",
    description: "Shows what Chesspal sees now: its version, the profile's folder and the game, with your next step. Call it at the start of every chat, "
        + "with `instructions`.",
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
        const chatStart = lastChatStart(context.folder);
        const first = firstInChat(context, chatStart?.at);
        // An older init's files are told once a chat, at its first status: reading them all is the slowest part of a status.
        const outdated = context.told === undefined || first ? outdatedHostFiles(context.folder, context.platform) : [];
        const status: Status = { version, folder, ...(player === undefined ? {} : { player }), ...(speech === undefined ? {} : { speech }), ...(outdated.length === 0 ? {} : { outdated }) };

        if (context.page !== undefined) {
            status.page = context.page;
        }

        if (closedPage(context) !== undefined) {
            status.pageClosed = true;
        }

        if (!instructionsRead(context, chatStart?.at)) {
            status.unread = true;
        }

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

                // A game a summarized or resumed chat still holds is its own; without the host's word of the chat's start, any game began before it.
                if (first && endOf(current.game) === undefined && (chatStart === undefined || cleanSince(chatStart, current.started))) {
                    status.fromBefore = true;
                }

                // The player's move on the board page that ended the game: the coach judges it too (D-88).
                if (coachOnEnd(context, folder, current)) {
                    status.coach = true;
                }
            }

            const analysis = current === undefined || status.game?.end !== undefined ? gameInAnalysis(folder) : undefined;

            if (analysis !== undefined) {
                // The analyst agent goes over a game the player brought, or whose review was deleted, where it runs, and the chat over what it reviewed (D-89).
                const review = analysis.brought === true ? undefined : reviewProgress(context, analysis.game);
                status.analysis = {
                    game: analysis.game,
                    ...(analysis.brought === true ? { brought: true } : {}),
                    ...(analystRuns(context) ? { analyst: goneOver(context, analysis.game) ? "done" as const : "offer" as const } : {}),
                    ...(review === undefined ? {} : { review }),
                };
            }
        } catch (error) {
            status.problem = (error as Error).message;
        }

        return status;
    },
    format: ({ version, folder, page, pageClosed, player, speech, game, problem, words = [], analysis, fromBefore, coach, outdated, unread }) =>
        [
            `Chesspal ${version}. Folder: ${folder}`,
            ...(unread === true ? [unreadLine] : []),
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

// The opponent's instructions, which the chat reads before its first reply (D-102).
const unreadLine = "Call `instructions` before you answer the player, if you have not called it since this chat started or was summarized.";

// The game going on as a chat starts: the player may have come back for it, or want another.
const fromBeforeLine = "A game from before this chat is going on: ask the player whether to go on with it. For a new one, " + newGameStep;

/**
 * Whether this is the chat's first status: once a chat where the MCP server keeps what it told, again in a chat cleared or summarized, since its start keys
 * it (D-57); never on the command line.
 */
function firstInChat(context: Context, chatStart: string | undefined): boolean
{
    const key = `game before ${chatStart ?? ""}`;

    if (context.told === undefined || context.told.has(key)) {
        return false;
    }

    context.told.add(key);
    return true;
}

/**
 * The game in analysis, with how far its review has got; the next step when the player has just brought it on the board page, unless an analyst is at it
 * already; the analyst agent for a game whose review was deleted, where it runs (Stefano).
 */
function analysisLine({ game, brought, analyst, review }: NonNullable<Status["analysis"]>): string
{
    if (brought === true && analyst !== "done") {
        return analyst === "offer"
            ? `The player brought ${game} on the board page to analyse it. Next: ${analystLine(game)}`
            : `The player brought ${game} on the board page to analyse it. Next: call analyse_game {"game": "${game}"}, then keep your review on that page with annotate_game, and go over it with them.`;
    }

    const shown = `In analysis on the board page: ${game}${review === undefined ? "" : ` (${review})`}`;

    if (analyst === "done") {
        return `${shown}. ${reviewedLine(game)}`;
    }

    return analyst === "offer" ? `${shown}. When the player wants it gone over, ${analystLine(game)}` : `${shown}; analyse_game {"game": "${game}"} goes over it with the player.`;
}

/**
 * How far the review of a game has got, as the board page shows it (Priya): done once it holds the word on the whole game and who is ahead after every move
 * but the last; the analyst may still write notes after its word, so that alone is not the end.
 */
function reviewProgress(context: Context, game: string): string | undefined
{
    try {
        const { record } = namedGame(context, game);
        const worded = gameReviewOf(record) !== undefined;
        const estimated = record.moves.filter(({ comment }) => leadOf(comment) !== undefined).length;

        if (worded && estimated >= record.moves.length - 1) {
            return "its review is done";
        }

        const noted = record.moves.filter(({ comment }) => {
            const review = reviewOf(comment);
            return review !== undefined && (review.badge !== "book" || review.note !== undefined);
        }).length;
        const word = worded ? ", its word on the game written" : "";
        return noted === 0 && estimated === 0 && !worded
            ? "no review yet"
            : `its review so far: notes on ${noted} moves, who is ahead after ${estimated} of ${record.moves.length}${word}`;
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
    const closing = [...(coach ? [coachOnEndLine] : []), ...(brought ? wordLines(words) : closingLines(game, words, pageClosed))];

    if (game === undefined) {
        return ["No game.", ...closing];
    }

    // With the figurines, as every answer writes moves: in letters the AI copied them into its message (Priya).
    const moves = game.lastMoves === "" ? [] : [`Moves: ${shownMoves(game.lastMoves)}`];
    return [`Game: ${sidesLine(game.ai)}, ${levelText(game.level)}.`, ...moves, ...positionLines(game), ...closing];
}
