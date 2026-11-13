import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCommandLine } from "../src/cli/command-line.ts";
import { commands, type Context } from "../src/commands/index.ts";
import { startAnalysis } from "../src/games/index.ts";
import { tableFolder } from "../src/home/index.ts";
import { settingsFrom } from "../src/page/profile/settings.ts";
import { activeProfile, gameFolder, saveProfileSettings } from "../src/profiles/index.ts";
import type { TableChats } from "../src/server/page/table.ts";
import { playCommand } from "../src/server/table/hosts/chats.ts";
import { hostArgs, startMessage } from "../src/server/table/hosts/hosts.ts";
import { setUpTable } from "../src/server/table/hosts/index.ts";
import { type HostLaunch, playHost, runHost } from "../src/server/table/hosts/play.ts";
import { askAgain, askedAgain, leaveSeat, refreshSeat, seatTaken, seatTimes, takeSeat } from "../src/server/table/hosts/seat.ts";
import { terminals } from "../src/server/table/hosts/terminal.ts";
import { hostLaunch, startTable, type Table, terminalChats } from "../src/server/table/index.ts";
import { testContext } from "./commands.ts";
import { removeFolder } from "./folders.ts";
import { sent } from "./http.ts";
import { onFreePorts } from "./ports.ts";

const folders: string[] = [];
// The note the table leaves for chesspal play when it wrote Codex's hooks.
const hooksNote = "codex-hooks-note.json";
const tables: Table[] = [];

afterEach(async () => {
    await Promise.all(tables.splice(0).map((table) => table.close()));
    await Promise.all(folders.splice(0).map(removeFolder));
});

describe("a chat the table opens", () => {
    it("starts Claude Code with the start message first, then the model and effort it offers; its middle ones for others, or none chosen", () => {
        expect(hostArgs("claude", "Giochiamo!", { model: "opus", effort: "high" })).toEqual(["Giochiamo!", "--model", "opus", "--effort", "high"]);
        expect(hostArgs("claude", "Let's play!", { model: "gpt-6-luna", effort: "ultra" })).toEqual(["Let's play!", "--model", "sonnet", "--effort", "medium"]);
        expect(hostArgs("claude", "Let's play!")).toEqual(["Let's play!", "--model", "sonnet", "--effort", "medium"]);
        expect(startMessage("it-IT")).toBe("Giochiamo!");
        expect(startMessage(undefined)).toBe("Let's play!");
        expect(startMessage("it-IT", true)).toBe("Analizziamo la partita!");
        expect(startMessage(undefined, true)).toBe("Let's analyse the game!");
    });

    it("starts Codex with no update screen, its model and the effort in its config, the message last", () => {
        expect(hostArgs("codex", "Let's play!", { model: "gpt-6-luna", effort: "low" })).toEqual(["-c", "check_for_update_on_startup=false", "-m", "gpt-6-luna", "-c", "model_reasoning_effort=low", "Let's play!"]);
        expect(hostArgs("codex", "Let's play!")).toEqual(["-c", "check_for_update_on_startup=false", "-m", "gpt-6.1-terra", "-c", "model_reasoning_effort=medium", "Let's play!"]);
    });

    it("plays with the model and effort the profile in use chose on the page, in the table's folder, set up as init does", () => {
        const context = homeContext("linux");
        const home = context.home();
        saveProfileSettings(home, activeProfile(home).id, { language: "it", claudeModel: "sonnet", claudeEffort: "max" });
        const launch = hostLaunch(context, "claude", { PATH: "/usr/bin", CLAUDE_CODE_EFFORT_LEVEL: "low", CLAUDECODE: "1" }, (path) => path === "/usr/bin/claude");

        expect(launch).toMatchObject({ program: "/usr/bin/claude", args: ["Giochiamo!", "--model", "sonnet", "--effort", "max"], folder: tableFolder(home), shell: false });
        // An effort set for every chat would win over the page's; a chat's session, when the table was started from one, is not the host's.
        expect(launch.env).toMatchObject({ PATH: "/usr/bin", CLAUDE_CODE_EFFORT_LEVEL: undefined, CLAUDECODE: undefined });
    });

    it("is asked to analyse the game in analysis on the page when none goes on, and to play once a game does", async () => {
        const context = homeContext("linux");
        const home = context.home();
        const there = (path: string) => path === "/usr/bin/claude";
        startAnalysis(gameFolder(home), "2026-11-13-192013.pgn", context.now(), { brought: true });
        expect(hostLaunch(context, "claude", { PATH: "/usr/bin" }, there).args[0]).toBe("Let's analyse the game!");

        // A game the AI has gone over is on the page all the same: the chat opened there talks it over.
        startAnalysis(gameFolder(home), "2026-11-13-192013.pgn", context.now());
        expect(hostLaunch(context, "claude", { PATH: "/usr/bin" }, there).args[0]).toBe("Let's analyse the game!");

        await commands.find((command) => command.name === "new_game")!.run({ ai_colour: "black" }, context);
        expect(hostLaunch(context, "claude", { PATH: "/usr/bin" }, there).args[0]).toBe("Let's play!");
    });

    it("runs Codex's npm script with Node on Windows, without cmd, and its shim through cmd only when the script is not beside it", () => {
        const context = homeContext("win32");
        const env = { PATH: "C:\\npm", PATHEXT: ".EXE;.CMD" };
        const script = "C:\\npm\\node_modules\\@openai\\codex\\bin\\codex.js";

        expect(hostLaunch(context, "codex", env, (path) => path === "C:\\npm\\codex.cmd" || path === script)).toMatchObject({ program: process.execPath, shell: false });
        expect(hostLaunch(context, "codex", env, (path) => path === "C:\\npm\\codex.cmd").args[0]).toBe("-c");
        expect(hostLaunch(context, "codex", env, (path) => path === "C:\\npm\\codex.cmd")).toMatchObject({ program: "C:\\npm\\codex.cmd", shell: true });
        expect(() => hostLaunch(context, "codex", env, () => false)).toThrow("Codex is not installed on this computer, or not on its PATH: install it (npm install -g @openai/codex), then try again.");
    });

    it("says when it wrote Codex's hooks, the first time or again over older ones, which Codex then asks the player to trust", () => {
        const context = homeContext("linux");
        const env = { PATH: "/usr/bin" };
        const found = (path: string): boolean => path === "/usr/bin/codex";
        const hooks = join(tableFolder(context.home()), ".codex", "hooks.json");

        expect(hostLaunch(context, "codex", env, found).hooks).toBe("new");
        expect(hostLaunch(context, "codex", env, found).hooks).toBeUndefined();
        writeFileSync(hooks, "{}\n");
        expect(hostLaunch(context, "codex", env, found).hooks).toBe("changed");
        expect(hostLaunch(context, "codex", env, found).hooks).toBeUndefined();
        expect(existsSync(join(tableFolder(context.home()), hooksNote))).toBe(false);
    });

    it("keeps hooks Codex never asked about as new when Chesspal writes them again before it does", () => {
        const context = homeContext("linux");
        const env = { PATH: "/usr/bin" };
        const hooks = join(tableFolder(context.home()), ".codex", "hooks.json");

        hostLaunch(context, "claude", env, (path) => path === "/usr/bin/claude");
        writeFileSync(hooks, "{}\n");
        expect(hostLaunch(context, "codex", env, (path) => path === "/usr/bin/codex").hooks).toBe("new");
    });

    it("says once what the table wrote of Codex's hooks before chesspal play started, and nothing when it wrote none", async () => {
        const context = homeContext("linux");
        const folder = tableFolder(context.home());
        const env = { PATH: "/usr/bin" };
        const found = (path: string): boolean => path === "/usr/bin/codex";

        // A first table writes Codex's hooks where there were none: the next Codex play says they are new; Claude Code's play leaves it to Codex's.
        const table = await onFreePorts(() => startTable(context, { idle: 60_000, every: 1_000 }, fakeChats().chats));
        tables.push(table!);
        expect(existsSync(join(folder, hooksNote))).toBe(true);
        hostLaunch(context, "claude", env, (path) => path === "/usr/bin/claude");
        expect(hostLaunch(context, "codex", env, found).hooks).toBe("new");
        await table!.close();

        // A table that writes none leaves no note.
        const same = await onFreePorts(() => startTable(context, { idle: 60_000, every: 1_000 }, fakeChats().chats));
        tables.push(same!);
        expect(existsSync(join(folder, hooksNote))).toBe(false);
        await same!.close();

        // Older hooks the table writes again: the next play says they changed, once, and takes the note.
        writeFileSync(join(folder, ".codex", "hooks.json"), "{}\n");
        const again = await onFreePorts(() => startTable(context, { idle: 60_000, every: 1_000 }, fakeChats().chats));
        tables.push(again!);
        expect(hostLaunch(context, "codex", env, found).hooks).toBe("changed");
        expect(existsSync(join(folder, hooksNote))).toBe(false);
        expect(hostLaunch(context, "codex", env, found).hooks).toBeUndefined();
    });

    it("takes a note it cannot read as no note", () => {
        const context = homeContext("linux");
        const folder = tableFolder(context.home());
        setUpTable(folder, "linux");
        writeFileSync(join(folder, hooksNote), "{ not json");

        expect(hostLaunch(context, "codex", { PATH: "/usr/bin" }, (path) => path === "/usr/bin/codex").hooks).toBeUndefined();
        expect(existsSync(join(folder, hooksNote))).toBe(false);
    });

    it("opens in Windows Terminal, else in the console Windows starts; in macOS's Terminal; on Linux in the terminals installed", () => {
        const command = ["C:\\Program Files\\nodejs\\node.exe", "cli.js", "play", "claude"];
        const windows = terminals("C:\\Users\\R&D\\table", command, "win32", { PATH: "C:\\apps", PATHEXT: ".EXE" }, (path) => path === "C:\\apps\\wt.exe");
        const windowsConsole = ["cmd.exe", "/d", "/s", "/c", '"start "" /D "C:\\Users\\R&D\\table" "C:\\Program Files\\nodejs\\node.exe" cli.js play claude"'];

        expect(windows).toEqual([["C:\\apps\\wt.exe", "-w", "new", "-d", "C:\\Users\\R&D\\table", "--title", "Chesspal", ...command], windowsConsole]);
        expect(terminals("C:\\Users\\R&D\\table", command, "win32", { PATH: "C:\\apps" }, () => false)).toEqual([windowsConsole]);
        expect(terminals("D:\\a;b", command, "win32", { PATH: "C:\\apps" }, (path) => path === "C:\\apps\\wt.exe")[0]?.[4]).toBe("D:\\a\\;b");
        expect(terminals("/data/table", command, "darwin", {})[0]?.[0]).toBe("osascript");
        expect(terminals("/data/table", command, "linux", { PATH: "/usr/bin" }, (path) => path === "/usr/bin/konsole")).toEqual([["/usr/bin/konsole", "--workdir", "/data/table", "-e", ...command]]);
    });

    it("offers the hosts found on the PATH, each with its choices and the command to type, and opens a terminal running chesspal play", async () => {
        const bin = temporary();
        writeFileSync(join(bin, process.platform === "win32" ? "claude.exe" : "claude"), "");
        const context = homeContext(process.platform);
        const chats = terminalChats(context, ["node", "cli.js"], { PATH: bin, PATHEXT: ".EXE" });

        expect(chats.hosts()).toEqual([
            expect.objectContaining({ name: "claude", installed: true, models: ["fable", "opus", "sonnet", "haiku"], command: "chesspal play claude" }),
            expect.objectContaining({ name: "codex", installed: false }),
        ]);
        expect(await chats.open("gemini")).toBe(false);

        // Only the chat in the table's folder, and only while chesspal play holds its seat, starts again.
        const table = tableFolder(context.home());
        mkdirSync(table, { recursive: true });
        expect(chats.held(table)).toBeUndefined();
        expect(chats.relaunch(table)).toBe(false);
        takeSeat(table, { pid: process.pid, host: "claude" });
        expect(chats.held(bin)).toBeUndefined();
        expect(chats.held(table)).toEqual({ seat: process.pid });
        // With the model and effort its host started with, which the page compares with the ones chosen since (D-107).
        takeSeat(table, { pid: process.pid, host: "claude", model: "opus", effort: "high" });
        expect(chats.held(table)).toEqual({ model: "opus", effort: "high", seat: process.pid });
        expect(chats.relaunch(bin)).toBe(false);
        expect(chats.relaunch(table)).toBe(true);
        expect(askedAgain(table, process.pid)).toEqual({});
        // Asked with another host, which takes its place (D-107).
        expect(chats.relaunch(table, "codex")).toBe(true);
        expect(askedAgain(table, process.pid)).toEqual({ host: "codex" });
        // Asked after an update, from the Chesspal just installed (D-108).
        expect(chats.relaunch(table, undefined, true)).toBe(true);
        expect(askedAgain(table, process.pid)).toEqual({ updated: true });
    });

    it("names the table's own data folder to the chat it opens, which a terminal may start without the table's environment", () => {
        expect(playCommand(["node", "cli.js"], "claude", {})).toEqual(["node", "cli.js", "play", "claude"]);
        expect(playCommand(["node", "cli.js"], "codex", { CHESSPAL_HOME: "/runs/home" })).toEqual(["node", "cli.js", "play", "codex", "--home", "/runs/home"]);
    });

    it("keeps each host's choice in the page's settings, a word alone", () => {
        expect(settingsFrom({ claudeModel: "opus", codexEffort: "x high!" })).toMatchObject({ claudeModel: "opus", claudeEffort: "", codexEffort: "" });
    });

    it("is chesspal play <host>, whose help the command line gives", async () => {
        expect((await runCommandLine(["play", "--help"], testContext())).output).toContain("chesspal play <claude|codex>");
        expect(await runCommandLine(["play"], testContext())).toMatchObject({ exitCode: 1, output: expect.stringContaining("chesspal play takes one host, claude or codex: none given.") });
    });
});

describe("the seat chesspal play takes at the table", () => {
    it("is one play process's at a time, and the table asks that one alone to start its host again", () => {
        // The table's folder, which the first play makes.
        const folder = join(temporary(), "table");

        expect(askAgain(folder)).toBe(false);
        takeSeat(folder, { pid: 1, host: "claude" });
        expect(() => takeSeat(folder, { pid: 2, host: "codex" })).toThrow("A chat in claude already plays at the table, in another window: play there, or close it, then try again.");
        expect(seatTaken(folder)).toBe(true);
        expect(askedAgain(folder, 1)).toBeUndefined();
        expect(askAgain(folder)).toBe(true);
        expect(askedAgain(folder, 2)).toBeUndefined();
        expect(askedAgain(folder, 1)).toEqual({});
        // The request is taken once.
        expect(askedAgain(folder, 1)).toBeUndefined();

        leaveSeat(folder, 2);
        expect(askAgain(folder)).toBe(true);
        leaveSeat(folder, 1);
        expect(askAgain(folder)).toBe(false);
    });

    it("is held while its play process refreshes it, and goes to the next one when it stops, whatever process takes its id, the request left with it", () => {
        const folder = temporary();
        takeSeat(folder, { pid: 3, host: "claude" });
        askAgain(folder);
        const later = new Date(Date.now() + seatTimes.heldFor);

        expect(seatTaken(folder, later)).toBe(false);
        refreshSeat(folder, 4, later);
        expect(askAgain(folder, later)).toBe(false);
        refreshSeat(folder, 3, later);
        expect(seatTaken(folder, later)).toBe(true);

        const after = new Date(later.getTime() + seatTimes.heldFor);
        takeSeat(folder, { pid: 4, host: "codex" }, after);
        expect(askedAgain(folder, 4)).toBeUndefined();
        expect(askedAgain(folder, 3)).toBeUndefined();
    });

    it("has its host ended and started again when the table asks; a host that ends by itself ends the play", async () => {
        const folder = temporary();
        let asked = 0;

        expect(await runHost(nodeHost(folder, "setTimeout(() => process.exit(7), 60000)"), () => ++asked === 2, process.platform, 20)).toEqual({ code: expect.any(Number), again: true });
        expect(await runHost(nodeHost(folder, "process.exit(3)"), () => false, process.platform, 20)).toEqual({ code: 3, again: false });
    }, 15_000);

    it.runIf(process.platform === "win32")("ends on Windows the whole tree the host started, its MCP server among them", async () => {
        const folder = temporary();
        const pidFile = join(folder, "grandchild.pid");
        const grandchild = `const fs = require("node:fs"); fs.writeFileSync(${JSON.stringify(`${pidFile}.part`)}, String(process.pid)); fs.renameSync(${JSON.stringify(`${pidFile}.part`)}, ${
            JSON.stringify(pidFile)
        }); setTimeout(() => undefined, 60000);`;
        const host = `require("node:child_process").spawn(process.execPath, ["-e", ${JSON.stringify(grandchild)}], { stdio: "ignore" }); setTimeout(() => undefined, 60000);`;

        expect(await runHost(nodeHost(folder, host), () => existsSync(pidFile), "win32", 20)).toMatchObject({ again: true });
        expect(await gone(Number(readFileSync(pidFile, "utf8")))).toBe(true);
    }, 15_000);

    it.runIf(process.platform !== "win32")("kills a host that does not end when asked", async () => {
        const host = nodeHost(temporary(), "process.on('SIGTERM', () => undefined); setInterval(() => undefined, 1000);");
        let asked = 0;

        expect(await runHost(host, () => ++asked === 2, process.platform, 20)).toMatchObject({ again: true });
    }, 15_000);
});

describe("a host that closes at its start", () => {
    const closed = "Claude Code closed as soon as it opened.";

    it("is Claude Code told how to trust the folder and started once more, then left to end the play", async () => {
        const { code, starts, said } = await played("claude", [1, 1], () => new Date(2026, 10, 13));

        expect({ code, starts }).toEqual({ code: 1, starts: 2 });
        expect(said.split(closed)).toHaveLength(3);
        expect(said).toContain('If it asks whether you trust this folder, go down to "Yes, I trust this folder" with the arrow keys, then press Enter.');
    }, 30_000);

    it("plays on once Claude Code started once more opens", async () => {
        const { code, starts, said } = await played("claude", [1, 0], () => new Date(2026, 10, 13));

        expect({ code, starts }).toEqual({ code: 0, starts: 2 });
        expect(said.split(closed)).toHaveLength(2);
    }, 30_000);

    it("is not started again when it ends with no error, after a minute, or is Codex", async () => {
        let minutes = 0;
        const later = (): Date => new Date(2026, 10, 13, 10, minutes++);

        expect(await played("claude", [0], () => new Date(2026, 10, 13))).toEqual({ code: 0, starts: 1, said: "" });
        expect(await played("claude", [1], later)).toEqual({ code: 1, starts: 1, said: "" });
        expect(await played("codex", [1], () => new Date(2026, 10, 13))).toMatchObject({ code: 1, starts: 1 });
    }, 30_000);
});

/**
 * Plays a fake host on the PATH, which ends with the codes given, one per start, in a context whose time is `now`: the play's code, how many times the
 * host started and what the play said.
 */
async function played(host: "claude" | "codex", codes: readonly number[], now: () => Date): Promise<{ code: number; starts: number; said: string; }>
{
    const bin = temporary();
    const count = join(bin, "starts");
    const script = join(bin, "host.cjs");
    writeFileSync(
        script,
        `const fs = require("node:fs"); const n = fs.existsSync(${JSON.stringify(count)}) ? Number(fs.readFileSync(${JSON.stringify(count)}, "utf8")) : 0;
fs.writeFileSync(${JSON.stringify(count)}, String(n + 1)); process.exit(${JSON.stringify(codes)}[n] ?? 0);\n`,
    );

    if (process.platform === "win32") {
        writeFileSync(join(bin, `${host}.cmd`), `@"${process.execPath}" "${script}" %*\r\n`);
    } else {
        writeFileSync(join(bin, host), `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`, { mode: 0o755 });
    }

    const path = process.env.PATH;
    const writes: string[] = [];
    const write = vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
        writes.push(String(chunk));
        return true;
    });

    try {
        process.env.PATH = bin;
        const code = await playHost({ ...homeContext(process.platform), language: "en", now }, host);
        const said = writes.join("").replace(/^Codex will ask about Chesspal's two hooks.*\n/m, "");
        return { code, starts: Number(readFileSync(count, "utf8")), said };
    } finally {
        process.env.PATH = path;
        write.mockRestore();
    }
}

describe("the table's page, with no chat at it", () => {
    it("shows the hosts, and opens a chat when its own page asks, once, for a host installed", async () => {
        const { table, opened } = await tableWith(fakeChats());
        const origin = new URL(table.url).origin;

        expect((await getGame(table.url)).table).toEqual({ chat: false, held: false, hosts: fakeHosts });
        expect(await openChat(table.url, "claude")).toMatchObject({ status: 403 });
        expect(await openChat(table.url, "codex", origin)).toMatchObject({ status: 400 });
        expect(await openChat(table.url, "claude", origin)).toEqual({ status: 200, body: { opened: true } });
        expect(opened).toEqual(["claude"]);
        expect((await getGame(table.url)).table).toMatchObject({ opening: "chat" });
        expect(await openChat(table.url, "claude", origin)).toMatchObject({ status: 409 });
        expect(opened).toEqual(["claude"]);
    });

    it("lets the page open another when the terminal did not open", async () => {
        const { table, opened } = await tableWith(fakeChats(false));
        const origin = new URL(table.url).origin;

        expect(await openChat(table.url, "claude", origin)).toEqual({ status: 200, body: { opened: false } });
        expect((await getGame(table.url)).table).not.toHaveProperty("opening");
        expect(await openChat(table.url, "claude", origin)).toMatchObject({ status: 200 });
        expect(opened).toEqual(["claude", "claude"]);
    });

    it("shows a chat opening while chesspal play holds the seat, as at a trust prompt longer than the wait, and opens no other", async () => {
        const { table, opened } = await tableWith(fakeChats(true, true));

        expect((await getGame(table.url)).table).toMatchObject({ opening: "chat" });
        expect(await openChat(table.url, "claude", new URL(table.url).origin)).toMatchObject({ status: 409 });
        expect(opened).toEqual([]);
    });
});

const fakeHosts = [
    { name: "claude", installed: true, models: ["opus"], efforts: ["high"], command: "chesspal play claude" },
    { name: "codex", installed: false, models: [], efforts: [], command: "chesspal play codex" },
];

/** Chats that open no terminal: the hosts asked for, and whether each opened; whether chesspal play holds the seat. */
function fakeChats(opens = true, held = false): { chats: TableChats; opened: string[]; }
{
    const opened: string[] = [];
    return { chats: { hosts: () => fakeHosts, open: (host) => Promise.resolve(opened.push(host) > 0 && opens), held: () => (held ? {} : undefined), relaunch: () => false }, opened };
}

async function tableWith({ chats, opened }: { chats: TableChats; opened: string[]; }): Promise<{ table: Table; opened: string[]; }>
{
    const table = await onFreePorts(() => startTable(homeContext("linux"), { idle: 60_000, every: 1_000 }, chats));

    if (table === undefined) {
        throw new Error("The table did not start: another one holds its ports.");
    }

    tables.push(table);
    return { table, opened };
}

async function getGame(url: string): Promise<{ table?: unknown; }>
{
    return JSON.parse((await sent(new URL("/api/game", url))).text) as { table?: unknown; };
}

/** Asks the table for a chat, as a browser would, with the page's origin when given: the answer's status and body. */
async function openChat(url: string, host: string, origin?: string): Promise<{ status: number; body: unknown; }>
{
    const headers = { "Content-Type": "application/json", ...(origin === undefined ? {} : { Origin: origin }) };
    const answer = await sent(new URL("/api/table/chat", url), { method: "POST", headers, body: JSON.stringify({ host }) });
    return { status: answer.status, body: JSON.parse(answer.text) as unknown };
}

/** A Node script run as a host, in the folder given. */
function nodeHost(folder: string, code: string): HostLaunch
{
    return { program: process.execPath, args: ["-e", code], folder, env: process.env, shell: false, choice: {} };
}

/** Whether a process is gone, within two seconds. */
async function gone(pid: number): Promise<boolean>
{
    for (let tries = 0; tries < 20; tries++) {
        try {
            process.kill(pid, 0);
        } catch {
            return true;
        }

        await new Promise((done) => setTimeout(done, 100));
    }

    return false;
}

/** A context on a temporary data folder, with the real time, which the table's opening is measured with. */
function homeContext(platform: string): Context
{
    return { ...testContext(temporary()), platform, now: () => new Date() };
}

function temporary(): string
{
    const folder = mkdtempSync(join(tmpdir(), "chesspal-hosts-"));
    folders.push(folder);
    return folder;
}
