import { z } from "zod";
import { gameFolder, notationIn } from "../profiles/index.ts";
import { closingLines, lastMoveText, moveLines, type MovePlayed, withWritten } from "./game-summary.ts";
import { inviteLine, pageInvite } from "./page-link.ts";
import { playMove, refuseUnseenPosition } from "./play-move.ts";
import { defineCommand } from "./registry.ts";
import { newWords } from "./say.ts";

/** The player's move, written in the chat and given by the AI: it answers with the position the AI decides on (D-34). */
export const playerMove = defineCommand({
    name: "player_move",
    description: "Plays the move the player wrote in the chat, and answers with the position for your reply: the FEN, your legal moves by piece and, from "
        + "the club level up, the pieces attacked with their defenders, the pins and the checks; look gives the rest. Give the move as they wrote it, in the letters of "
        + 'their language too (Te1 in Italian), or as squares, and never choose for them: if their words fit two moves, or it is refused, ask them again. Example: player_move {move: "Nf3"}.',
    input: z.object({
        move: z.string().min(1).describe("the player's move as they wrote it, in SAN (Nf3, exd5, O-O, e8=Q) or their language's letters (Cf3), or as squares (g1f3, e7e8q)"),
        offer_draw: z.boolean().optional().describe("true when the player offers a draw with this move: it stands until your move"),
    }),
    alwaysLoad: true,
    showsGame: true,
    positionals: ["move"],
    run: ({ move, offer_draw: offerDraw = false }, context): PlayerMove => {
        const folder = gameFolder(context.home());
        refuseUnseenPosition(context, folder);
        const notation = notationIn(folder, context.language);
        const played = playMove(folder, context.now(), "player", move, (message) => `${message} Ask the player for another move. Nothing changed.`, {
            allowance: chatAllowance,
            offerDraw,
            notation,
        });
        // A game over by this move has no more moves to play there: the next game's window gives the address (Federico, round of D-85).
        const invite = played.game.end === undefined ? pageInvite(context, context.positionSeen?.started) : undefined;
        return { ...withWritten({ ...played, words: newWords(context) }, notation), ...(invite === undefined ? {} : { invite }) };
    },
    format: (result) =>
        [
            `Player: ${result.game.lastMove === undefined ? result.move : lastMoveText(result.game.lastMove, result.written)}.`,
            ...moveLines(result),
            ...(result.invite === undefined ? [] : [inviteLine(result.invite)]),
            ...closingLines(result.game, result.words),
        ].join("\n"),
});

/** The player's move, with the board page's address once a game while no browser has it open (D-85). */
interface PlayerMove extends MovePlayed
{
    invite?: string;
}

/**
 * The time a move in the chat leaves off the player's clock (D-36): the AI writing after its move and reading the player's, about 10 s as Priya measured.
 * Claude Code's hooks will time it exactly (T-53); the board page's moves need none.
 */
export const chatAllowance = 10_000;
