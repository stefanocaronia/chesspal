import { z } from "zod";
import { boardText } from "../core/index.ts";
import { commentWithPlan } from "../games/index.ts";
import { moveLines, type MovePlayed } from "./game-summary.ts";
import { playMove } from "./play-move.ts";
import { defineCommand } from "./registry.ts";

/** The AI's move, with its plan, kept hidden (D-29), and its comment for the player (D-12, D-36): a short answer, since the player moves next. */
export const aiMove = defineCommand({
    name: "ai_move",
    description: "Plays your move, with your plan, hidden from the player, and your comment on it for them. It answers with the board, for your message when the player "
        + "plays in the chat. "
        + 'Example: ai_move {move: "d5", plan: "After exd5 Na5, chase the bishop on c4.", comment: "d5 shuts the bishop out of f7."}.',
    input: z.object({
        move: z.string().min(1).describe("your move, in SAN (Nf3, exd5, O-O, e8=Q) or as squares (g1f3, e7e8q)"),
        plan: sentence(200).describe("your plan, in one sentence: kept for you, hidden from the player"),
        comment: sentence(300).describe("your comment on the move, in one sentence, for the player"),
    }),
    alwaysLoad: true,
    positionals: ["move"],
    run: ({ move, plan, comment }, context): MovePlayed => playMove(context.folder, "ai", move, (message, legal) => `${message} Legal: ${legal.join(" ")}. Nothing changed.`, commentWithPlan(comment, plan)),
    format: (result) => {
        // The board goes before the next step, which stays the last line.
        const lines = moveLines(result);
        return [`Played ${result.move}.`, ...lines.slice(0, -1), "Board, for your message when the player plays in the chat:", boardText(result.game.fen), ...lines.slice(-1)].join("\n");
    },
});

/** One sentence of the AI's, kept in a PGN comment: no brackets or braces, which would break it. */
function sentence(most: number)
{
    return z.string().trim().min(1, "write one sentence").max(most, `write one sentence of ${most} characters at most`).regex(/^[^[\]{}]*$/, "write it without [ ] { }");
}
