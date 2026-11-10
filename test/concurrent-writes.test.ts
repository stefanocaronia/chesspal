import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { newGame } from "../src/commands/index.ts";
import { GameChanged, loadGame, rerunIfChanged, saveGame } from "../src/games/index.ts";
import { gameFolder } from "../src/profiles/index.ts";
import { testContext } from "./commands.ts";

const folders: string[] = [];

afterEach(() => {
    folders.splice(0).forEach((folder) => rmSync(folder, { recursive: true, force: true }));
});

describe("two processes writing the same game", () => {
    it("loses no save: one made on a game another process changed since is refused, and made again on the game read anew", async () => {
        const folder = await gameOnDisk();
        const lines = 150;
        const refused = await Promise.all(["white", "black"].map((name) => writer(folder, name, lines)));
        const talk = loadGame(folder)!.talk.map((line) => line.text);

        expect(talk).toHaveLength(2 * lines);
        expect(new Set(talk).size).toBe(2 * lines);
        // A save was refused at least once, or the two never wrote together and the test proves nothing.
        expect(refused[0]! + refused[1]!).toBeGreaterThan(0);
    });

    it("refuses a save on a game changed since it was read, and reads it again for the rerun, once", async () => {
        const folder = await gameOnDisk();
        let runs = 0;

        const said = (text: string) => {
            const current = loadGame(folder)!;
            return () => saveGame(folder, { ...current, talk: [...current.talk, { who: "player", text, ply: 0, at: new Date().toISOString() }] });
        };

        const stale = said("stale");
        await writer(folder, "other", 1);

        expect(stale).toThrow(GameChanged);
        rerunIfChanged(() => {
            runs++;
            said("again")();
        });
        expect(runs).toBe(1);
        expect(loadGame(folder)!.talk.map((line) => line.text)).toEqual(["other 0", "again"]);
    });
});

async function gameOnDisk(): Promise<string>
{
    const folder = mkdtempSync(join(tmpdir(), "chesspal-writes-"));
    folders.push(folder);
    const context = testContext(folder);
    await newGame.run(newGame.input.parse({ ai_colour: "black" }), context);
    return gameFolder(context.home());
}

/** Runs a writer in a process of its own: how many of its saves were refused before they were made. */
function writer(folder: string, name: string, lines: number): Promise<number>
{
    const script = join(import.meta.dirname, "concurrent", "talk-writer.ts");
    const child = spawn(process.execPath, ["--experimental-strip-types", "--no-warnings", script, folder, name, String(lines)], { stdio: ["ignore", "pipe", "inherit"] });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => output += chunk.toString());
    return new Promise((done, failed) => {
        child.on("error", failed);
        child.on("close", (code) => code === 0 ? done(Number(output.trim())) : failed(new Error(`The writer ${name} ended with ${code}.`)));
    });
}
