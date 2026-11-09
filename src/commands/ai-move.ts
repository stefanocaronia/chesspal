import { z } from "zod";
import { boardText, drawingsText, moods, moodTag } from "../core/index.ts";
import { commentWithPlan, talkLimits } from "../games/index.ts";
import { coachAgent, hasAgent, ponderAgentFor } from "../host-files/index.ts";
import { gameFolder, helpsIn } from "../profiles/index.ts";
import { agentsLine, coachRuns, withAnalyst } from "./agents.ts";
import { closingLines, moveLines, shownMove } from "./answer-lines.ts";
import type { Context } from "./context.ts";
import { arrowsInput, drawingsOf, squaresInput } from "./drawings.ts";
import { type MovePlayed } from "./game-summary.ts";
import { playMove, refuseUnseenPosition } from "./play-move.ts";
import { defineCommand, sentence } from "./registry.ts";
import { give, waitingWords } from "./say.ts";

/** The AI's move, with its plan, kept hidden (D-29), and its comment for the player when it has something to say (D-12, D-54). */
export const aiMove = defineCommand({
    name: "ai_move",
    description: "Plays your move, with your plan, hidden from the player, and a comment for them only when there is something to say: a capture, a move of theirs "
        + "worth a word, words of theirs to answer; as a player at a tournament, never revealing your plans or threats unless the helps are on, and never the "
        + "player's best move. When no board page is open, it answers with the board for your message. "
        + 'Example: ai_move {move: "d5", plan: "After exd5 Na5, chase the bishop on c4.", comment: "An old favourite of mine."}.',
    input: z.object({
        move: z.string().min(1).describe("your move, in SAN (Nf3, exd5, O-O, e8=Q) or as squares (g1f3, e7e8q)"),
        plan: sentence(200).describe("your plan, in one sentence: kept for you, hidden from the player"),
        comment: sentence(talkLimits.aiHelps).optional().describe(
            `your words for the player, in one sentence of ${talkLimits.ai} characters at most, only when there is something to say: pieces and moves in words ("your `
                + `knight takes on f6"), a move you write with the pieces' figurines, as the tools show it (♞xf6+ for Nxf6+); your plans and threats only with the helps on, and then as long as a note of ${talkLimits.aiHelps} `
                + "characters, to teach; **two asterisks** put a word or two in bold on the page",
        ),
        arrows: arrowsInput.describe(
            "only with the helps on: arrows on the board after your move, to show what your comment says, never your move itself: Rf2e1; G green: a good idea; "
                + "R red: a threat or the mistake; Y yellow: another way; B blue: a plan",
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
    run: ({ move, plan, comment, offer_draw: offerDraw = false, mood, arrows, squares }, context): Played => {
        const folder = gameFolder(context.home());
        refuseUnseenPosition(context, folder);
        refuseWithoutHelps(folder, { comment, arrows, squares });
        const drawings = drawingsOf(arrows, squares);
        // The player's words are read before the move, which would count as the answer to them; a move refused leaves them for the next call.
        const waiting = waitingWords(context);
        const words = [commentWithPlan(comment, plan), drawingsText(drawings), mood === undefined ? "" : moodTag(mood)].filter((part) => part !== "").join(" ");
        const played = playMove(folder, context.now(), "ai", move, (message, legal) => `${message} Legal: ${legal.join(" ")}. Nothing changed.`, { comment: words, offerDraw });
        const agents = agentsAfter(context, folder, played);
        const board = context.pageOpen?.() === true ? {} : { board: true as const };
        return { ...played, game: withAnalyst(played.game, context), words: give(context, waiting), ...(agents.length === 0 ? {} : { agents }), ...board };
    },
    format: (result) => {
        // The mood the AI has just given is not told back: player_move and status tell it while it lasts (Priya).
        const game = { ...result.game };
        delete game.mood;
        // The board goes before the player's words and the next step, which stays the last line.
        return [
            `Played ${shownMove(result.move)}.`,
            ...moveLines({ ...result, game }),
            ...(result.board === true ? ["No board page is open: copy this board into your message.", boardText(result.game.fen)] : []),
            ...(result.agents === undefined ? [] : [agentsLine(result.agents)]),
            ...closingLines(result.game, result.words),
        ].join("\n");
    },
});

/** A comment as long as a note, and drawings, only with the helps on (D-78): the player who has them off plays as at a tournament. */
function refuseWithoutHelps(folder: string, { comment, arrows, squares }: { comment?: string; arrows?: string[]; squares?: string[]; }): void
{
    const asked = [
        arrows === undefined && squares === undefined ? "" : "without arrows and squares",
        comment === undefined || comment.length <= talkLimits.ai ? "" : `with the comment in ${talkLimits.ai} characters at most`,
    ].filter((part) => part !== "");

    if (asked.length > 0 && !helpsIn(folder)) {
        throw new Error(`The player has the helps off: play ${asked.join(", ")}. Nothing changed.`);
    }
}

/**
 * The AI's move, the agents to start on the player's time when the host runs them (D-72, D-88), and whether the player sees no board page, so the AI
 * copies the board (D-85).
 */
type Played = MovePlayed & { agents?: string[]; board?: true; };

/**
 * The agents to start after the move, in Claude Code, in a folder init set up with them: the one that thinks for the AI while the game goes on (D-72), then
 * the coach with the helps on, which judges the player's move even when the AI's ends the game (D-88).
 */
function agentsAfter(context: Context, folder: string, played: MovePlayed): string[]
{
    if (context.host?.() !== "claude-code") {
        return [];
    }

    const ponder = ponderAgentFor(played.game.level);
    const thinks = played.game.end === undefined && hasAgent(context.folder, ponder);
    const coaches = helpsIn(folder) && coachRuns(context);
    return [...(thinks ? [ponder] : []), ...(coaches ? [coachAgent] : [])];
}
