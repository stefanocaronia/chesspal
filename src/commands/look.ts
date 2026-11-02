import { z } from "zod";
import { boardText, type Facts } from "../core/index.ts";
import { loadGame } from "../games/index.ts";
import { type GameSummary, headLines, summaryOf } from "./game-summary.ts";
import { defineCommand } from "./registry.ts";
import { fullView } from "./view.ts";

/** The whole view of the position, or only the board as text for the player. */
type Look = { board: string; } | { game: Viewed; };

/** The game with the facts of its position, whoever is to move. */
type Viewed = GameSummary & { facts: Facts; };

/** The whole view (D-26), when the compact one after the player's move is not enough; or the board for the player, where the host does not show it (D-36). */
export const look = defineCommand({
    name: "look",
    description: "Shows the whole view of the position: the FEN and, for every piece, what attacks and defends it, then the pins, the checks and the legal "
        + "moves of each piece. The views of player_move, status and new_game give attackers and defenders only for the pieces attacked: call look "
        + 'before you attack or capture a piece that is not attacked yet, or plan an exchange. With only: "board", the board as text for the player, to '
        + "copy into your message where they do not see it. Example: look {}.",
    input: z.object({ only: z.enum(["board"]).optional().describe("board: only the board as text, for the player") }),
    readOnly: true,
    idempotent: true,
    run: ({ only }, context): Look => {
        const current = loadGame(context.folder);

        if (current === undefined) {
            throw new Error("There is no game to look at: start one with new_game.");
        }

        return only === "board" ? { board: boardText(current.game.position.fen) } : { game: { ...summaryOf(current), facts: current.game.facts } };
    },
    format: (look) => ("board" in look ? look.board : [...headLines(look.game), ...fullView(look.game.facts, look.game.turn)].join("\n")),
});
