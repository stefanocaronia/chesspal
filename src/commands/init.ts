import { relative, resolve } from "node:path";
import { z } from "zod";
import { setUpHosts } from "../host-files/index.ts";
import { defineCommand } from "./registry.ts";

/** The player's folder set up for the AI hosts (T-7): the folder, and the files written there. */
interface FolderSetUp
{
    folder: string;
    written: string[];
}

/** Makes a folder the player's chess table: the files through which Claude Code and Codex find Chesspal and the opponent's instructions (D-31). */
export const init = defineCommand({
    name: "init",
    description: "Sets up a folder to play chess with an AI: the .mcp.json, AGENTS.md, CLAUDE.md and the settings through which Claude Code and Codex find "
        + "Chesspal. Run it again to update Chesspal's lines; what you wrote there stays. Example: chesspal init chess.",
    input: z.object({ folder: z.string().optional().describe("the folder to set up; the current folder if left out") }),
    cliOnly: true,
    idempotent: true,
    positionals: ["folder"],
    run: ({ folder }, context): FolderSetUp => {
        const root = resolve(context.folder, folder ?? ".");
        return { folder: root, written: setUpHosts(root, context.platform).map((path) => relative(root, path)) };
    },
    format: ({ folder, written }) =>
        [
            written.length === 0 ? `${folder} is set up already: nothing to change.` : `Set up ${folder}: ${written.join(", ")}.`,
            "To play, open Claude Code or Codex in this folder and say hello; the first time, they ask whether to trust the folder: say yes, or Chesspal cannot start.",
            "Chesspal must stay installed: npm install -g chesspal.",
        ].join("\n"),
});
