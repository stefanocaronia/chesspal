import { z } from "zod";
import { moods } from "../core/index.ts";
import { talkLimits } from "../games/index.ts";
import { gameFolder } from "../profiles/index.ts";
import { type GameSummary, newGameStep, nextStep, summaryOf, wordLines } from "./game-summary.ts";
import { refuseOtherGame } from "./play-move.ts";
import { defineCommand } from "./registry.ts";
import { give, say, waitingWords } from "./say.ts";

interface Said
{
    /** The game, none when the AI spoke before the first (D-77). */
    game?: GameSummary;
    words: string[];
}

/** The AI's words on the board page without a move (T-65), read only there, on the player's time: an answer, or a word it has to say (D-54, D-72). */
export const aiSay = defineCommand({
    name: "ai_say",
    description: "Says a word on the board page without a move, once while the player is to move: an answer to what they wrote or to their draw offer, or "
        + "something you have to say; when you are to move, speak in ai_move's comment. Between games, and before the first, it speaks freely: about the game just over, or to start another. "
        + 'Example: ai_say {text: "Sure, I\'ll play faster."}.',
    input: z.object({
        text: z.string().trim().min(1, "write what you say").max(talkLimits.aiHelps, `write ${talkLimits.aiHelps} characters at most`).describe(
            `your words for the player, one or two short sentences, ${talkLimits.ai} characters at most (${talkLimits.aiHelps} with the helps on): pieces and moves in `
                + `words ("your knight takes on f6"), a move you write in the player's notation (in Italian Cxf6+ for Nxf6+); your plans and threats only with the helps on; **two asterisks** put a word or two in bold on the page`,
        ),
        mood: z.enum(moods).optional().describe("only after the game has ended: the face the board page keeps for its end"),
    }),
    run: ({ text, mood }, context): Said => {
        // The player's words are read before the AI's line is saved: those written while it thought would fall before it, unread.
        const folder = gameFolder(context.home());
        refuseOtherGame(context, folder);
        const waiting = waitingWords(context);
        const current = say(folder, "ai", text, context.now(), mood);
        const words = give(context, waiting);
        return "game" in current ? { game: summaryOf(current, context.now()), words } : { words };
    },
    format: ({ game, words }) => ["Said on the board page, where the player reads it: don't write it again in the chat.", ...wordLines(words), afterWords(game, words)].join("\n"),
});

/** The next step once the AI has spoken: the end of a game over has been told already, and the player's draw offer answered in words. */
function afterWords(game: GameSummary | undefined, words: readonly string[]): string
{
    if (words.length === 0 && game?.end !== undefined) {
        return `Next: when the player wants another game, ${newGameStep}`;
    }

    if (words.length === 0 && game?.drawOffer === "player" && game.turn !== game.ai) {
        return "Next: accept the draw with end_game draw_agreed, or wait for the player's move.";
    }

    return nextStep(game, words);
}
