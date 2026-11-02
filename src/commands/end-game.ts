import { z } from "zod";
import { Game } from "../core/index.ts";
import { type CurrentGame, saveGame } from "../games/index.ts";
import { colourName, gameGoingOn, type GameSummary, nextStep, positionLines, summaryOf } from "./game-summary.ts";
import { archived } from "./play-move.ts";
import { defineCommand } from "./registry.ts";

interface Ended
{
    game: GameSummary;
    warning?: string;
}

/** The endings the board cannot see: a resignation, a draw agreed. Checkmate, stalemate and the draws by rule end the game by themselves (D-37). */
export const endGame = defineCommand({
    name: "end_game",
    description: "Ends the game by a resignation or a draw agreed with the player; checkmate, stalemate and the draws by rule end it by themselves. Call it "
        + 'only when the player resigns or agrees to a draw, or when you resign. Example: end_game {result: "player_resigns"}.',
    input: z.object({ result: z.enum(["player_resigns", "ai_resigns", "draw_agreed"]).describe("how the game ends") }),
    idempotent: true,
    positionals: ["result"],
    run: ({ result }, context): Ended => {
        const current = gameGoingOn(context.folder);
        const loser = result === "player_resigns" ? (current.ai === "white" ? "black" : "white") : current.ai;
        const ending = result === "draw_agreed"
            ? { Result: "1/2-1/2", Termination: "draw agreed" }
            : { Result: loser === "white" ? "0-1" : "1-0", Termination: `${colourName(loser)} resigns` };
        const { record } = current.game;
        const ended: CurrentGame = { ...current, game: new Game({ ...record, tags: { ...record.tags, ...ending } }) };
        saveGame(context.folder, ended);
        const { archive, warning } = archived(context.folder, ended);
        return warning === undefined ? { game: summaryOf(ended, archive) } : { game: summaryOf(ended, archive), warning };
    },
    format: ({ game, warning }) => [...positionLines(game), ...(warning === undefined ? [] : [warning]), nextStep(game)].join("\n"),
});
