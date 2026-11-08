import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { saveChatStart } from "../src/games/index.ts";
import { allowedCaller, callerOf, callingAgent } from "../src/server/caller.ts";

const folders: string[] = [];

afterEach(() => {
    for (const folder of folders.splice(0)) {
        rmSync(folder, { recursive: true, force: true });
    }
});

describe("who makes a tool call (D-81, T-113)", () => {
    it("takes Codex's model and effort from the call's metadata, given as an object or as JSON", async () => {
        const folder = scratch();
        const codex = { name: "codex-mcp-client", title: "Codex" };

        expect(await callerOf({ "x-codex-turn-metadata": { model: "gpt-6-luna", reasoning_effort: "low" } }, codex, folder, 0)).toEqual({ annotator: "gpt-6-luna", effort: "low" });
        expect(await callerOf({ "x-codex-turn-metadata": JSON.stringify({ model: "gpt-6-luna" }) }, codex, folder, 0)).toEqual({ annotator: "gpt-6-luna" });
    });

    it("finds Claude Code's model and effort on the transcript's line of the call, in the chat's file or a subagent's", async () => {
        const folder = scratch();
        const transcript = join(folder, "session.jsonl");
        writeFileSync(transcript, [line("toolu_1", "claude-opus-5-5", "xhigh"), JSON.stringify({ type: "user", message: { content: "toolu_2" } })].join("\n") + "\n");
        mkdirSync(join(folder, "session", "subagents"), { recursive: true });
        writeFileSync(join(folder, "session", "subagents", "agent-a.jsonl"), line("toolu_2", "claude-haiku-5-5", "low") + "\n");
        saveChatStart(folder, { source: "startup", at: "2026-11-06T10:00:00.000Z", transcript });
        const claude = { name: "claude-code", title: "Claude Code" };

        expect(await callerOf({ "claudecode/toolUseId": "toolu_1" }, claude, folder, 0)).toEqual({ annotator: "claude-opus-5-5", effort: "xhigh" });
        expect(await callerOf({ "claudecode/toolUseId": "toolu_2" }, claude, folder, 0)).toEqual({ annotator: "claude-haiku-5-5", effort: "low" });
    });

    it("tells a call of the chat's from one of its agents', by the type Claude Code notes beside the agent's file, and nobody when it cannot tell (Priya, review of T-112)", async () => {
        const folder = scratch();
        const transcript = join(folder, "session.jsonl");
        const agents = join(folder, "session", "subagents");
        writeFileSync(transcript, line("toolu_1", "claude-opus-5-5", "xhigh") + "\n");
        mkdirSync(agents, { recursive: true });
        writeFileSync(join(agents, "agent-a.jsonl"), line("toolu_2", "claude-opus-5-5", "xhigh") + "\n");
        writeFileSync(join(agents, "agent-a.meta.json"), JSON.stringify({ agentType: "chesspal-coach", requestShape: "background" }));
        writeFileSync(join(agents, "agent-b.jsonl"), line("toolu_3", "claude-opus-5-5", "xhigh") + "\n");
        const by = (call: string | undefined) => callingAgent(call === undefined ? undefined : { "claudecode/toolUseId": call }, folder, 0);

        expect(await by("toolu_1")).toBeUndefined();
        saveChatStart(folder, { source: "startup", at: "2026-11-08T10:00:00.000Z", transcript });
        expect(await by("toolu_1")).toEqual({ chat: true });
        expect(await by("toolu_2")).toEqual({ agent: "chesspal-coach" });
        expect(await by("toolu_3")).toBeUndefined();
        expect(await by("toolu_9")).toBeUndefined();
        expect(await by(undefined)).toBeUndefined();

        expect(allowedCaller({ agent: "chesspal-coach" }, ["chesspal-coach"])).toBe(true);
        expect(allowedCaller({ agent: "general-purpose" }, ["chesspal-coach"])).toBe(false);
        expect(allowedCaller({ chat: true }, ["chesspal-coach"])).toBe(false);
        expect(allowedCaller(undefined, ["chesspal-coach"])).toBe(true);
    });

    it("names the host when nothing ties a model to the call, and nobody without a host", async () => {
        const folder = scratch();

        expect(await callerOf({ "claudecode/toolUseId": "toolu_9" }, { name: "claude-code", title: "Claude Code" }, folder, 0)).toEqual({ annotator: "Claude Code", hostOnly: true });
        expect(await callerOf(undefined, { name: "gemini-cli-mcp-client" }, folder, 0)).toEqual({ annotator: "gemini-cli-mcp-client", hostOnly: true });
        expect(await callerOf(undefined, undefined, folder, 0)).toBeUndefined();
    });
});

function line(call: string, model: string, effort: string): string
{
    return JSON.stringify({ type: "assistant", message: { model, content: [{ type: "tool_use", id: call, name: "mcp__chesspal__annotate_game" }] }, effort });
}

function scratch(): string
{
    const folder = mkdtempSync(join(tmpdir(), "chesspal-"));
    folders.push(folder);
    return folder;
}
