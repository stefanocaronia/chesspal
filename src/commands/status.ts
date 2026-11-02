import { z } from "zod";
import { version } from "../version.ts";
import { defineCommand } from "./registry.ts";

interface Status
{
    version: string;
    folder: string;
}

/** What Chesspal sees now: the first call of a chat. The game in progress joins it with the chess commands (T-6). */
export const status = defineCommand({
    name: "status",
    description: "Shows what Chesspal sees now: its version and the player's folder. Call it at the start of every chat, before anything else.",
    input: z.object({}),
    readOnly: true,
    alwaysLoad: true,
    run: (_input, context): Status => ({ version, folder: context.folder }),
    format: (result) => [`Chesspal ${result.version}`, `Folder: ${result.folder}`].join("\n"),
});
