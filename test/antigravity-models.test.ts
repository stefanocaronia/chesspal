import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Context } from "../src/commands/index.ts";
import { tableFolder } from "../src/home/index.ts";
import { settingsFrom } from "../src/page/profile/settings.ts";
import { chosen, effortsOf, type HostChoices, startedWith } from "../src/page/table/action.ts";
import { activeProfile, saveProfileSettings } from "../src/profiles/index.ts";
import { terminalChats } from "../src/server/table/hosts/chats.ts";
import { choiceIn, hostArgs } from "../src/server/table/hosts/hosts.ts";
import { antigravityChoices, type RunProgram, tableChoices } from "../src/server/table/hosts/models.ts";
import { hostLaunch } from "../src/server/table/index.ts";
import { testContext } from "./commands.ts";
import { removeFolder } from "./folders.ts";

const folders: string[] = [];

afterEach(async () => {
    await Promise.all(folders.splice(0).map(removeFolder));
});

// What `agy models` printed on a free account, its header on stderr.
const free = [
    "gemini-3.8-flash-high\tGemini 3.8 Flash (High)",
    "gemini-3.8-flash-medium\tGemini 3.8 Flash (Medium)",
    "gemini-3.8-flash-low\tGemini 3.8 Flash (Low)",
    "claude-sonnet-4-6\tClaude Sonnet 4.6 (Thinking)",
    "claude-opus-4-6-thinking\tClaude Opus 4.6 (Thinking)",
    "gpt-oss-120b-medium\tGPT-OSS 120B (Medium)",
    "",
].join("\n");

// A list as a subscription might give it: names never seen, efforts up to max, no Flash, Windows' line ends and the header on stdout.
const paid = ["Fetching available models...", "carbon-2-max\tCarbon 2 (Max)", "carbon-2-low\tCarbon 2 (Low)", "carbon-2-xhigh\tCarbon 2 (Extra high)", "hydrogen-pro\tHydrogen Pro", ""].join("\r\n");

const allowed = { permissions: { allow: ["mcp(chesspal/*)"] } };

describe("Antigravity's models, read from the player's account", () => {
    it("turns each id into a model and its effort, a Gemini Flash at its middle effort first chosen", () => {
        expect(antigravityChoices(free)).toEqual({
            models: ["gemini-3.8-flash", "claude-sonnet-4-6", "claude-opus-4-6-thinking", "gpt-oss-120b"],
            efforts: ["low", "medium", "high"],
            model: "gemini-3.8-flash",
            effort: "medium",
            modelEfforts: { "gemini-3.8-flash": ["low", "medium", "high"], "claude-sonnet-4-6": [], "claude-opus-4-6-thinking": [], "gpt-oss-120b": ["medium"] },
        });
        expect(antigravityChoices("Fetching available models...\n")).toBeUndefined();
        expect(antigravityChoices("")).toBeUndefined();
    });

    it("reads names it has never seen the same way, the first model chosen where there is no Flash", () => {
        const choices = antigravityChoices(paid)!;

        expect(choices.models).toEqual(["carbon-2", "hydrogen-pro"]);
        expect(choices.modelEfforts).toEqual({ "carbon-2": ["low", "xhigh", "max"], "hydrogen-pro": [] });
        expect(choices.model).toBe("carbon-2");
        // Carbon has no medium: its middle effort.
        expect(choiceIn(undefined, "antigravity", choices)).toEqual({ model: "carbon-2", effort: "xhigh" });
        expect(choiceIn({ antigravityModel: "hydrogen-pro", antigravityEffort: "max" }, "antigravity", choices)).toEqual({ model: "hydrogen-pro" });
        // A choice no longer offered, as Gemini Flash after the plan changed: the default.
        expect(choiceIn({ antigravityModel: "gemini-3.8-flash", antigravityEffort: "low" }, "antigravity", choices)).toEqual({ model: "carbon-2", effort: "low" });
    });

    it("starts Antigravity with the model and effort read, and no effort for a model that has none", () => {
        const choices = antigravityChoices(free)!;
        const settings = (args: string[]): unknown => JSON.parse(args.at(-1) ?? "");

        const flash = hostArgs("antigravity", "Giochiamo!", { model: "gemini-3.8-flash", effort: "low" }, undefined, choices);
        expect(flash).toEqual(["-i", "Giochiamo!", "--model", "gemini-3.8-flash", "--effort", "low", "--settings", JSON.stringify(allowed)]);
        const sonnet = hostArgs("antigravity", "Giochiamo!", { model: "claude-sonnet-4-6", effort: "high" }, undefined, choices);
        expect(sonnet).toEqual(["-i", "Giochiamo!", "--model", "claude-sonnet-4-6", "--settings", JSON.stringify(allowed)]);
        expect(settings(sonnet)).toEqual(allowed);
        // An effort the model does not have: its own.
        expect(hostArgs("antigravity", "Giochiamo!", { model: "gpt-oss-120b", effort: "high" }, undefined, choices).slice(2, 6)).toEqual(["--model", "gpt-oss-120b", "--effort", "medium"]);
    });

    it("offers Gemini Flash until the list comes, the models read once it has, and tells the page; the list kept for chesspal play", async () => {
        const context = homeContext();
        const { env, program } = agyInstalled();
        const reading = answering();
        const chats = terminalChats(context, ["node", "cli.js"], env, reading.run);
        let told = 0;
        chats.watch?.(() => told++);

        expect(reading.asked).toEqual([{ program, args: ["models"], timeout: 15_000 }]);
        expect(antigravity(chats.hosts())).toMatchObject({ installed: true, models: ["gemini-3.8-flash"], efforts: ["low", "medium", "high"] });
        expect(tableChoices(tableFolder(context.home()), "antigravity").models).toEqual(["gemini-3.8-flash"]);

        mkdirSync(tableFolder(context.home()), { recursive: true });
        reading.answer(free);
        await settled();

        expect(told).toBe(1);
        expect(antigravity(chats.hosts())).toMatchObject({ models: ["gemini-3.8-flash", "claude-sonnet-4-6", "claude-opus-4-6-thinking", "gpt-oss-120b"], model: "gemini-3.8-flash" });
        expect(tableChoices(tableFolder(context.home()), "antigravity")).toEqual(antigravityChoices(free));

        // Read once for the table's life.
        context.now = () => new Date(Date.now() + 60_000);
        chats.hosts();
        expect(reading.asked).toHaveLength(1);
    });

    it("keeps Gemini Flash when the list cannot be read, and reads it again only once the host is looked for again", async () => {
        const context = homeContext();
        const { env } = agyInstalled();
        const reading = answering();
        const chats = terminalChats(context, ["node", "cli.js"], env, reading.run);

        reading.fail(new Error("agy models timed out"));
        await settled();
        chats.hosts();
        expect(reading.asked).toHaveLength(1);
        expect(antigravity(chats.hosts()).models).toEqual(["gemini-3.8-flash"]);

        const later = Date.now() + 60_000;
        context.now = () => new Date(later);
        chats.hosts();
        expect(reading.asked).toHaveLength(2);
        // A list with no model in it is no list.
        reading.answer("Fetching available models...\n");
        await settled();
        expect(antigravity(chats.hosts()).models).toEqual(["gemini-3.8-flash"]);
    });

    it("never runs agy models when Antigravity is not installed", () => {
        const reading = answering();
        const chats = terminalChats(homeContext(), ["node", "cli.js"], { PATH: temporary(), PATHEXT: ".EXE", HOME: temporary(), LOCALAPPDATA: temporary() }, reading.run);

        expect(antigravity(chats.hosts())).toMatchObject({ installed: false, models: ["gemini-3.8-flash"] });
        expect(reading.asked).toEqual([]);
    });

    it("starts the chat with the model chosen on the page among those the table read, the default for one it no longer offers", () => {
        const context = homeContext("linux");
        const home = context.home();
        const table = tableFolder(home);
        const installed = "/home/ann/.local/bin/agy";
        const launch = (): string[] => [...hostLaunch(context, "antigravity", { PATH: "/usr/bin", HOME: "/home/ann" }, (path) => path === installed).args];
        saveProfileSettings(home, activeProfile(home).id, { antigravityModel: "hydrogen-pro", antigravityEffort: "high" });

        // No list read yet: Gemini Flash, with the effort chosen, which it has.
        expect(launch().slice(2, 6)).toEqual(["--model", "gemini-3.8-flash", "--effort", "high"]);
        mkdirSync(table, { recursive: true });
        writeFileSync(join(table, "antigravity-models.txt"), paid);
        expect(launch().slice(2, 4)).toEqual(["--model", "hydrogen-pro"]);
        expect(launch()[4]).toBe("--settings");
        writeFileSync(join(table, "antigravity-models.txt"), free);
        expect(launch().slice(2, 6)).toEqual(["--model", "gemini-3.8-flash", "--effort", "high"]);
    });

    it("shows on the page the efforts of the model chosen, none for a model without, and its middle one for an effort it does not have", () => {
        const host: HostChoices = { name: "antigravity", installed: true, ...antigravityChoices(free)! };

        expect(chosen(host, "model", settingsFrom({}))).toBe("gemini-3.8-flash");
        expect(chosen(host, "effort", settingsFrom({}))).toBe("medium");
        expect(effortsOf(host, "claude-sonnet-4-6")).toEqual([]);
        expect(chosen(host, "effort", settingsFrom({ antigravityModel: "claude-sonnet-4-6", antigravityEffort: "low" }))).toBeUndefined();
        expect(chosen(host, "effort", settingsFrom({ antigravityModel: "gpt-oss-120b", antigravityEffort: "low" }))).toBe("medium");
        expect(chosen(host, "model", settingsFrom({ antigravityModel: "carbon-2" }))).toBe("gemini-3.8-flash");
        expect(startedWith({ chat: true, host: "antigravity", held: true, started: { model: "claude-opus-4-6-thinking" }, hosts: [host] }, host, "effort")).toBeUndefined();
    });
});

function antigravity<Host extends { name: string; }>(hosts: readonly Host[]): Host
{
    return hosts.find((host) => host.name === "antigravity")!;
}

/** A program that answers when the test says: what it was asked, and how to answer or fail. */
function answering(): { run: RunProgram; asked: Array<{ program: string; args: readonly string[]; timeout: number; }>; answer: (text: string) => void; fail: (error: Error) => void; }
{
    const asked: Array<{ program: string; args: readonly string[]; timeout: number; }> = [];
    let answer = (_text: string): void => undefined;
    let fail = (_error: Error): void => undefined;

    const run: RunProgram = (program, args, timeout) => {
        asked.push({ program, args, timeout });
        return new Promise((done, failed) => {
            answer = done;
            fail = failed;
        });
    };

    return { run, asked, answer: (text) => answer(text), fail: (error) => fail(error) };
}

/** Antigravity installed where its installer puts it, in a folder of the test: the environment that finds it, and its path. */
function agyInstalled(): { env: NodeJS.ProcessEnv; program: string; }
{
    const base = temporary();
    const windows = process.platform === "win32";
    const folder = windows ? join(base, "agy", "bin") : join(base, ".local", "bin");
    mkdirSync(folder, { recursive: true });
    const program = join(folder, windows ? "agy.exe" : "agy");
    writeFileSync(program, "");
    return { env: { PATH: temporary(), PATHEXT: ".EXE", ...(windows ? { LOCALAPPDATA: base } : { HOME: base }) }, program };
}

function settled(): Promise<void>
{
    return new Promise((done) => setTimeout(done, 0));
}

function homeContext(platform: string = process.platform): Context & { now: () => Date; }
{
    return { ...testContext(temporary()), platform, now: () => new Date() };
}

function temporary(): string
{
    const folder = mkdtempSync(join(tmpdir(), "chesspal-models-"));
    folders.push(folder);
    return folder;
}
