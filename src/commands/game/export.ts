import { z } from "zod";
import { movesPgn, playerPgn } from "../../games/index.ts";
import { gameFolder } from "../../profiles/index.ts";
import { gameAt } from "../answers/index.ts";
import { defineCommand } from "../registry/index.ts";

interface Exported
{
    format: "pgn" | "moves" | "fen";
    text: string;
}

/** The game as PGN or its position as FEN, for the player to copy or keep: the plans stay hidden while it goes on (D-29); the moves alone for another site. */
export const exportGame = defineCommand({
    name: "export",
    description: "Gives the game as PGN, its moves alone as PGN for Lichess or chess.com, or its position as FEN, for the player to copy or keep. While the game goes on, "
        + 'the PGN leaves out your plans. Example: export {format: "moves"}.',
    input: z.object({
        format: z.enum(["pgn", "moves", "fen"]).describe("pgn for the whole game with its comments, moves for the moves alone, to load on Lichess or chess.com, fen for the position"),
    }),
    // Read only for the host: a flag that has fallen is written, as the time already decided.
    readOnly: true,
    positionals: ["format"],
    run: ({ format }, context): Exported => {
        const folder = gameFolder(context.home());
        const current = gameAt(folder, context.now());

        if (current === undefined) {
            throw new Error("There is no game to export: start one with new_game.");
        }

        const text = format === "fen" ? current.game.position.fen : format === "moves" ? movesPgn(current) : playerPgn(folder, current);
        return { format, text };
    },
    format: (result) => result.text,
});
