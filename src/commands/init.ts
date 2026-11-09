import { existsSync } from "node:fs";
import { relative, resolve } from "node:path";
// Colours only on a terminal that shows them: none in a file, a pipe or with NO_COLOR.
import { styleText } from "node:util";
import { z } from "zod";
import { codexHooksPath, setUpHosts } from "../host-files/index.ts";
import { defineCommand } from "./registry.ts";

/** The player's folder set up for the AI hosts: the folder, and the files written there. */
interface FolderSetUp
{
    folder: string;
    written: string[];
    /** The folder as the player goes into it from where init ran, when it is not that one: chess. */
    enter?: string;
    /** Codex's hooks changed in a folder that had them: Codex runs them only once the player trusts them again. */
    hooksChanged?: true;
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
        const hooks = codexHooksPath(root);
        const hadHooks = existsSync(hooks);
        const written = setUpHosts(root, context.platform);
        const enter = relative(context.folder, root);
        return {
            folder: root,
            written: written.map((path) => relative(root, path)),
            ...(enter === "" ? {} : { enter }),
            ...(hadHooks && written.includes(hooks) ? { hooksChanged: true as const } : {}),
        };
    },
    format: ({ folder, written, enter, hooksChanged }, context) => {
        const words = wordsFor(context?.language);
        const steps = [words.open(enter === undefined ? undefined : quoted(enter)), ...words.steps];
        return [
            styleText(["bold", "green"], `♜ ${written.length === 0 ? words.ready(folder) : words.set(folder)}`),
            "",
            `  ${words.toPlay}`,
            ...steps.map((step, index) => `  ${styleText("cyan", `${index + 1}.`)} ${step.join("\n     ")}`),
            ...(hooksChanged === true ? ["", `  ${styleText("yellow", words.hooksChanged)}`] : []),
            ...(written.length === 0 ? [] : ["", styleText("gray", `  ${words.updated(written.length)}`)]),
        ].join("\n");
    },
});

/** What init says to the player, in their language (D-32): Italian or English. */
interface InitWords
{
    set: (folder: string) => string;
    ready: (folder: string) => string;
    toPlay: string;
    /** The first step: open the agent in this folder, or go into it first. */
    open: (enter: string | undefined) => string[];
    /** The other steps, each in lines short enough for a narrow terminal. */
    steps: string[][];
    hooksChanged: string;
    updated: (count: number) => string;
}

const english: InitWords = {
    set: (folder) => `Chesspal is ready in ${folder}`,
    ready: (folder) => `Chesspal is ready in ${folder}: nothing to change`,
    toPlay: "To play:",
    open: (enter) => enter === undefined ? ["Open Claude Code or Codex in this folder."] : [`Go into the folder: cd ${enter}`, "then open Claude Code (claude) or Codex (codex)."],
    steps: [
        ["The first time, it asks whether to trust the folder: say yes.", "Codex also asks about Chesspal's two hooks: choose Trust all.", "They are small helpers that let it notice your moves on the board."],
        ["Say hello: the AI gives you the link to the board."],
    ],
    hooksChanged: "Chesspal's hooks for Codex have changed: when Codex asks about them, choose Trust all again.",
    updated: (count) => `Updated ${count} ${count === 1 ? "file" : "files"}.`,
};

const italian: InitWords = {
    set: (folder) => `Chesspal è pronto in ${folder}`,
    ready: (folder) => `Chesspal è già pronto in ${folder}: niente da cambiare`,
    toPlay: "Per giocare:",
    open: (enter) => enter === undefined ? ["Apri Claude Code o Codex in questa cartella."] : [`Entra nella cartella: cd ${enter}`, "poi apri Claude Code (claude) o Codex (codex)."],
    steps: [
        ["La prima volta ti chiede se fidarti della cartella: rispondi sì.", "Codex chiede anche dei due «hook» di Chesspal: scegli Trust all.", "Sono piccoli aiuti che gli fanno vedere le tue mosse sulla scacchiera."],
        ["Saluta: l'AI ti dà il link della scacchiera."],
    ],
    hooksChanged: "Gli «hook» di Chesspal per Codex sono cambiati: quando Codex te lo chiede, scegli di nuovo Trust all.",
    updated: (count) => count === 1 ? "Aggiornato 1 file." : `Aggiornati ${count} file.`,
};

function wordsFor(language: string | undefined): InitWords
{
    return language?.slice(0, 2).toLowerCase() === "it" ? italian : english;
}

/** A path as a shell reads it as one word: in quotes when it has spaces. */
function quoted(path: string): string
{
    return /\s/.test(path) ? `"${path}"` : path;
}
