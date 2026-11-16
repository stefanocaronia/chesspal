import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import type { Context } from "../src/commands/index.ts";
import { aiNameOf } from "../src/core/index.ts";
import { tableFolder } from "../src/home/index.ts";
import { hasDoorbell } from "../src/host-files/index.ts";
import { settingsFrom } from "../src/page/profile/settings.ts";
import { chatAction, chosen, effortsOf, type HostChoices } from "../src/page/table/action.ts";
import { activeProfile, saveProfileSettings } from "../src/profiles/index.ts";
import { bellLine, hookAnswer } from "../src/server/bell/bell.ts";
import { callerOf } from "../src/server/mcp/caller.ts";
import { pagePorts } from "../src/server/ports/index.ts";
import { terminalChats } from "../src/server/table/hosts/chats.ts";
import { hostArgs, hostEnvironment } from "../src/server/table/hosts/hosts.ts";
import { type ModelSources, type RunProgram, tableChoices } from "../src/server/table/hosts/models.ts";
import { ollamaAddress } from "../src/server/table/hosts/ollama.ts";
import { openCodeChoices, openCodeList } from "../src/server/table/hosts/opencode.ts";
import { hostLaunch } from "../src/server/table/index.ts";
import type { Fetch } from "../src/sites/index.ts";
import { version } from "../src/version.ts";
import { testContext } from "./commands.ts";
import { removeFolder } from "./folders.ts";

const folders: string[] = [];
const servers: Server[] = [];

afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise((done) => server.close(done))));
    await Promise.all(folders.splice(0).map(removeFolder));
});

// What `opencode models` lists: every provider whose key is in the environment, and Ollama's models; qwen3-coder is not among them.
const listed = ["anthropic/claude-sonnet-5", "google/gemini-4-hydrogen", "ollama/gemma4:12b", "ollama/gpt-oss:20b", "ollama/nomic-embed-text", "openai/gpt-6", ""].join("\n");
// Ollama's models, and what each can do: the embedding model uses no tools.
const ollama: Record<string, string[]> = {
    "qwen3-coder:30b": ["completion", "tools"],
    "gpt-oss:20b": ["completion", "tools", "thinking"],
    "nomic-embed-text": ["embedding"],
    "gemma4:12b": ["completion", "vision", "tools"],
};
// The player's recent and favourite models in OpenCode, one of them gone from its list.
const state = {
    recent: [{ providerID: "google", modelID: "gemini-4-hydrogen" }, { providerID: "ollama", modelID: "gpt-oss:20b" }, { providerID: "gone", modelID: "old" }],
    favorite: [{ providerID: "anthropic", modelID: "claude-sonnet-5" }, { providerID: "google", modelID: "gemini-4-hydrogen" }],
    variant: {},
};

describe("OpenCode, the fourth host (D-117)", () => {
    it("offers Ollama's models that use tools, then the player's recent and favourite ones, only those OpenCode lists, Ollama's first one chosen", async () => {
        const sources = modelSources();
        writeState(sources.userHome, state);

        expect(JSON.parse(await openCodeList("opencode", sources))).toEqual({
            models: ["ollama/gpt-oss:20b", "ollama/gemma4:12b", "google/gemini-4-hydrogen", "anthropic/claude-sonnet-5"],
            model: "ollama/gpt-oss:20b",
        });
        expect(sources.asked).toContain("http://127.0.0.1:11434/api/tags");
    });

    it("starts with the first Ollama model offered, else the player's first recent one, else the first", async () => {
        const fresh = modelSources();
        expect(JSON.parse(await openCodeList("opencode", fresh))).toEqual({ models: ["ollama/gpt-oss:20b", "ollama/gemma4:12b"], model: "ollama/gpt-oss:20b" });

        // Ollama not running: an Ollama model the player used recently comes first all the same.
        const offline = modelSources({ fetch: () => Promise.reject(new Error("connection refused")) });
        writeState(offline.userHome, state);
        expect(JSON.parse(await openCodeList("opencode", offline))).toEqual({ models: ["google/gemini-4-hydrogen", "ollama/gpt-oss:20b", "anthropic/claude-sonnet-5"], model: "ollama/gpt-oss:20b" });

        const noOllama = modelSources({ fetch: () => Promise.reject(new Error("connection refused")) });
        writeState(noOllama.userHome, { ...state, recent: state.recent.filter((one) => one.providerID !== "ollama") });
        expect(JSON.parse(await openCodeList("opencode", noOllama)).model).toBe("google/gemini-4-hydrogen");
        writeState(noOllama.userHome, { recent: [], favorite: state.favorite });
        expect(JSON.parse(await openCodeList("opencode", noOllama)).model).toBe("anthropic/claude-sonnet-5");

        // Nothing found is no list, and a list OpenCode cannot give fails the reading.
        const nothing = await openCodeList("opencode", modelSources({ fetch: () => Promise.reject(new Error("refused")) }));
        expect(openCodeChoices(nothing)).toBeUndefined();
        await expect(openCodeList("opencode", modelSources({ run: () => Promise.reject(new Error("opencode failed")) }))).rejects.toThrow("opencode failed");
    });

    it("finds Ollama where OLLAMA_HOST says, and OpenCode's state where XDG_STATE_HOME says", async () => {
        expect(ollamaAddress(undefined)).toBe("http://127.0.0.1:11434");
        expect(ollamaAddress("0.0.0.0")).toBe("http://127.0.0.1:11434");
        expect(ollamaAddress("192.168.1.9:8080")).toBe("http://192.168.1.9:8080");
        expect(ollamaAddress("https://ollama.example.com")).toBe("https://ollama.example.com");
        expect(ollamaAddress("::bad::")).toBe("http://127.0.0.1:11434");

        const stateHome = temporary();
        const sources = modelSources({ env: { OLLAMA_HOST: "0.0.0.0:11500", XDG_STATE_HOME: stateHome } });
        mkdirSync(join(stateHome, "opencode"), { recursive: true });
        writeFileSync(join(stateHome, "opencode", "model.json"), JSON.stringify({ recent: [{ providerID: "openai", modelID: "gpt-6" }], favorite: [] }));

        expect(JSON.parse(await openCodeList("opencode", sources)).models).toContain("openai/gpt-6");
        expect(sources.asked[0]).toBe("http://127.0.0.1:11500/api/tags");
    });

    it("offers OpenCode with no model until the table finds some, then those, tells the page, and keeps them for chesspal play", async () => {
        const context = homeContext();
        const bin = temporary();
        writeFileSync(join(bin, process.platform === "win32" ? "opencode.exe" : "opencode"), "");
        const sources = modelSources();
        const chats = terminalChats(context, ["node", "cli.js"], { PATH: bin, PATHEXT: ".EXE" }, sources);
        let told = 0;
        chats.watch?.(() => told++);
        const table = tableFolder(context.home());

        expect(openCode(chats.hosts())).toMatchObject({ installed: true, models: [], efforts: [], command: "chesspal play opencode" });
        expect(tableChoices(table, "opencode").models).toEqual([]);

        mkdirSync(table, { recursive: true });
        await settled();

        expect(told).toBe(1);
        expect(openCode(chats.hosts())).toMatchObject({ models: ["ollama/gpt-oss:20b", "ollama/gemma4:12b"], model: "ollama/gpt-oss:20b", efforts: [] });
        expect(tableChoices(table, "opencode")).toEqual({ models: ["ollama/gpt-oss:20b", "ollama/gemma4:12b"], efforts: [], model: "ollama/gpt-oss:20b", effort: "" });
    });

    it("starts OpenCode with its own server, the start message, and the model chosen in its configuration; never while it offers none", () => {
        const context = homeContext("linux");
        const home = context.home();
        const table = tableFolder(home);
        const env = { PATH: "/usr/bin" };
        const launch = (): ReturnType<typeof hostLaunch> => hostLaunch(context, "opencode", env, (path) => path === "/usr/bin/opencode");
        const models = JSON.stringify({ models: ["ollama/gpt-oss:20b", "ollama/gemma4:12b"], model: "ollama/gpt-oss:20b" });

        // With no model OpenCode may fall back to a paid key in the environment.
        expect(launch).toThrow("OpenCode has no model to play with on this computer yet, and Chesspal does not start it without one: install Ollama");
        mkdirSync(table, { recursive: true });
        writeFileSync(join(table, "opencode-models.json"), JSON.stringify({ models: [], model: "" }));
        expect(launch).toThrow("ollama pull gpt-oss:20b");

        expect(hostArgs("opencode", "Giochiamo!")).toEqual(["--standalone", "--prompt", "Giochiamo!"]);
        writeFileSync(join(table, "opencode-models.json"), models);
        expect(launch()).toMatchObject({ program: "/usr/bin/opencode", args: ["--standalone", "--prompt", "Let's play!"], choice: { model: "ollama/gpt-oss:20b" }, shell: false });
        expect(launch().env.OPENCODE_CONFIG_CONTENT).toBe('{"model":"ollama/gpt-oss:20b"}');
        saveProfileSettings(home, activeProfile(home).id, { opencodeModel: "ollama/gemma4:12b", opencodeEffort: "high" });
        expect(launch()).toMatchObject({ choice: { model: "ollama/gemma4:12b" } });
        expect(JSON.parse(launch().env.OPENCODE_CONFIG_CONTENT ?? "")).toEqual({ model: "ollama/gemma4:12b" });

        // npm's Windows shim runs through cmd.
        const windowsContext = homeContext("win32");
        mkdirSync(tableFolder(windowsContext.home()), { recursive: true });
        writeFileSync(join(tableFolder(windowsContext.home()), "opencode-models.json"), models);
        const windows = hostLaunch(windowsContext, "opencode", { PATH: "C:\\npm", PATHEXT: ".EXE;.CMD" }, (path) => path === "C:\\npm\\opencode.cmd");
        expect(windows).toMatchObject({ program: "C:\\npm\\opencode.cmd", shell: true });
        expect(() => hostLaunch(context, "opencode", env, () => false)).toThrow("OpenCode is not installed on this computer, or not on its PATH: install it (npm install -g @opencode/cli), then try again.");
        expect(hostEnvironment("opencode", {})).toEqual({});
        expect(hostEnvironment("claude", { model: "opus", effort: "high" })).toEqual({ CLAUDE_CODE_EFFORT_LEVEL: undefined });
    });

    it("shows on the page OpenCode's models as it names them, with no effort, keeps the one chosen, and offers no start while it has none", () => {
        const none: HostChoices = { name: "opencode", installed: true, models: [], efforts: [], model: "", effort: "" };
        const found: HostChoices = { ...none, models: ["ollama/gpt-oss:20b", "ollama/gemma4:12b"], model: "ollama/gpt-oss:20b" };
        const settings = settingsFrom({ opencodeModel: "ollama/gemma4:12b" });

        expect(settings.opencodeModel).toBe("ollama/gemma4:12b");
        expect(settingsFrom({ opencodeModel: "ollama/gemma4 12b" }).opencodeModel).toBe("");
        expect(settingsFrom({ opencodeModel: "x".repeat(201) }).opencodeModel).toBe("");

        for (const name of ["ollama/hf.co/unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF:UD-Q4_K_XL", "cloudflare-workers-ai/@cf/meta/llama-3.1-8b-instruct"]) {
            expect(settingsFrom({ opencodeModel: name }).opencodeModel).toBe(name);
        }

        expect(chosen(found, "model", settings)).toBe("ollama/gemma4:12b");
        expect(chosen(found, "model", settingsFrom({}))).toBe("ollama/gpt-oss:20b");
        expect(chosen(found, "effort", settings)).toBeUndefined();
        expect(effortsOf(found, "ollama/gemma4:12b")).toEqual([]);
        expect(chosen(none, "model", settings)).toBe("");
        expect(chatAction({ chat: false, held: false, hosts: [none] }, none, false)).toBeUndefined();
        expect(chatAction({ chat: true, host: "claude", held: true, hosts: [none] }, none, false)).toBeUndefined();
        expect(chatAction({ chat: false, held: false, hosts: [found] }, found, false)).toBe("open");
    });

    it("reads OpenCode's models again at most every five minutes while it finds none of Ollama's, and never once it has", async () => {
        const context = homeContext();
        let now = Date.UTC(2026, 10, 16, 12);
        context.now = () => new Date(now);
        const bin = temporary();
        writeFileSync(join(bin, process.platform === "win32" ? "opencode.exe" : "opencode"), "");
        let ollamaRunning = false;
        const ollamaOff: Fetch = () => Promise.reject(new Error("connection refused"));
        const sources = modelSources({ fetch: (url, init) => (ollamaRunning ? modelSources().fetch(url, init) : ollamaOff(url, init)) });
        let runs = 0;

        const run: RunProgram = (...args) => {
            runs++;
            return sources.run(...args);
        };

        const chats = terminalChats(context, ["node", "cli.js"], { PATH: bin, PATHEXT: ".EXE" }, { ...sources, run });
        mkdirSync(tableFolder(context.home()), { recursive: true });

        // The page asks every few seconds for ten minutes, the hosts looked for again every ten: nothing found, read again only every five minutes.
        const pageAsks = async (minutes: number): Promise<void> => {
            for (let second = 0; second < minutes * 60; second += 5) {
                const before = runs;
                now += 5_000;
                chats.hosts();

                if (runs !== before) {
                    await settled();
                }
            }
        };

        await settled();
        await pageAsks(10);
        expect(runs).toBe(3);
        expect(openCode(chats.hosts()).models).toEqual([]);

        // The player's recent model, not Ollama's: offered, and read again all the same, since Ollama may start later.
        writeState(sources.userHome, { recent: [{ providerID: "openai", modelID: "gpt-6" }], favorite: [] });
        await pageAsks(5);
        expect(runs).toBe(4);
        expect(openCode(chats.hosts()).models).toEqual(["openai/gpt-6"]);

        ollamaRunning = true;
        await pageAsks(5);
        expect(runs).toBe(5);
        expect(openCode(chats.hosts()).models).toEqual(["ollama/gpt-oss:20b", "ollama/gemma4:12b", "openai/gpt-6"]);
        await pageAsks(20);
        expect(runs).toBe(5);
    }, 30_000);

    it("reads OpenCode's models with the network and the user's home of the table's context", async () => {
        const sources = modelSources();
        writeState(sources.userHome, { recent: [{ providerID: "openai", modelID: "gpt-6" }], favorite: [] });
        const context = { ...homeContext(), fetch: sources.fetch, userHome: () => sources.userHome };
        const bin = temporary();
        writeFileSync(join(bin, process.platform === "win32" ? "opencode.exe" : "opencode"), "");
        const chats = terminalChats(context, ["node", "cli.js"], { PATH: bin, PATHEXT: ".EXE" }, { run: sources.run });
        mkdirSync(tableFolder(context.home()), { recursive: true });
        await settled();

        expect(openCode(chats.hosts()).models).toEqual(["ollama/gpt-oss:20b", "ollama/gemma4:12b", "openai/gpt-6"]);
        expect(sources.asked[0]).toBe("http://127.0.0.1:11434/api/tags");
    });

    it("rings its doorbell with the line alone, which the plugin sends to the chat; nothing when it does not ring", async () => {
        expect(hookAnswer("opencode", true)).toBe(bellLine);
        expect(hookAnswer("opencode", false)).toBeUndefined();
        expect(hasDoorbell("opencode")).toBe(true);

        const folder = temporary();
        const page = await fakePage(folder);
        const input = { cwd: folder, session_id: "ses_1", hook_event_name: "Stop" };

        page.answer("ring");
        expect(await listening(input)).toEqual({ code: 0, stdout: `${bellLine}\n` });
        page.answer("dismissed");
        expect(await listening(input)).toEqual({ code: 0, stdout: "" });
    }, 30_000);

    it("stops waiting once the OpenCode that started it is gone, as when its terminal closes, saying nothing", async () => {
        const folder = temporary();
        const page = await fakePage(folder);
        page.answer("hold");
        const opencode = spawn(process.execPath, ["-e", "setTimeout(() => {}, 1000)"]);
        const listened = listening({ cwd: folder, session_id: "ses_1", hook_event_name: "Stop", host_pid: opencode.pid });

        expect(await listened).toEqual({ code: 0, stdout: "" });
        expect(readFileSync(join(folder, "listen.log"), "utf8")).toContain(`its host, pid ${opencode.pid}, is gone\n`);
    }, 30_000);

    it("signs the moves with the model of the session's step, as the plugin notes it, and names the AI OpenCode", async () => {
        const folder = temporary();
        const client = { name: "opencode", title: "OpenCode" };
        writeFileSync(join(folder, "opencode-model.json"), `${JSON.stringify({ session: "ses_1", model: "ollama/gemma4:12b" })}\n`);

        expect(await callerOf({ "ai.opencode/sessionID": "ses_1" }, client, folder, 0)).toEqual({ annotator: "ollama/gemma4:12b" });
        // Another session's note is not this one's.
        expect(await callerOf({ "ai.opencode/sessionID": "ses_2" }, client, folder, 0)).toEqual({ annotator: "OpenCode", hostOnly: true });
        expect(aiNameOf("opencode")).toBe("OpenCode");
        expect(aiNameOf("opencode", "ollama/gemma4:12b")).toBe("OpenCode");
    });
});

describe("Chesspal's plugin for OpenCode", () => {
    it("notes each chat's start, waits for the player after each turn, wakes the chat with the doorbell's line, and lets the wait go when a turn starts", async () => {
        const folder = temporary();
        const opencode = fakeOpenCode(folder);
        const started = await (await plugin()).setup(opencode.context, opencode.run);

        // The player's first message: a chat starts.
        await opencode.send("session.inbox.enqueued", { sessionID: "ses_1", item: { type: "user", payload: { text: "Giochiamo!" } } });
        await opencode.send("session.execution.started", { sessionID: "ses_1" });
        expect(opencode.hooks()).toEqual([{ command: "chesspal chat", input: { cwd: folder, session_id: "ses_1", source: "startup" }, cwd: folder, shell: true }]);

        // Each step notes its model.
        await opencode.send("session.step.started", { sessionID: "ses_1", agent: "build", model: { id: "gemma4:12b", providerID: "ollama" } });
        expect(JSON.parse(readFileSync(join(folder, "opencode-model.json"), "utf8"))).toEqual({ session: "ses_1", model: "ollama/gemma4:12b" });

        // The turn ends: the doorbell waits, and its line becomes the player's message.
        await opencode.send("session.execution.succeeded", { sessionID: "ses_1" });
        const first = opencode.children.at(-1)!;
        expect(opencode.hooks().at(-1)).toMatchObject({ command: "chesspal listen --opencode", input: { cwd: folder, session_id: "ses_1", hook_event_name: "Stop" } });
        first.ends(0, `${bellLine}\n`);
        expect(opencode.prompts).toEqual([{ sessionID: "ses_1", text: bellLine }]);

        // Its own message starts the next turn; the turn after waits again, and a message of the player's lets that wait go, with no message sent.
        await opencode.send("session.inbox.enqueued", { sessionID: "ses_1", item: { type: "user", payload: { text: bellLine } } });
        expect(first.killed).toBe(false);
        await opencode.send("session.execution.started", { sessionID: "ses_1" });
        await opencode.send("session.execution.succeeded", { sessionID: "ses_1" });
        const second = opencode.children.at(-1)!;
        expect(second).not.toBe(first);
        expect(second.killed).toBe(false);
        await opencode.send("session.inbox.enqueued", { sessionID: "ses_1", item: { type: "user", payload: { text: "Why?" } } });
        expect(second.killed).toBe(true);
        second.ends(null, "");
        expect(opencode.prompts).toHaveLength(1);

        // A turn stopped by the player waits for nobody.
        await opencode.send("session.execution.started", { sessionID: "ses_1" });
        await opencode.send("session.execution.interrupted", { sessionID: "ses_1" });
        expect(opencode.children.at(-1)).toBe(second);

        // A turn that fails is noted, and still waits for the player's move.
        await opencode.send("session.execution.started", { sessionID: "ses_1" });
        await opencode.send("session.execution.failed", { sessionID: "ses_1", error: { name: "APIError", data: { message: "model not found" } } });
        const failed = opencode.children.at(-1)!;
        expect(opencode.hooks().at(-1)).toMatchObject({ command: "chesspal listen --opencode", input: { session_id: "ses_1" } });
        expect(readFileSync(join(folder, "listen.log"), "utf8")).toMatch(/plugin opencode the chat ses_1 failed its turn: model not found\n$/);

        // /new starts a session never seen, a chat cleared: the wait of the chat before goes, so that a move cannot wake it.
        await opencode.send("session.inbox.enqueued", { sessionID: "ses_2", item: { type: "user", payload: { text: "Ciao" } } });
        expect(failed.killed).toBe(true);
        expect(opencode.hooks().at(-1)).toEqual({ command: "chesspal chat", input: { cwd: folder, session_id: "ses_2", source: "clear" }, cwd: folder, shell: true });

        // A subagent's session, born with its parent's, is no chat: no start noted, nobody waits after its turn.
        const before = opencode.hooks().length;
        await opencode.send("session.created", { sessionID: "ses_agent", parentID: "ses_2" });
        await opencode.send("session.inbox.enqueued", { sessionID: "ses_agent", item: { type: "user", payload: { text: "what is 2+2" } } });
        await opencode.send("session.execution.succeeded", { sessionID: "ses_agent" });
        expect(opencode.hooks()).toHaveLength(before);

        // OpenCode letting the plugin go ends the waits still on.
        await opencode.send("session.execution.succeeded", { sessionID: "ses_2" });
        const third = opencode.children.at(-1)!;
        started();
        expect(third.killed).toBe(true);
    });

    it("leaves alone the chats of other folders, which OpenCode's background service tells it of too", async () => {
        const folder = temporary();
        const opencode = fakeOpenCode(folder);
        await (await plugin()).setup(opencode.context, opencode.run);

        // A chat of this folder waits for the player after its turn.
        await opencode.send("session.inbox.enqueued", { sessionID: "ses_here", item: { type: "user", payload: { text: "Giochiamo!" } } });
        await opencode.send("session.execution.started", { sessionID: "ses_here" });
        await opencode.send("session.execution.succeeded", { sessionID: "ses_here" });
        const waiting = opencode.children.at(-1)!;
        const before = opencode.hooks().length;

        // One of another folder notes no start, lets no wait go, waits for nobody and signs nothing.
        const elsewhere = join(folder, "..", `${basename(folder)}-other`);
        await opencode.send("session.created", { sessionID: "ses_there", location: { directory: elsewhere } }, elsewhere);
        await opencode.send("session.inbox.enqueued", { sessionID: "ses_there", item: { type: "user", payload: { text: "Ciao" } } }, elsewhere);
        await opencode.send("session.execution.started", { sessionID: "ses_there" });
        await opencode.send("session.step.started", { sessionID: "ses_there", model: { id: "gemma4:12b", providerID: "ollama" } }, elsewhere);
        await opencode.send("session.execution.succeeded", { sessionID: "ses_there" });
        expect(opencode.hooks()).toHaveLength(before);
        expect(waiting.killed).toBe(false);
        expect(existsSync(join(folder, "opencode-model.json"))).toBe(false);

        // A session OpenCode places in this folder by another spelling is its own.
        if (process.platform === "win32") {
            await opencode.send("session.inbox.enqueued", { sessionID: "ses_case", item: { type: "user", payload: { text: "Ciao" } } }, folder.toUpperCase());
            expect(opencode.hooks().at(-1)).toMatchObject({ command: "chesspal chat", input: { session_id: "ses_case", source: "clear" } });
        }
    });

    it("never stops OpenCode: a hook that cannot start, or a chat that cannot be woken, is noted in listen.log", async () => {
        const folder = temporary();
        const opencode = fakeOpenCode(folder, () => {
            throw new Error("no shell");
        });
        await (await plugin()).setup({ ...opencode.context, session: { prompt: () => Promise.reject(new Error("closed")) } }, opencode.run);

        await opencode.send("session.inbox.enqueued", { sessionID: "ses_1", item: { type: "user", payload: { text: "Ciao" } } });
        await opencode.send("session.execution.succeeded", { sessionID: "ses_1" });
        expect(readFileSync(join(folder, "listen.log"), "utf8")).toMatch(/plugin opencode chesspal chat did not start: no shell\n.*plugin opencode chesspal listen --opencode did not start: no shell\n$/);
    });

    it("notes in listen.log when OpenCode's events end without OpenCode letting it go", async () => {
        const folder = temporary();
        const opencode = fakeOpenCode(folder);
        const ended = {
            ...opencode.context,
            event: {
                subscribe: () => ({
                    async *[Symbol.asyncIterator]()
                    {},
                }),
            },
        };
        await (await plugin()).setup(ended, opencode.run);
        await settled();

        expect(readFileSync(join(folder, "listen.log"), "utf8")).toMatch(/plugin opencode stopped hearing OpenCode's events\n$/);
    });
});

interface PluginContext
{
    location: { directory: string; };
    event: { subscribe(options: { signal: AbortSignal; }): AsyncIterable<unknown>; };
    session: { prompt(message: { sessionID: string; text: string; }): Promise<unknown>; };
}

type Run = (command: string, options: { cwd: string; shell: boolean; }) => FakeChild;

/** The plugin as OpenCode loads it from the player's folder. */
async function plugin(): Promise<{ setup(context: PluginContext, run: Run): Promise<() => void>; }>
{
    const module = await import(pathToFileURL(join(import.meta.dirname, "..", "plugins", "opencode.js")).href) as { default: { setup(context: PluginContext, run: Run): Promise<() => void>; }; };
    return module.default;
}

/** A hook the plugin starts: what it was given on stdin, and how the test ends it. */
class FakeChild extends EventEmitter
{
    readonly stdout = new EventEmitter();
    readonly stderr = new EventEmitter();
    readonly stdin = { end: (text: string) => (this.input = JSON.parse(text) as unknown), on: () => undefined };
    readonly pid = undefined;
    readonly command: string;
    readonly options: { cwd: string; shell: boolean; };
    input: unknown;
    killed = false;

    constructor(command: string, options: { cwd: string; shell: boolean; })
    {
        super();
        this.command = command;
        this.options = options;
    }

    kill(): void
    {
        this.killed = true;
    }

    ends(code: number | null, output: string): void
    {
        this.stdout.emit("data", output);
        this.emit("close", code);
    }
}

/** OpenCode as the plugin sees it: the folder, its events as the test sends them, the messages the plugin sends, and the hooks it starts. */
function fakeOpenCode(folder: string, start?: () => void): {
    context: PluginContext;
    run: Run;
    send(type: string, data: object, directory?: string): Promise<void>;
    children: FakeChild[];
    prompts: object[];
    hooks(): object[];
}
{
    const events: unknown[] = [];
    let wake = (): void => undefined;
    const children: FakeChild[] = [];
    const prompts: object[] = [];

    const subscribe = ({ signal }: { signal: AbortSignal; }): AsyncIterable<unknown> => ({
        async *[Symbol.asyncIterator]()
        {
            while (!signal.aborted) {
                if (events.length === 0) {
                    await new Promise<void>((done) => {
                        wake = done;
                        signal.addEventListener("abort", () => done(), { once: true });
                    });
                }

                while (events.length > 0) {
                    yield events.shift();
                }
            }
        },
    });

    return {
        context: { location: { directory: folder }, event: { subscribe }, session: { prompt: (message) => Promise.resolve(prompts.push(message)) } },
        run: (command, options) => {
            start?.();
            const child = new FakeChild(command, options);
            children.push(child);
            return child;
        },
        // As OpenCode's events, which say the session's folder but for a turn's start and end and its tokens.
        send: async (type, data, directory = folder) => {
            const placed = !type.startsWith("session.execution.") && type !== "session.usage.updated";
            events.push(placed ? { type, location: { directory }, data } : { type, data });
            wake();
            await settled();
        },
        children,
        prompts,
        hooks: () => children.map((child) => ({ command: child.command, input: child.input, cwd: child.options.cwd, shell: child.options.shell })),
    };
}

/** The sources of OpenCode's models as the test gives them: Ollama's answers, `opencode models`, a home of its own; the addresses asked. */
function modelSources(given: Partial<ModelSources> = {}): ModelSources & { asked: string[]; }
{
    const asked: string[] = [];
    const run: RunProgram = (_program, args) => Promise.resolve(args[0] === "models" ? listed : "");

    const fetch: Fetch = (address, init) => {
        const url = String(address);
        asked.push(url);

        if (url.endsWith("/api/tags")) {
            return Promise.resolve(Response.json({ models: Object.keys(ollama).map((name) => ({ name })) }));
        }

        const { model } = JSON.parse(String(init?.body)) as { model: string; };
        return Promise.resolve(Response.json({ capabilities: ollama[model] ?? [] }));
    };

    return { run, fetch, userHome: temporary(), env: {}, ...given, asked };
}

function writeState(home: string, value: object): void
{
    mkdirSync(join(home, ".local", "state", "opencode"), { recursive: true });
    writeFileSync(join(home, ".local", "state", "opencode", "model.json"), JSON.stringify(value));
}

/** A board page of the folder as the doorbell finds it, which answers the hook's wait as the test says, or holds it with "hold". */
async function fakePage(folder: string): Promise<{ answer(said: string): void; }>
{
    let said = "ring";
    const server = createServer((request, response) => {
        if (request.url === "/api/bell?probe") {
            response.end(JSON.stringify({ session: null, folder: resolve(folder), open: true, version }));
        } else if (said !== "hold") {
            response.end(said);
        }
    });
    servers.push(server);

    for (const port of pagePorts(folder)) {
        const listened = await new Promise<boolean>((done) => {
            server.once("error", () => done(false));
            server.listen(port, "127.0.0.1", () => done(true));
        });

        if (listened) {
            break;
        }
    }

    return {
        answer: (text) => {
            said = text;
        },
    };
}

/** `chesspal listen --opencode` as the plugin runs it: what it wrote on stdout, and its exit code. */
function listening(input: object): Promise<{ code: number | null; stdout: string; }>
{
    const cli = join(import.meta.dirname, "..", "src", "cli", "cli.ts");
    const child = spawn(process.execPath, ["--experimental-strip-types", "--no-warnings", cli, "listen", "--opencode"]);
    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += String(chunk)));
    child.stdin.end(JSON.stringify(input));
    return new Promise((done) => child.on("exit", (code) => done({ code, stdout })));
}

function openCode<Host extends { name: string; }>(hosts: readonly Host[]): Host
{
    return hosts.find((host) => host.name === "opencode")!;
}

function settled(): Promise<void>
{
    return new Promise((done) => setTimeout(done, 10));
}

function homeContext(platform: string = process.platform): Context & { now: () => Date; }
{
    return { ...testContext(temporary()), platform, now: () => new Date() };
}

function temporary(): string
{
    const folder = mkdtempSync(join(tmpdir(), "chesspal-opencode-"));
    folders.push(folder);
    return folder;
}
