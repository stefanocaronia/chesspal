import { z } from "zod";
import { playerPgn } from "../games/index.ts";
import { gameFolder } from "../profiles/index.ts";
import { gameAt } from "./clock.ts";
import { defineCommand } from "./registry.ts";

interface Exported
{
    format: "pgn" | "fen";
    text: string;
}

/** The game as PGN or its position as FEN, for the player to copy or keep: the plans stay hidden while it goes on (D-29). */
export const exportGame = defineCommand({
    name: "export",
    description: "Gives the game as PGN, or its position as FEN, for the player to copy or keep. While the game goes on, the PGN leaves out your plans. "
        + 'Example: export {format: "pgn"}.',
    input: z.object({ format: z.enum(["pgn", "fen"]).describe("pgn for the whole game, fen for the position") }),
    // Read only for the host: a flag that has fallen is written, as the time already decided.
    readOnly: true,
    positionals: ["format"],
    run: ({ format }, context): Exported => {
        const current = gameAt(gameFolder(context.home()), context.now());

        if (current === undefined) {
            throw new Error("There is no game to export: start one with new_game.");
        }

        return { format, text: format === "fen" ? current.game.position.fen : playerPgn(current) };
    },
    format: (result) => result.text,
});
