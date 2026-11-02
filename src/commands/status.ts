import { z } from "zod";
import { archivedName, loadGame } from "../games/index.ts";
import { version } from "../version.ts";
import { type GameSummary, nextStep, positionLines, sidesLine, summaryOf } from "./game-summary.ts";
import { defineCommand } from "./registry.ts";

interface Status
{
    version: string;
    folder: string;
    game?: GameSummary;
    /** Why the game on disk cannot be read, when it cannot. */
    problem?: string;
}

/** What Chesspal sees now, the first call of a chat: a dashboard under 150 tokens while the player is to move, with the next step. */
export const status = defineCommand({
    name: "status",
    description: "Shows what Chesspal sees now: its version, the player's folder and the game, with your next step. Call it at the start of every chat, "
        + "before anything else.",
    input: z.object({}),
    readOnly: true,
    alwaysLoad: true,
    run: (_input, context): Status => {
        const status: Status = { version, folder: context.folder };

        try {
            const current = loadGame(context.folder);

            if (current !== undefined) {
                status.game = summaryOf(current, archivedName(context.folder, current));
            }
        } catch (error) {
            status.problem = (error as Error).message;
        }

        return status;
    },
    format: ({ version, folder, game, problem }) => [`Chesspal ${version}. Folder: ${folder}`, ...(problem === undefined ? gameLines(game) : [problem])].join("\n"),
});

function gameLines(game: GameSummary | undefined): string[]
{
    if (game === undefined) {
        return ["No game.", nextStep(game)];
    }

    const moves = game.lastMoves === "" ? [] : [`Moves: ${game.lastMoves}`];
    return [`Game: ${sidesLine(game.ai)}.`, ...moves, ...positionLines(game), nextStep(game)];
}
