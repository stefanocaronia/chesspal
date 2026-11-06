import { z } from "zod";
import { type Badge, badges, boardText, drawingsText, moods, moodTag } from "../core/index.ts";
import { commentWithPlan, talkLimits } from "../games/index.ts";
import { hasPonderAgent, ponderAgentFor } from "../host-files/index.ts";
import { gameFolder, helpsIn } from "../profiles/index.ts";
import type { Context } from "./context.ts";
import { arrowsInput, drawingsOf, noteInput, squaresInput } from "./drawings.ts";
import { closingLines, moveLines, type MovePlayed } from "./game-summary.ts";
import { playMove, refuseUnseenPosition } from "./play-move.ts";
import { defineCommand, sentence } from "./registry.ts";
import { give, waitingWords } from "./say.ts";

// The badges the opponent gives: the book's is Chesspal's, never its own judgment (D-69).
const judgments = badges.filter((badge) => badge !== "book") as [Exclude<Badge, "book">, ...Exclude<Badge, "book">[]];

/** The AI's move, with its plan, kept hidden (D-29), and its comment for the player when it has something to say (D-12, D-54). */
export const aiMove = defineCommand({
    name: "ai_move",
    description: "Plays your move, with your plan, hidden from the player, and a comment for them only when there is something to say: a capture, a move of theirs "
        + "worth a word, words of theirs to answer; as a player at a tournament, never revealing your plans or threats unless the helps are on, and never the "
        + "player's best move. It answers with the board, for your message "
        + 'when the player plays in the chat. Example: ai_move {move: "d5", plan: "After exd5 Na5, chase the bishop on c4.", comment: "An old favourite of mine."}.',
    input: z.object({
        move: z.string().min(1).describe("your move, in SAN (Nf3, exd5, O-O, e8=Q) or as squares (g1f3, e7e8q)"),
        plan: sentence(200).describe("your plan, in one sentence: kept for you, hidden from the player"),
        comment: sentence(talkLimits.aiHelps).optional().describe(
            `your words for the player, in one sentence of ${talkLimits.ai} characters at most, only when there is something to say: pieces and moves in words ("your `
                + `knight takes on f6"), never in notation (Nxf6+); your plans and threats only with the helps on, and then as long as a note of ${talkLimits.aiHelps} `
                + "characters, to teach; **two asterisks** put a word or two in bold on the page",
        ),
        badge: z.enum(judgments).optional().describe(
            "only with the helps on: your badge on the player's last move, as chess.com names them, only on a move that stands out (a mistake, a miss, a fine find), "
                + "never on a routine one",
        ),
        note: noteInput.optional().describe("only with the helps on: why, on the player's last move, in a sentence or two"),
        arrows: arrowsInput.describe(
            "only with the helps on: arrows on the board after your move, to show what your comment says, never your move itself: Rf2e1; G green: the better move or "
                + "the good idea; R red: a threat or the mistake; Y yellow: another way; B blue: a plan",
        ),
        squares: squaresInput.describe("only with the helps on: squares to mark after your move, as PGN's %csl writes them: Rf2; colours as for arrows"),
        offer_draw: z.boolean().optional().describe("true offers the player a draw with this move: it stands until their move"),
        mood: z.enum(moods).optional().describe(
            "how you feel, on a move where the game turns for you: your face on the board page shows it for three of your moves, this one included (a surprise for this one "
                + "only), then turns neutral by itself",
        ),
    }),
    alwaysLoad: true,
    showsGame: true,
    positionals: ["move"],
    run: ({ move, plan, comment, offer_draw: offerDraw = false, mood, badge, note, arrows, squares }, context): Played => {
        const folder = gameFolder(context.home());
        refuseUnseenPosition(context, folder);
        refuseWithoutHelps(folder, { comment, badge, note, arrows, squares });
        const drawings = drawingsOf(arrows, squares);
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

/** A comment as long as a note, a badge, a note and drawings, only with the helps on (D-78): the player who has them off plays as at a tournament. */
function refuseWithoutHelps(folder: string, { comment, badge, note, arrows, squares }: { comment?: string; badge?: string; note?: string; arrows?: string[]; squares?: string[]; }): void
{
    const asked = [
        badge === undefined && note === undefined ? "" : "without badge and note",
        arrows === undefined && squares === undefined ? "" : "without arrows and squares",
        comment === undefined || comment.length <= talkLimits.ai ? "" : `with the comment in ${talkLimits.ai} characters at most`,
    ].filter((part) => part !== "");

    if (asked.length > 0 && !helpsIn(folder)) {
        throw new Error(`The player has the helps off: play ${asked.join(", ")}. Nothing changed.`);
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
