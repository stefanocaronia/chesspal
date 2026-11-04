import { z } from "zod";
import { closingLines, lastMoveText, moveLines, type MovePlayed } from "./game-summary.ts";
import { playMove } from "./play-move.ts";
import { defineCommand } from "./registry.ts";
import { newWords } from "./say.ts";

/** The player's move, written in the chat and given by the AI: it answers with the position the AI decides on (D-34). */
export const playerMove = defineCommand({
    name: "player_move",
    description: "Plays the move the player wrote in the chat, and answers with the position for your reply: the FEN, the pieces attacked with their "
        + "defenders, the pins, the checks and your legal moves by piece; look gives the rest. Give the move in SAN or as squares, and never choose for "
        + 'them: if their words fit two moves, or it is refused, ask them again. Example: player_move {move: "Nf3"}.',
    input: z.object({
        move: z.string().min(1).describe("the player's move, in SAN (Nf3, exd5, O-O, e8=Q) or as squares (g1f3, e7e8q)"),
        offer_draw: z.boolean().optional().describe("true when the player offers a draw with this move: it stands until your move"),
    }),
    alwaysLoad: true,
    positionals: ["move"],
    run: ({ move, offer_draw: offerDraw = false }, context): MovePlayed => ({
        ...playMove(context.folder, context.now(), "player", move, (message) => `${message} Ask the player for another move. Nothing changed.`, { allowance: chatAllowance, offerDraw }),
        words: newWords(context),
    }),
    format: (result) => [`Player: ${result.game.lastMove === undefined ? result.move : lastMoveText(result.game.lastMove)}.`, ...moveLines(result), ...closingLines(result.game, result.words)].join("\n"),
});

/**
 * The time a move in the chat leaves off the player's clock (D-36): the AI writing after its move and reading the player's, about 10 s as Priya measured.
 * Claude Code's hooks will time it exactly (T-53); the board page's moves need none.
 */
export const chatAllowance = 10_000;
