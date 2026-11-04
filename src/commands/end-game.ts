import { z } from "zod";
import { canMate, endWithMood, Game, moods, type Side, timeLeft } from "../core/index.ts";
import { archiveEnded, bothSidesMoved, type CurrentGame, drawOfferOf, saveGame } from "../games/index.ts";
import { gameFolder } from "../profiles/index.ts";
import { gameGoingOn, type GameSummary, nextStep, positionLines, summaryOf } from "./game-summary.ts";
import { defineCommand } from "./registry.ts";
import { colourName } from "./view.ts";

interface Ended
{
    game: GameSummary;
    warning?: string;
}

/** The endings the board cannot see: a resignation, a draw agreed on an offer (D-65). Checkmate, stalemate and the draws by rule end the game by themselves (D-37). */
export const endGame = defineCommand({
    name: "end_game",
    description: "Ends the game by a resignation or a draw agreed; checkmate, stalemate and the draws by rule end it by themselves. Call it to resign, when "
        + 'the player resigns in the chat, or to agree a draw while an offer stands: theirs, or yours they accept in the chat. Example: end_game {result: "player_resigns"}.',
    input: z.object({
        result: z.enum(["player_resigns", "ai_resigns", "draw_agreed"]).describe("how the game ends"),
        mood: z.enum(moods).optional().describe("how you feel as the game ends, which your face on the board page keeps"),
    }),
    idempotent: true,
    positionals: ["result"],
    run: ({ result, mood }, context): Ended => {
        const now = context.now();
        const folder = gameFolder(context.folder);
        const current = gameGoingOn(folder, now);

        if (result === "draw_agreed") {
            refuseDraw(current);
        }

        const ending = result === "draw_agreed" ? { Result: "1/2-1/2", Termination: "draw agreed" } : resignation(current, result === "player_resigns" ? player(current) : current.ai);
        const { record } = current.game;
        const game = new Game({ ...record, tags: { ...record.tags, ...ending } });

        if (mood !== undefined) {
            endWithMood(game, mood);
        }

        // The clock stops at the end, with the time the side to move had spent.
        const ended: CurrentGame = current.clock === undefined
            ? { ...current, game }
            : { ...current, game, clock: { ...current.clock, left: timeLeft(current.clock, current.game.position.turn, now), since: now.toISOString() } };
        saveGame(folder, ended);
        const { archive, warning } = archiveEnded(folder, ended);
        return warning === undefined ? { game: summaryOf(ended, now, archive) } : { game: summaryOf(ended, now, archive), warning };
    },
    format: ({ game, warning }) => [...positionLines(game), ...(warning === undefined ? [] : [warning]), nextStep(game)].join("\n"),
});

/** A draw is agreed only on an offer that stands, once each side has moved (FIDE 5.2.3). */
function refuseDraw(current: CurrentGame): void
{
    if (!bothSidesMoved(current.game)) {
        throw new Error("A draw is agreed only once each side has made a move. Nothing changed.");
    }

    if (drawOfferOf(current) === undefined) {
        throw new Error("No draw offer stands: the player offers one with their move (player_move with offer_draw), you with yours (ai_move with offer_draw). Nothing changed.");
    }
}

/** The side that resigns loses, unless the other could not mate by any series of legal moves: then the game is drawn (FIDE 5.1.2). */
function resignation(current: CurrentGame, loser: Side): { Result: string; Termination: string; }
{
    const winner = loser === "white" ? "black" : "white";

    if (canMate(current.game.position.fen, winner)) {
        return { Result: loser === "white" ? "0-1" : "1-0", Termination: `${colourName(loser)} resigns` };
    }

    return { Result: "1/2-1/2", Termination: `${colourName(loser)} resigns and ${colourName(winner)} cannot mate` };
}

function player(current: CurrentGame): Side
{
    return current.ai === "white" ? "black" : "white";
}
