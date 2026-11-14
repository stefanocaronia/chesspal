import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { recordChatStart } from "../src/cli/chat-hook.ts";
import { aiNameOf } from "../src/core/index.ts";
import { lastChatStart } from "../src/games/index.ts";
import { hasDoorbell } from "../src/host-files/index.ts";
import { watchNewTurn } from "../src/server/bell/antigravity.ts";
import { antigravityBellAnswer, bellLine, codexBellAnswer, hookAnswer } from "../src/server/bell/bell.ts";
import { callerOf } from "../src/server/mcp/caller.ts";
import { pagePorts } from "../src/server/ports/index.ts";
import { version } from "../src/version.ts";
import { removeFolder } from "./folders.ts";

const folders: string[] = [];
const servers: Server[] = [];

afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise((done) => server.close(done))));
    await Promise.all(folders.splice(0).map(removeFolder));
});

describe("Antigravity, the third host (D-115)", () => {
    it("notes how each conversation starts, in the folder its input names, since it runs the hook in .agents", async () => {
        const folder = scratch();
        const transcript = "C:/Users/ann/.gemini/antigravity-cli/brain/conv-1/.system_generated/logs/transcript_full.jsonl";
        const input = { conversationId: "conv-1", cwd: folder, hookEventName: "SessionStart", modelName: "gemini-3.8-flash-medium", transcriptPath: transcript };
        await recordChatStart(Readable.from([JSON.stringify(input)]), join(folder, ".agents"), new Date("2026-11-14T10:00:00.000Z"));

        expect(lastChatStart(folder)).toEqual({ source: "startup", at: "2026-11-14T10:00:00.000Z", session: "conv-1", transcript });
    });

    it("hears the doorbell, and wakes the chat with its Stop hook's answer, the line as a system message", () => {
        expect(hasDoorbell("antigravity-client")).toBe(true);
        expect(JSON.parse(antigravityBellAnswer)).toEqual({ decision: "continue", reason: bellLine });
        expect(hookAnswer("antigravity", true)).toBe(antigravityBellAnswer);
        // Its Stop hook reads an answer even when the chat may stop.
        expect(hookAnswer("antigravity", false)).toBe("{}");
        expect(hookAnswer("codex", true)).toBe(codexBellAnswer);
        expect(hookAnswer("codex", false)).toBeUndefined();
        expect(hookAnswer("claude", true)).toBe(bellLine);
        expect(hookAnswer("claude", false)).toBeUndefined();
    });

    it("sees the player start a new turn in the conversation its hook holds: a message or a command typed, or Esc in its log", async () => {
        const folder = scratch();
        const history = join(folder, "history.jsonl");
        const log = join(folder, "cli.log");
        writeFileSync(history, `${JSON.stringify({ display: "Before", conversationId: "conv-1" })}\n`);
        writeFileSync(log, "I1114 12:15:46.881799 986 server.go:2504] Cancelling conversation conv-1 (killBackgroundTasks=false)\n");

        // What came before the hook started, or for another conversation, is no new turn.
        const typed = watchNewTurn("conv-1", folder, 5);
        appendFileSync(history, `${JSON.stringify({ display: "Hi", conversationId: "conv-2" })}\n`);
        expect(await soon(typed.started)).toBe(false);
        appendFileSync(history, `${JSON.stringify({ display: "/clear", conversationId: "conv-1", type: "slash_command" })}\n`);
        expect(await soon(typed.started)).toBe(true);

        const stopped = watchNewTurn("conv-1", folder, 5);
        appendFileSync(log, "I1114 12:16:26.154037 2054 conversation_manager.go:1880] Cancelling in-progress response for conversation conv-2\n");
        expect(await soon(stopped.started)).toBe(false);
        appendFileSync(log, "I1114 12:17:13.575385 2968 server.go:2504] Cancelling conversation conv-1 (killBackgroundTasks=false)\n");
        expect(await soon(stopped.started)).toBe(true);

        // A history written anew is read from its start.
        const anew = watchNewTurn("conv-1", folder, 5);
        writeFileSync(history, `${JSON.stringify({ display: "e4", conversationId: "conv-1" })}\n`);
        expect(await soon(anew.started)).toBe(true);
    });

    it("lets the chat go when the player writes in it while the hook waits, and wakes it when the player acts on the page", async () => {
        const folder = scratch();
        const home = scratch();
        const agy = join(home, ".gemini", "antigravity-cli");
        mkdirSync(agy, { recursive: true });
        const page = await fakePage(folder);
        const input = { conversationId: "conv-1", cwd: folder, hookEventName: "Stop", modelName: "gemini-3.8-flash-medium" };

        const written = listening(input, home);
        await page.waiting();
        appendFileSync(join(agy, "history.jsonl"), `${JSON.stringify({ display: "Why?", conversationId: "conv-1" })}\n`);
        expect(await written).toEqual({ code: 0, stdout: "{}\n" });

        const rung = listening(input, home);
        await page.waiting();
        page.ring();
        expect(await rung).toEqual({ code: 0, stdout: `${antigravityBellAnswer}\n` });

        // The log keeps each hook's start and end, the bell too.
        const logged = readFileSync(join(folder, "listen.log"), "utf8").trimEnd().split("\n").map((line) => line.slice(line.indexOf(" ") + 1));
        expect(logged).toEqual(["waiting", "the player started a new turn", "waiting", "rang"]);
    }, 30_000);

    it("signs the AI's moves with the model and effort of the conversation's transcript, which the call names", async () => {
        const folder = scratch();
        const brain = join(folder, "brain", "conv-1");
        const logs = join(brain, ".system_generated", "logs");
        mkdirSync(logs, { recursive: true });
        const antigravity = { name: "antigravity-client" };
        const meta = { "antigravity.google/artifacts_dir": brain, "antigravity.google/conversation_id": "conv-1" };
        const step = (model: string, tool?: string) => JSON.stringify({ source: "MODEL", type: "PLANNER_RESPONSE", model, ...(tool === undefined ? {} : { tool_calls: [{ name: "call_mcp_tool", args: { ToolName: tool } }] }) });
        writeFileSync(join(logs, "transcript_full.jsonl"), [step("gemini-3.8-flash-high", "status"), JSON.stringify({ source: "MODEL", type: "GENERIC", content: "ok" })].join("\n") + "\n");

        expect(await callerOf(meta, antigravity, folder, 0)).toEqual({ annotator: "gemini-3.8-flash", effort: "high" });
        appendFileSync(join(logs, "transcript_full.jsonl"), `${step("claude-sonnet-4-6")}\n`);
        expect(await callerOf(meta, antigravity, folder, 0)).toEqual({ annotator: "claude-sonnet-4-6" });
        // A conversation with no step written yet: the host's name alone.
        expect(await callerOf({ "antigravity.google/artifacts_dir": join(folder, "none") }, antigravity, folder, 0)).toEqual({ annotator: "antigravity-client", hostOnly: true });
    });

    it("names the AI Gemini, or by its model when that is another", () => {
        expect(aiNameOf("antigravity-client")).toBe("Gemini");
        expect(aiNameOf("antigravity-client", "gemini-3.8-flash")).toBe("Gemini");
        expect(aiNameOf("antigravity-client", "claude-sonnet-4-6")).toBe("Claude");
        expect(aiNameOf("antigravity-client", "gpt-oss-120b")).toBe("Antigravity");
    });
});

/**
 * A board page of the folder as the hook finds it: it says whose it is, and holds the hook's wait until it rings. `waiting` waits for one more hook than
 * it has seen: the close of a hook that has ended may come after its process's exit, and its wait is no new one.
 */
async function fakePage(folder: string): Promise<{ waiting: () => Promise<void>; ring: () => void; }>
{
    let hook: ServerResponse | undefined;
    let hooks = 0;
    let seen = 0;
    let arrived = (): void => undefined;
    const server = createServer((request, response) => {
        if (request.url === "/api/bell?probe") {
            response.end(JSON.stringify({ session: null, folder: resolve(folder), open: true, version }));
            return;
        }

        hook = response;
        hooks += 1;
        arrived();
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
        waiting: async () => {
            seen += 1;

            if (hooks < seen) {
                await new Promise<void>((done) => (arrived = () => hooks >= seen && done()));
            }
        },
        ring: () => hook?.end("ring"),
    };
}

/** `chesspal listen --antigravity` as Antigravity's Stop hook runs it, with the user's home given: what it answered, and its exit code. */
function listening(input: object, home: string): Promise<{ code: number | null; stdout: string; }>
{
    const cli = join(import.meta.dirname, "..", "src", "cli", "cli.ts");
    const child = spawn(process.execPath, ["--experimental-strip-types", "--no-warnings", cli, "listen", "--antigravity"], { env: { ...process.env, HOME: home, USERPROFILE: home } });
    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += String(chunk)));
    child.stdin.end(JSON.stringify(input));
    return new Promise((done) => child.on("exit", (code) => done({ code, stdout })));
}

/** Whether the promise settles within a few of the watch's turns. */
function soon(promise: Promise<void>): Promise<boolean>
{
    return Promise.race([promise.then(() => true), new Promise<boolean>((done) => setTimeout(() => done(false), 200))]);
}

function scratch(): string
{
    const folder = mkdtempSync(join(tmpdir(), "chesspal-antigravity-"));
    folders.push(folder);
    return folder;
}
