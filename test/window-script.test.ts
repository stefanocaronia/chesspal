// The script that places the table's window on Windows, run for real as the table runs it, with a browser of the test's own (test/window/fake-browser.cs,
// compiled here, RPG Engine's): small windows that take no focus and close by themselves within seconds. Never a real browser, never a window of the player's.
// Its windows show on the screen in use: run in CI, and on a desk only when asked (CHESSPAL_REAL_WINDOW=1).
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { placeCommand, readPlaced, type WindowPlace, windowTitles } from "../src/server/table/index.ts";
import { makeTempFolder, removeTempFolders } from "./hosts/temp.ts";

const windowsShown = process.platform === "win32" && (process.env.CI !== undefined || process.env.CHESSPAL_REAL_WINDOW === "1");
const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
const compiler = ["Framework64", "Framework"].map((folder) => join(systemRoot, "Microsoft.NET", folder, "v4.0.30319", "csc.exe")).find((path) => existsSync(path));
const address = "http://127.0.0.1:5750/";
let browser = "";

beforeAll(async () => {
    if (!windowsShown) {
        return;
    }

    const folder = join(makeTempFolder(), "Fake Browser");
    mkdirSync(folder);
    browser = join(folder, "fake-browser.exe");
    const compiled = await run(compiler ?? "csc.exe", ["/nologo", "/target:winexe", `/out:${browser}`, join(import.meta.dirname, "window", "fake-browser.cs")]);
    expect(existsSync(browser), compiled).toBe(true);
}, 60_000);

afterAll(removeTempFolders);

describe.runIf(windowsShown)("the window script on Windows, with a browser of the test's own", () => {
    it("compiles and runs, and says it opened a window it did not place where the browser shows none", async () => {
        expect(await place(["--life=300"], 1500)).toBe("opened");
    }, 60_000);

    it("places the window of a game, its title ending with Chesspal's name, and leaves where it is one with another title that the browser shows first", async () => {
        const log = join(makeTempFolder(), "log.txt");
        const title = "Stefano – Claude, 16. ♞f3 · Chesspal";
        const placed = await place([`--log=${log}`, `--title=${title}`, "--delay=1200", "--other=200:Downloads", "--life=5000"]);
        const windows = await windowsIn(log);

        expect(placed).toEqual(expect.objectContaining({ width: expect.any(Number) }));
        expect(windows[title]).toEqual(placed);
        expect(windows.Downloads).not.toEqual(placed);
    }, 60_000);

    it("knows the window by its address while its page loads, and not by an address of another port that begins the same", async () => {
        const log = join(makeTempFolder(), "log.txt");
        const placed = await place([`--log=${log}`, "--title=127.0.0.1:5750/", "--delay=1200", "--other=200:127.0.0.1:57501/", "--life=5000"]);
        const windows = await windowsIn(log);

        expect(windows["127.0.0.1:5750/"]).toEqual(placed);
        expect(windows["127.0.0.1:57501/"]).not.toEqual(placed);
    }, 60_000);
});

/**
 * The table's script run as the table runs it, the fake browser in place of the browser. Its turn is the whole computer's: a table opening a window holds it
 * while it waits for its browser, eight seconds at most; a wait of eight seconds, the table's, would fail the test then.
 */
async function place(args: string[], wait = 20_000): Promise<WindowPlace | "opened" | undefined>
{
    const command = placeCommand(browser, args, systemRoot, windowTitles(address));
    return readPlaced(await run(command.file, command.args, { ...command.env, CHESSPAL_WINDOW_WAIT: String(wait) }, command.input));
}

/** Where each window of the fake browser was at its end, by its title, as its log says once it closed. */
async function windowsIn(log: string): Promise<Record<string, WindowPlace>>
{
    const until = Date.now() + 20_000;

    while (!existsSync(log) && Date.now() < until) {
        await new Promise((done) => setTimeout(done, 100));
    }

    const windows: Record<string, WindowPlace> = {};

    for (const line of (existsSync(log) ? readFileSync(log, "utf8") : "").split("\n")) {
        const read = /^window (\d+)x(\d+) at (-?\d+),(-?\d+) (.*)$/.exec(line.trimEnd());

        if (read !== null) {
            windows[read[5] ?? ""] = { width: Number(read[1]), height: Number(read[2]), left: Number(read[3]), top: Number(read[4]) };
        }
    }

    return windows;
}

/** What a program printed, run hidden, with these variables added and this on its input. */
function run(file: string, args: string[], env: Record<string, string> = {}, input = ""): Promise<string>
{
    return new Promise((done) => {
        const running = execFile(file, args, { env: { ...process.env, ...env }, windowsHide: true, timeout: 60_000 }, (error, printed, stderr) => {
            done(`${String(printed)}${String(stderr)}${error === null ? "" : error.message}`);
        });
        running.stdin?.end(input);
    });
}
