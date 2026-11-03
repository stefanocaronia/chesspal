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
    description: "Answers what the player wrote on the board page, without a move, while they are to move: when you are, answer in ai_move's comment. "
        + 'Example: ai_say {text: "Sure, I\'ll play faster."}.',
    input: z.object({
        text: z.string().trim().min(1, "write what you say").max(talkLimits.ai, `write ${talkLimits.ai} characters at most`).describe(
            "your answer to the player, one or two short sentences",
        ),
    }),
    run: ({ text }, context): Said => {
        // The player's words are read before the AI's line is saved: those written while it thought would fall before it, unread.
        const waiting = waitingWords(context);
        const current = say(context.folder, "ai", text, context.now());
        return { game: summaryOf(current), words: give(context, waiting) };
    },
    format: ({ game, words }) => ["Said on the board page, where the player reads it: don't write it again in the chat.", ...wordLines(words), afterWords(game, words)].join("\n"),
});

/** The next step once the AI has spoken: the end of a game over has been told already. */
function afterWords(game: GameSummary, words: readonly string[]): string
{
    return game.end !== undefined && words.length === 0 ? "Next: new_game starts another game when the player wants one." : nextStep(game, words);
}
