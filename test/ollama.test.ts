import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ollamaTroubleOf } from "../src/page/table/action.ts";
import { terminalChats } from "../src/server/table/hosts/chats.ts";
import { ollamaState, ollamaWatch } from "../src/server/table/hosts/ollama.ts";
import type { Fetch } from "../src/sites/index.ts";
import { testContext } from "./commands.ts";
import { removeFolder } from "./folders.ts";

const folders: string[] = [];

afterEach(async () => {
    await Promise.all(folders.splice(0).map(removeFolder));
});

// What Ollama's /api/ps gives: the models it has loaded, with the context each runs with.
const loaded = { models: [{ name: "gemma4:12b", context_length: 4096 }, { name: "gpt-oss:20b", context_length: 65536 }, { name: "old:1b" }] };

describe("Ollama, which plays OpenCode's free models (D-117)", () => {
    it("says whether Ollama answers, and the context of each model it has loaded", async () => {
        expect(await ollamaState(answering(loaded), {})).toEqual({ answering: true, contexts: { "gemma4:12b": 4096, "gpt-oss:20b": 65536 } });
        expect(await ollamaState(() => Promise.reject(new Error("refused")), {})).toEqual({ answering: false, contexts: {} });
        expect(await ollamaState(() => Promise.resolve(new Response("", { status: 500 })), {})).toEqual({ answering: false, contexts: {} });
    });

    it("asks Ollama from the first look on, every ten seconds, and tells the watchers only when what it says changes", async () => {
        vi.useFakeTimers();
        let up = true;
        const asked: string[] = [];

        const fetch: Fetch = (address) => {
            asked.push(String(address));
            return up ? Promise.resolve(Response.json(loaded)) : Promise.reject(new Error("refused"));
        };

        const watch = ollamaWatch(fetch, { OLLAMA_HOST: "127.0.0.1:11500" });
        let told = 0;
        watch.watch(() => told++);

        try {
            await vi.advanceTimersByTimeAsync(30_000);
            expect(asked).toEqual([]);
            expect(watch.state()).toBeUndefined();

            watch.look();
            watch.look();
            await vi.advanceTimersByTimeAsync(0);
            expect(asked).toEqual(["http://127.0.0.1:11500/api/ps"]);
            expect(watch.state()?.answering).toBe(true);
            expect(told).toBe(1);

            // Nobody asks meanwhile: Ollama stops, and the table finds it out by itself.
            await vi.advanceTimersByTimeAsync(10_000);
            expect(asked).toHaveLength(2);
            expect(told).toBe(1);

            up = false;
            await vi.advanceTimersByTimeAsync(10_000);
            expect(watch.state()).toEqual({ answering: false, contexts: {} });
            expect(told).toBe(2);
        } finally {
            vi.useRealTimers();
        }
    });

    it("is looked at by the table only where OpenCode is installed", async () => {
        const fetch = answering(loaded);
        const context = { ...testContext(temporary()), platform: process.platform, fetch };
        expect(terminalChats(context, ["node", "cli.js"], { PATH: temporary() }).ollama?.()).toBeUndefined();

        const bin = temporary();
        writeFileSync(join(bin, process.platform === "win32" ? "opencode.exe" : "opencode"), "");
        const chats = terminalChats(context, ["node", "cli.js"], { PATH: bin, PATHEXT: ".EXE" }, { run: () => Promise.reject(new Error("no program")) });
        chats.ollama?.();
        await settled();
        expect(chats.ollama?.()).toEqual({ answering: true, contexts: { "gemma4:12b": 4096, "gpt-oss:20b": 65536 } });
    });

    it("tells the page what stops a model of Ollama's: Ollama off, or a context under 32k; nothing for another model", () => {
        const state = { answering: true, contexts: { "gemma4:12b": 4096, "gpt-oss:20b": 65536 } };
        expect(ollamaTroubleOf(state, "ollama/gemma4:12b")).toBe(4096);
        expect(ollamaTroubleOf(state, "ollama/gpt-oss:20b")).toBeUndefined();
        // A model Ollama has not loaded yet runs with a context nobody knows.
        expect(ollamaTroubleOf(state, "ollama/qwen3-coder:30b")).toBeUndefined();
        expect(ollamaTroubleOf({ answering: false, contexts: {} }, "ollama/gpt-oss:20b")).toBe("off");
        expect(ollamaTroubleOf({ answering: false, contexts: {} }, "google/gemini-4-hydrogen")).toBeUndefined();
        expect(ollamaTroubleOf(undefined, "ollama/gpt-oss:20b")).toBeUndefined();
        expect(ollamaTroubleOf(state, undefined)).toBeUndefined();
    });
});

function answering(body: object): Fetch
{
    return () => Promise.resolve(Response.json(body));
}

function settled(): Promise<void>
{
    return new Promise((done) => setTimeout(done, 10));
}

function temporary(): string
{
    const folder = mkdtempSync(join(tmpdir(), "chesspal-ollama-"));
    folders.push(folder);
    return folder;
}
