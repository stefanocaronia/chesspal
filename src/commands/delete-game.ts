// A game deleted from a profile (D-92): played here or kept to study, with its review. Only the command line and the page delete, never the AI.
import { z } from "zod";
import { archiveName, deleteGame as deleteGameFile, endAnalysis, endOf, gameInAnalysis, listedName, loadGame, removeGame } from "../games/index.ts";
import { gameFolder } from "../profiles/index.ts";
import { defineCommand } from "./registry.ts";

/** Deletes a game of the profile in use, by its name as past_games or study_games writes it. */
export const deleteGame = defineCommand({
    name: "delete_game",
    description: "Deletes a game of the profile in use, played here or kept to study, with its review: it cannot be undone. "
        + "Example: chesspal delete_game games/2026-11-02-153012.pgn.",
    input: z.object({ game: z.string().min(1).describe("the game, as past_games or study_games writes it") }),
    cliOnly: true,
    destructive: true,
    positionals: ["game"],
    run: ({ game }, context): { deleted: string; } => {
        const folder = gameFolder(context.home());
        const name = listedName(folder, game);
        deleteGameFile(folder, name);

        if (gameInAnalysis(folder)?.game === name) {
            endAnalysis(folder);
        }

        // The game over still on the table would go back to the archive with the next game.
        const current = loadGame(folder);

        if (current !== undefined && endOf(current.game) !== undefined && archiveName(current) === name) {
            removeGame(folder);
        }

        return { deleted: name };
    },
    format: ({ deleted }) => `${deleted} deleted, with its review.`,
});
