import { z } from "zod";
import { badges, boardText, drawingsText, moods, moodTag } from "../core/index.ts";
import { commentWithPlan, talkLimits } from "../games/index.ts";
import { hasPonderAgent, ponderAgentFor } from "../host-files/index.ts";
import { gameFolder, helpsIn } from "../profiles/index.ts";
import type { Context } from "./context.ts";
import { arrowsInput, drawingsOf, noteLimit, squaresInput } from "./drawings.ts";
import { closingLines, moveLines, type MovePlayed } from "./game-summary.ts";
import { playMove } from "./play-move.ts";
import { defineCommand, sentence } from "./registry.ts";
import { give, waitingWords } from "./say.ts";

/** The AI's move, with its plan, kept hidden (D-29), and its comment for the player when it has something to say (D-12, D-54). */
export const aiMove = defineCommand({
    name: "ai_move",
    description: "Plays your move, with your plan, hidden from the player, and a comment for them only when there is something to say: a capture, a move of theirs "
        + "worth a word, words of theirs to answer; as a player at a tournament, never revealing your plans or threats. It answers with the board, for your message "
        + 'when the player plays in the chat. Example: ai_move {move: "d5", plan: "After exd5 Na5, chase the bishop on c4.", comment: "An old favourite of mine."}.',
    input: z.object({
        move: z.string().min(1).describe("your move, in SAN (Nf3, exd5, O-O, e8=Q) or as squares (g1f3, e7e8q)"),
        plan: sentence(200).describe("your plan, in one sentence: kept for you, hidden from the player"),
        comment: sentence(talkLimits.aiHelps).optional().describe(
            `your words for the player, in one sentence of ${talkLimits.ai} characters at most, only when there is something to say: pieces and moves in words ("your `
                + `knight takes on f6"), never in notation (Nxf6+); never your plans or threats; with the helps on, as long as a note of ${talkLimits.aiHelps} characters, `
                + "and they may teach; **two asterisks** put a word or two in bold on the page",
        ),
        badge: z.enum(badges).optional().describe("your badge on the player's last move, as chess.com gives it, only on a move worth it: kept in the game"),
        note: z.string().trim().min(1).max(noteLimit).regex(/^[^[\]{}]*$/, "write it without [ ] { }").optional().describe("why, on the player's last move, in a sentence or two"),
        arrows: arrowsInput.describe("only with the helps on: arrows on the board with your move, as PGN's %cal writes them: Rf2e1; G green, R red, Y yellow, B blue"),
        squares: squaresInput.describe("only with the helps on: squares to mark with your move, as PGN's %csl writes them: Rf2"),
        offer_draw: z.boolean().optional().describe("true offers the player a draw with this move: it stands until their move"),
        mood: z.enum(moods).optional().describe(
            "how you feel, on a move where the game turns for you: your face on the board page shows it for three of your moves, this one included (a surprise for this one "
                + "only), then turns neutral by itself",
        ),
    }),
    alwaysLoad: true,
    positionals: ["move"],
    run: ({ move, plan, comment, offer_draw: offerDraw = false, mood, badge, note, arrows, squares }, context): Played => {
        const folder = gameFolder(context.folder);
        const drawings = drawingsOf(arrows, squares);
        refuseWithoutHelps(folder, comment, drawings);
        // The player's words are read before the move, which would count as the answer to them; a move refused leaves them for the next call.
        const waiting = waitingWords(context);
        const words = [commentWithPlan(comment, plan), drawingsText(drawings), mood === undefined ? "" : moodTag(mood)].filter((part) => part !== "").join(" ");
        const played = playMove(folder, context.now(), "ai", move, (message, legal) => `${message} Legal: ${legal.join(" ")}. Nothing changed.`, {
            comment: words,
            offerDraw,
            ...(badge === undefined && note === undefined ? {} : { judged: { ...(badge === undefined ? {} : { badge }), ...(note === undefined ? {} : { note }) } }),
        });
        const agent = ponderAgent(context, played);
        return { ...played, words: give(context, waiting), ...(agent === undefined ? {} : { ponder: agent }) };
    },
    format: (result) => {
        // The mood the AI has just given is not told back: player_move and status tell it while it lasts (Priya, round of T-107).
        const game = { ...result.game };
        delete game.mood;
        // The board goes before the player's words and the next step, which stays the last line.
        return [
            `Played ${result.move}.`,
            ...moveLines({ ...result, game }),
            "Board, for your message when the player plays in the chat:",
            boardText(result.game.fen),
            ...(result.ponder === undefined ? [] : [ponderLine(result.ponder)]),
            ...closingLines(result.game, result.words),
        ].join("\n");
    },
});

/** A comment as long as a note, and drawings, only with the helps on (D-78): the player who has them off plays as at a tournament. */
function refuseWithoutHelps(folder: string, comment: string | undefined, drawings: object): void
{
    if (helpsIn(folder)) {
        return;
    }

    if (Object.keys(drawings).length > 0) {
        throw new Error("The player has the helps off: play without arrows and squares. Nothing changed.");
    }

    if (comment !== undefined && comment.length > talkLimits.ai) {
        throw new Error(`The player has the helps off: write the comment in ${talkLimits.ai} characters at most. Nothing changed.`);
    }
}

/** The AI's move, and the agent that thinks on the player's time when the host runs one (D-72). */
type Played = MovePlayed & { ponder?: string; };

/** The agent to start after the move: in Claude Code, in a folder init set up with it, while the game goes on (D-72). */
function ponderAgent(context: Context, played: MovePlayed): string | undefined
{
    if (context.host?.() !== "claude-code" || played.game.end !== undefined) {
        return undefined;
    }

    const agent = ponderAgentFor(played.game.level);
    return hasPonderAgent(context.folder, agent) ? agent : undefined;
}

/** How to start the agent, and that the player sees nothing of it: its end needs no answer either. */
function ponderLine(agent: string): string
{
    return `Think on the player's time: start the ${agent} agent in the background with the prompt "Ponder."; write nothing about it in the chat, now or when it ends.`;
}
