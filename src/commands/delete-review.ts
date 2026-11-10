// A game's review deleted (D-92): the game stays, to analyse again, with another model or effort or after an update. Only the command line and the page
// delete, never the AI.
import { z } from "zod";
import { isReviewed, unreviewed } from "../core/index.ts";
import { endAnalysis, forgetCoach, gameInAnalysis, isOverOnTable, rewriteGame, startAnalysis } from "../games/index.ts";
import { gameFolder } from "../profiles/index.ts";
import { defineCommand } from "./registry.ts";
import { namedGame } from "./study.ts";

/** Deletes the review of a game of the profile in use, by its name as past_games or study_games writes it. */
export const deleteReview = defineCommand({
    name: "delete_review",
    description: "Deletes the review of a game of the profile in use: the badges, notes, drawings and estimates on its moves, the word on the game and who "
        + "signed it, the coach's judgments too; the game stays, to analyse again. Example: chesspal delete_review games/2026-11-02-153012.pgn.",
    input: z.object({ game: z.string().min(1).describe("the game, as past_games or study_games writes it") }),
    cliOnly: true,
    destructive: true,
    idempotent: true,
    positionals: ["game"],
    run: ({ game }, context): { game: string; reviewed: boolean; } => {
        const folder = gameFolder(context.home());
        const { record, name } = namedGame(context, game);
        rewriteGame(folder, name, unreviewed(record));

        // The coach's judgments on the game just over would go back into it.
        if (isOverOnTable(folder, name)) {
            forgetCoach(folder);
        }

        // The page showing the game hears of it, and shows it without its review; the chat's corrections go with it.
        if (gameInAnalysis(folder)?.game === name) {
            endAnalysis(folder);
            startAnalysis(folder, name, context.now());
        }

        return { game: name, reviewed: isReviewed(record) };
    },
    format: ({ game, reviewed }) => `${game}: ${reviewed ? "review deleted" : "it had no review; the judgments on its moves are deleted"}. analyse_game goes over it again.`,
});
