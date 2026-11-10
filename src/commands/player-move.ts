import { z } from "zod";
import { loadGame } from "../games/index.ts";
import { gameFolder } from "../profiles/index.ts";
import { coachOnEnd, coachOnEndLine, coachRuns, withAnalyst } from "./agents.ts";
import { closingLines, lastMoveText, moveLines, shownMove } from "./answer-lines.ts";
import { type MovePlayed } from "./game-summary.ts";
import { inviteLine, pageInvite } from "./page-link.ts";
import { playMove, positionIn, refuseUnseenPosition } from "./play-move.ts";
import { defineCommand } from "./registry.ts";
import { newWords } from "./say.ts";

/** The player's move, written in the chat and given by the AI: it answers with the position the AI decides on (D-34). */
export const playerMove = defineCommand({
    name: "player_move",
    description: "Plays the move the player wrote in the chat, and answers with the position for your reply: the FEN, your legal moves by piece and, from "
        + "the club level up, the pieces attacked with their defenders, the pins and the checks; look gives the rest. Give the move in SAN or as squares, and never choose for "
        + 'them: if their words fit two moves, or it is refused, ask them again. Example: player_move {move: "Nf3"}.',
    input: z.object({
        move: z.string().min(1).describe("the player's move, in SAN (Nf3, exd5, O-O, e8=Q) or as squares (g1f3, e7e8q)"),
        offer_draw: z.boolean().optional().describe("true when the player offers a draw with this move: it stands until your move"),
    }),
    alwaysLoad: true,
    showsGame: true,
    positionals: ["move"],
    run: ({ move, offer_draw: offerDraw = false }, context): PlayerMove => {
        const folder = gameFolder(context.home());

        // A chat that has seen no game yet, new or resumed, plays the player's own move: its answer shows the game the AI decides on (D-71).
        if (context.positionSeen !== null) {
            refuseUnseenPosition(context, folder);
        }

        const started = context.positionSeen === null ? positionIn(folder).started : context.positionSeen?.started;
        const played = playMove(folder, context.now(), "player", move, (message) => `${message} Ask the player again. Nothing changed.`, { allowance: chatAllowance, offerDraw, coached: coachRuns(context) });
        // A game over by this move has no more moves to play there: the next game's window gives the address (Federico, round of D-85).
        const invite = played.game.end === undefined ? pageInvite(context, started) : undefined;
        const ended = played.game.end === undefined ? undefined : loadGame(folder);
        const coach = ended !== undefined && coachOnEnd(context, folder, ended);
        return { ...played, game: withAnalyst(played.game, context), words: newWords(context), ...(invite === undefined ? {} : { invite }), ...(coach ? { coach } : {}) };
    },
    format: (result) =>
        [
            `Player: ${result.game.lastMove === undefined ? shownMove(result.move) : lastMoveText(result.game.lastMove)}.`,
            ...moveLines(result),
            ...(result.invite === undefined ? [] : [inviteLine(result.invite)]),
            ...(result.coach === true ? [coachOnEndLine] : []),
            ...closingLines(result.game, result.words),
        ].join("\n"),
});

/** The player's move, with the board page's address once a game while no browser has it open (D-85), and the coach to start when it ended the game (D-88). */
interface PlayerMove extends MovePlayed
{
    invite?: string;
    coach?: true;
}

/**
 * The time a move in the chat leaves off the player's clock (D-36): the AI writing after its move and reading the player's, about 10 s as Priya measured.
 * Claude Code's hooks will time it exactly; the board page's moves need none.
 */
const chatAllowance = 10_000;
