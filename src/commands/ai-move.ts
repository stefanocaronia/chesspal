import { z } from "zod";
import { boardText } from "../core/index.ts";
import { commentWithPlan, talkLimits } from "../games/index.ts";
import { closingLines, moveLines, type MovePlayed } from "./game-summary.ts";
import { playMove } from "./play-move.ts";
import { defineCommand } from "./registry.ts";
import { give, waitingWords } from "./say.ts";

/** The AI's move, with its plan, kept hidden (D-29), and its comment for the player when it has something to say (D-12, D-54). */
export const aiMove = defineCommand({
    name: "ai_move",
    description: "Plays your move, with your plan, hidden from the player, and a comment for them only when there is something to say: a threat, a capture, a "
        + "change of plan, a move of theirs worth a word, words of theirs to answer. It answers with the board, for your message when the player plays in the chat. "
        + 'Example: ai_move {move: "d5", plan: "After exd5 Na5, chase the bishop on c4.", comment: "d5 shuts the bishop out of f7."}.',
    input: z.object({
        move: z.string().min(1).describe("your move, in SAN (Nf3, exd5, O-O, e8=Q) or as squares (g1f3, e7e8q)"),
        plan: sentence(200).describe("your plan, in one sentence: kept for you, hidden from the player"),
        comment: sentence(talkLimits.ai).optional().describe("your words for the player, in one sentence, only when there is something to say"),
    }),
    alwaysLoad: true,
    positionals: ["move"],
    run: ({ move, plan, comment }, context): MovePlayed => {
        // The player's words are read before the move, which would count as the answer to them; a move refused leaves them for the next call.
        const waiting = waitingWords(context);
        const played = playMove(context.folder, "ai", move, (message, legal) => `${message} Legal: ${legal.join(" ")}. Nothing changed.`, { comment: commentWithPlan(comment, plan) });
        return { ...played, words: give(context, waiting) };
    },
    format: (result) => {
        // The board goes before the player's words and the next step, which stays the last line.
        return [`Played ${result.move}.`, ...moveLines(result), "Board, for your message when the player plays in the chat:", boardText(result.game.fen), ...closingLines(result.game, result.words)]
            .join("\n");
    },
});

/** One sentence of the AI's, kept in a PGN comment: no brackets or braces, which would break it. */
function sentence(most: number)
{
    return z.string().trim().min(1, "write one sentence").max(most, `write one sentence of ${most} characters at most`).regex(/^[^[\]{}]*$/, "write it without [ ] { }");
}
