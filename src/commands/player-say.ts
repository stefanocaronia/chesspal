import { z } from "zod";
import { talkLimits } from "../games/index.ts";
import { gameFolder } from "../profiles/index.ts";
import { defineCommand } from "./registry.ts";
import { say } from "./say.ts";

/** The player's words to the AI, as the board page sends them (T-65): on the command line only, since the AI never writes for the player. */
export const playerSay = defineCommand({
    name: "player_say",
    description: "Writes the player's words to the AI, as the board page does: the AI reads them at its next call. "
        + 'Example: chesspal player_say "Play faster, please."',
    input: z.object({ text: z.string().trim().min(1, "write what you say").max(talkLimits.player, `write ${talkLimits.player} characters at most`).describe("what the player says to the AI") }),
    cliOnly: true,
    positionals: ["text"],
    run: ({ text }, context): string => say(gameFolder(context.home()), "player", text, context.now()).talk.at(-1)!.text,
    format: (text) => `Written for the AI: «${text}». It reads it at its next call.`,
});
