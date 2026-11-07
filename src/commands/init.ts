import { relative, resolve } from "node:path";
// Colours only on a terminal that shows them: none in a file, a pipe or with NO_COLOR.
import { styleText } from "node:util";
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
    format: ({ folder, written }, context) => {
        const words = wordsFor(context?.language);
        return [
            styleText(["bold", "green"], `♜ ${written.length === 0 ? words.ready(folder) : words.set(folder)}`),
            "",
            `  ${words.toPlay}`,
            ...words.steps.map((step, index) => `  ${styleText("cyan", `${index + 1}.`)} ${step.join("\n     ")}`),
            ...(written.length === 0 ? [] : ["", styleText("gray", `  ${words.written} ${written.join(", ")}`)]),
        ].join("\n");
    },
});

/** What init says to the player, in their language (D-32): Italian or English. */
interface InitWords
{
    set: (folder: string) => string;
    ready: (folder: string) => string;
    toPlay: string;
    /** Each step in lines short enough for a narrow terminal. */
    steps: string[][];
    written: string;
}

const english: InitWords = {
    set: (folder) => `Chesspal is ready in ${folder}`,
    ready: (folder) => `Chesspal is ready in ${folder}: nothing to change`,
    toPlay: "To play:",
    steps: [
        ["Open Claude Code or Codex in this folder."],
        ["The first time, it asks whether to trust the folder: say yes.", "In Codex, also type /hooks and allow Chesspal's two hooks:", "small helpers that let it notice your moves on the board."],
        ["Say hello: the AI gives you the link to the board."],
    ],
    written: "Updated:",
};

const italian: InitWords = {
    set: (folder) => `Chesspal è pronto in ${folder}`,
    ready: (folder) => `Chesspal è già pronto in ${folder}: niente da cambiare`,
    toPlay: "Per giocare:",
    steps: [
        ["Apri Claude Code o Codex in questa cartella."],
        ["La prima volta ti chiede se fidarti della cartella: rispondi sì.", "In Codex scrivi anche /hooks e consenti i due «hook» di Chesspal:", "piccoli aiuti che gli fanno vedere le tue mosse sulla scacchiera."],
        ["Saluta: l'AI ti dà il link della scacchiera."],
    ],
    written: "Aggiornati:",
};

function wordsFor(language: string | undefined): InitWords
{
    return language?.slice(0, 2).toLowerCase() === "it" ? italian : english;
}
