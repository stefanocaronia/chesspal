import { z } from "zod";
import { talkLimits } from "../games/index.ts";
import { type GameSummary, nextStep, summaryOf, wordLines } from "./game-summary.ts";
import { defineCommand } from "./registry.ts";
import { give, say, waitingWords } from "./say.ts";

interface Said
{
    game: GameSummary;
    words: string[];
}

/** The AI's words on the board page without a move (T-65): its answer to what the player wrote there, read only there, on the player's time (D-54). */
export const aiSay = defineCommand({
    name: "ai_say",
    description: "Answers what the player wrote on the board page, or their draw offer, without a move, while they are to move: when you are, answer in "
        + "ai_move's comment. Once the game is over, it also says a word once with nothing to answer. Example: ai_say {text: \"Sure, I'll play faster.\"}.",
    input: z.object({
        text: z.string().trim().min(1, "write what you say").max(talkLimits.ai, `write ${talkLimits.ai} characters at most`).describe(
            'your answer to the player, one or two short sentences: pieces and moves in words ("your knight takes on f6"), never in notation (Nxf6+); never your '
                + "plans or threats",
        ),
    }),
    run: ({ text }, context): Said => {
        // The player's words are read before the AI's line is saved: those written while it thought would fall before it, unread.
        const waiting = waitingWords(context);
        const current = say(context.folder, "ai", text, context.now());
        return { game: summaryOf(current, context.now()), words: give(context, waiting) };
    },
    format: ({ game, words }) => ["Said on the board page, where the player reads it: don't write it again in the chat.", ...wordLines(words), afterWords(game, words)].join("\n"),
});

/** The next step once the AI has spoken: the end of a game over has been told already, and the player's draw offer answered in words. */
function afterWords(game: GameSummary, words: readonly string[]): string
{
    if (words.length === 0 && game.end !== undefined) {
        return "Next: new_game starts another game when the player wants one.";
    }

    if (words.length === 0 && game.drawOffer === "player" && game.turn !== game.ai) {
        return "Next: accept the draw with end_game draw_agreed, or wait for the player's move.";
    }

    return nextStep(game, words);
}
