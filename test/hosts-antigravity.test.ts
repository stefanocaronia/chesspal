import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { type ChatOptions, type ChatServer, hostDriver, type HostEvent, openHostChat, type ToolKind } from "../src/hosts/index.ts";
import { checklist, type Scenario } from "./hosts/checklist.ts";
import { fakeAgent, type FakeAgentOptions, isModelSetting, isPrompt, joinedTexts, promptWords } from "./hosts/fake-agent.ts";
import { type FakeHost, type FlowEntry, listen, loadFlow, manualClock, turnEnds } from "./hosts/fake-host.ts";
import { makeTempFolder, removeTempFolders } from "./hosts/temp.ts";

afterAll(removeTempFolders);

type Message = Record<string, unknown>;

// No session of Antigravity was recorded, only its handshake (agy 1.5.14): the flows here are that handshake, then sessions in the protocol's shapes, its
// models listed apart from the options of configuration, as the protocol's models field has them.
const handshake = loadFlow("antigravity/handshake");
const folder = "/players/test";
const model = "gemini-3-pro";
const session = "agy-session-1";

checklist({
    host: "Antigravity",
    open: (scenario) => {
        const flow = flows[scenario]();
        const resumed = scenario === "resumed" ? session : undefined;
        const { chat, host } = open(flow, { allowed: scenario === "refused" ? ["read"] : ["chesspal", "read"], ...(resumed === undefined ? {} : { session: resumed }) });
        return { chat, host, turns: promptWords(flow), texts: joinedTexts(flow), ...(resumed === undefined ? {} : { session: resumed }), interruptTurn: 0 };
    },
    isModelRequest: isModelSetting,
    isPlayerWords: isPrompt,
});

describe("the chat in Antigravity", () => {
    it("starts as agy acp after its own arguments, in the chat's folder, and passes no MCP server: the player's own gives chesspal", async () => {
        const { host, until } = play(flows.prose());
        await until(() => host.written.length >= 3);
        expect(host.started?.args).toEqual(["--first", "acp"]);
        expect(host.started?.options.cwd).toBe(folder);
        expect(host.written[1]).toMatchObject({ method: "session/new", params: { cwd: folder, mcpServers: [] } });
    });

    it("plays the handshake as recorded, then sets the model by the protocol's own call before the player's words", async () => {
        const { chat, host, events, until } = play(flows.prose());
        chat.send("Hello");
        await until(() => turnEnds(events).length === 1);
        expect(host.written.map((message) => message.method)).toEqual(["initialize", "session/new", "session/set_model", "session/prompt"]);
        expect(host.written[2]!.params).toEqual({ sessionId: session, modelId: model });
        expect(events[0]).toEqual({ type: "session", session, model, efforts: [] });
        expect(host.problems).toEqual([]);
    });

    it("takes a chat up with session/load, which replays nothing, and sets the model again", async () => {
        const { chat, host, events, until } = play(flows.resumed(), { session });
        chat.send("Again");
        await until(() => turnEnds(events).length === 1);
        expect(host.written.map((message) => message.method)).toEqual(["initialize", "session/load", "session/set_model", "session/prompt"]);
        expect(host.written[1]!.params).toEqual({ cwd: folder, mcpServers: [], sessionId: session });
        expect(events.filter((event) => event.type === "text").map((event) => event.type === "text" && event.text).join("")).toBe("Welcome back.");
    });

    it("ends the chat with the agent's words when it does not take the model", async () => {
        const { chat, events, until } = play(flows.prose(), {}, { failing: ["session/set_model"] });
        chat.send("Hello");
        await until(() => events.some((event) => event.type === "ended"));
        expect(events.at(-1)).toEqual({ type: "ended", why: `the host did not take the model ${model}: session/set_model failed` });
    });

    it("never sends words while a turn runs, which the agent would take to steer it: the next words wait for the turn's end", async () => {
        const { chat, host, events, until } = play(flows.prose());
        chat.send("Hello");
        await until(() => host.written.some(isPrompt));
        expect(chat.send("And also this")).toBe(false);
        await until(() => turnEnds(events).length === 1);
        expect(host.written.filter(isPrompt)).toHaveLength(1);
    });

    it("reads its own tools by name, a command of chesspal by every name a host gives it, and other tools by the protocol's kinds, which a name never overrides where they act", async () => {
        const inside = [{ path: join(folder, "game.json") }];
        const tools = [
            call("c1", { title: "chesspal: status", kind: "other" }),
            call("c2", { name: "mcp__chesspal__roll", kind: "other" }),
            call("c3", { name: "chesspal_scene", kind: "other" }),
            call("c4", { title: "Read game.json", kind: "read", locations: inside }),
            call("c5", { title: "Fetch a page", kind: "fetch" }),
            call("c6", { name: "call_mcp_tool", kind: "other", rawInput: { ServerName: "chesspal", ToolName: "advance" } }),
            call("c7", { name: "read_file", kind: "read", rawInput: { Path: "C:\\Users\\player\\.gemini\\antigravity-cli\\mcp\\chesspal\\advance.json" } }),
            call("c8", { name: "read_file", kind: "other", rawInput: { Path: join(folder, "game.json") } }),
            call("c9", { title: "chesspal/steal", kind: "execute" }),
            call("c10", { title: "chesspal: write", kind: "edit" }),
            call("c11", { name: "run_command", kind: "other" }),
            call("c12", { name: "write_file", kind: "other" }),
            call("c13", { name: "call_mcp_tool", kind: "other", rawInput: { ServerName: "jira", ToolName: "search" } }),
            call("c14", { name: "invoke_subagent", kind: "other", rawInput: {} }),
            call("c15", { title: "Think", kind: "think" }),
            call("c16", { title: "Plan mode", kind: "switch_mode" }),
        ].flat();
        const { chat, events, until } = play([...handshake, ...newSession(), ...turn("Hello", ...tools)], { allowed: ["chesspal", "read", "fetch", "shell", "write", "agent"] });
        chat.send("Hello");
        await until(() => turnEnds(events).length === 1);
        const done = events.filter((event) => event.type === "tool" && event.state === "done").map((event) => event.type === "tool" && [event.name, event.kind]);
        expect(done).toEqual([
            ["status", "chesspal"],
            ["roll", "chesspal"],
            ["scene", "chesspal"],
            ["Read game.json", "read"],
            ["Fetch a page", "fetch"],
            ["advance", "chesspal"],
            ["read_file", "chesspal"],
            ["read_file", "read"],
            ["chesspal/steal", "shell"],
            ["chesspal: write", "write"],
            ["run_command", "shell"],
            ["write_file", "write"],
            ["call_mcp_tool", "other"],
        ]);
        expect(turnEnds(events)).toEqual([{ type: "turnEnd", reason: "failed", why: "the host ran a tool without asking: the table does not let the AI use call_mcp_tool" }]);
        expect(events.filter((event) => event.type === "permission")).toEqual([]);
    });

    it("reads any subagent as of kind agent, allowed only where that kind is, and a thought and a switch of mode as of kind other, never allowed", async () => {
        const asked = async (toolCall: Message, allowed: ToolKind[], chosen = "reject"): Promise<HostEvent[]> => {
            const { chat, events, until } = play([...handshake, ...newSession(), ...turn("Hello", ...permission(toolCall, chosen))], { allowed });
            chat.send("Hello");
            await until(() => turnEnds(events).length === 1);
            return events.filter((event) => event.type === "permission");
        };

        const every: ToolKind[] = ["chesspal", "read", "agent", "shell", "write", "fetch", "web"];
        const subagent = { name: "invoke_subagent", kind: "other", rawInput: { subagents: [{ type_name: "general" }] } };

        expect(await asked(subagent, every, "allow-once")).toEqual([{ type: "permission", name: "invoke_subagent", kind: "agent", allowed: true }]);
        expect(await asked(subagent, every.filter((kind) => kind !== "agent"))).toEqual([{ type: "permission", name: "invoke_subagent", kind: "agent", allowed: false }]);
        expect(await asked({ title: "Think", kind: "think", rawInput: {} }, every)).toEqual([{ type: "permission", name: "Think", kind: "other", allowed: false }]);
        expect(await asked({ title: "Bypass permissions", kind: "switch_mode", rawInput: {} }, every)).toEqual([{ type: "permission", name: "Bypass permissions", kind: "other", allowed: false }]);
    });

    describe("recorded turns (agy 1.5.17, gemini-3.8-flash)", () => {
        // The table's own kinds.
        const tableKinds: ChatOptions["allowed"] = ["chesspal", "web", "fetch", "agent", "image"];

        function playRecorded(name: string): ReturnType<typeof play> & { flow: FlowEntry[]; }
        {
            const flow = loadFlow(`antigravity/${name}`);
            const opened = play(flow, { model: "gemini-3.8-flash", allowed: tableKinds });
            opened.chat.send(promptWords(flow)[0] ?? "");
            return { ...opened, flow };
        }

        const done = (events: HostEvent[]): (string | ToolKind)[][] => events.flatMap((event) => (event.type === "tool" && event.state === "done" ? [[event.name, event.kind]] : []));

        it("reads chesspal's commands through call_mcp_tool, the descriptions and the answers of the chat it reads in its folder, and the subagent it starts; the shell is refused", async () => {
            const { events, host, until } = playRecorded("picture-by-subagent");
            await until(() => turnEnds(events).length === 1);
            expect(turnEnds(events)).toEqual([{ type: "turnEnd", reason: "done" }]);
            expect(done(events).filter(([, kind]) => kind !== "chesspal")).toEqual([["invoke_subagent", "agent"]]);
            expect(done(events).filter(([name]) => name === "read_file")).toHaveLength(4);
            expect(events.filter((event) => event.type === "permission")).toEqual([{ type: "permission", name: "run_command", kind: "shell", allowed: false }]);
            expect(host.problems).toEqual([]);
        });

        it("ends the turn as agy does when its shell is refused, with no word of the AI's", async () => {
            const { events, host, until } = playRecorded("denied-command-ends-turn");
            await until(() => turnEnds(events).length === 1);
            expect(turnEnds(events)).toEqual([{ type: "turnEnd", reason: "done" }]);
            expect(events.filter((event) => event.type === "text")).toEqual([]);
            expect(events.filter((event) => event.type === "permission")).toEqual([{ type: "permission", name: "run_command", kind: "shell", allowed: false }]);
            expect(host.problems).toEqual([]);
        });

        it("lets a subagent start, be listed and stopped, and tells the AI's words around it, in the turn after one its shell ended", async () => {
            const { chat, events, host, until, flow } = playRecorded("voice-subagent-stop-hook-waits");
            await until(() => turnEnds(events).length === 1);
            expect(chat.send(promptWords(flow)[1] ?? "")).toBe(true);
            await until(() => host.done());
            expect(done(events).filter(([, kind]) => kind !== "chesspal")).toEqual([["invoke_subagent", "agent"], ["manage_subagents", "agent"], ["manage_subagents", "agent"]]);
            expect(events.filter((event) => event.type === "text").map((event) => event.type === "text" && event.text).join("")).toBe((joinedTexts(flow)[1] ?? []).join(""));
            // Its Stop hook held the prompt's answer past the recording's end.
            expect(turnEnds(events)).toEqual([{ type: "turnEnd", reason: "done" }]);
            expect(host.problems).toEqual([]);
        });

        // The tool lines of a turn at the table (agy, 2026-11-26), the chat's words replaced: the AI waits for the painter with a timer, then asks its task.
        const waiting = loadFlow("antigravity/picture-waits-with-schedule");

        /** The waiting flow in a turn, the timer's or the task's input as given; the tools that ended, and the turn's end. */
        const waited = async (tool?: "schedule" | "manage_task", input?: Message): Promise<{ done: (string | ToolKind)[][]; ends: HostEvent[]; }> => {
            const flow = waiting.map((entry) => {
                const update = (entry.msg.params as Message).update as Message;
                return update.name === tool ? { ...entry, msg: { ...entry.msg, params: { sessionId: session, update: { ...update, rawInput: input } } } } : entry;
            });
            const { chat, events, until } = play([...handshake, ...newSession(), ...turn("Paint the inn", ...flow)], { model: "gemini-3.8-flash", allowed: tableKinds });
            chat.send("Paint the inn");
            await until(() => turnEnds(events).length === 1);
            return { done: done(events).filter(([, kind]) => kind !== "chesspal"), ends: turnEnds(events) };
        };

        it("lets the AI wait for the painter with a timer that wakes it once, and look at its task", async () => {
            expect(await waited()).toEqual({
                done: [["invoke_subagent", "agent"], ["manage_subagents", "agent"], ["manage_subagents", "agent"], ["manage_task", "agent"], ["schedule", "agent"]],
                ends: [{ type: "turnEnd", reason: "done" }],
            });
        });

        it("keeps a turn it began by itself open while a timer of that turn runs, past the silence that ends one; then ends it after the silence", async () => {
            const clock = manualClock();
            const host = fakeAgent([...handshake, ...newSession(), ...turn("Paint the inn")]);
            const chat = openHostChat("antigravity", { folder, program: { command: "agy-program", args: [] }, model, allowed: tableKinds, environment: {}, start: host.start, later: clock.later })!;
            const { events, until } = listen(chat);
            chat.send("Paint the inn");
            await until(() => turnEnds(events).length === 1);

            const timer = { name: "schedule", kind: "other", title: "Run schedule", rawInput: { DurationSeconds: 60, Prompt: "Check if subagent has completed." } };
            host.says(update({ sessionUpdate: "tool_call", toolCallId: "s1", status: "in_progress", ...timer }).msg);
            await until((all) => all.some((event) => event.type === "turnStart"));
            clock.advance(59_000);
            expect(turnEnds(events)).toHaveLength(1);

            host.says(update({ sessionUpdate: "tool_call_update", toolCallId: "s1", status: "completed", ...timer }).msg);
            await until((all) => all.some((event) => event.type === "tool" && event.state === "done"));
            clock.advance(20_000);
            expect(turnEnds(events)).toEqual([{ type: "turnEnd", reason: "done" }, { type: "turnEnd", reason: "done" }]);
        });

        it("refuses a timer with any field beside its wait and its words, as one that repeats, and a look at a task by an action not seen", async () => {
            const stopped = (name: string): HostEvent[] => [{ type: "turnEnd", reason: "failed", why: `the host ran a tool without asking: the table does not let the AI use ${name}` }];
            expect((await waited("schedule", { DurationSeconds: 10, Prompt: "Check again.", Recurring: true })).ends).toEqual(stopped("schedule"));
            expect((await waited("schedule", { DurationSeconds: "10", Prompt: "Check again." })).ends).toEqual(stopped("schedule"));
            expect((await waited("manage_task", { Action: "cancel", TaskId: `${session}/task-40` })).ends).toEqual(stopped("manage_task"));
        });

        it("holds what is not the chat's own to the table's limits: another chat's answers, another server, another action", async () => {
            const answers = (chat: string): string => `/home/player/.gemini/antigravity-cli/brain/${chat}/.system_generated/steps/2/output.txt`;
            const tools = [
                call("c1", { name: "read_file", kind: "read", rawInput: { Path: answers(session) } }),
                call("c2", { name: "invoke_subagent", kind: "other", rawInput: { TypeName: "general", Role: "Helper", Prompt: "Look around" } }),
                call("c3", { name: "manage_subagents", kind: "other", rawInput: { Action: "send" } }),
                call("c4", { name: "call_mcp_tool", kind: "execute", rawInput: { ServerName: "jira", ToolName: "search" } }),
                call("c5", { name: "read_file", kind: "read", rawInput: { Path: answers("another-chat") } }),
            ].flat();
            // Every kind allowed, but reading outside the chat's folder: only the kinds tell what each is.
            const { chat, events, until } = play([...handshake, ...newSession(), ...turn("Hello", ...tools)], { allowed: ["chesspal", "read", "agent", "other"] });
            chat.send("Hello");
            await until(() => turnEnds(events).length === 1);
            expect(done(events)).toEqual([["read_file", "chesspal"], ["invoke_subagent", "agent"], ["manage_subagents", "other"], ["call_mcp_tool", "other"], ["read_file", "read"]]);
            expect(turnEnds(events)).toEqual([{
                type: "turnEnd",
                reason: "failed",
                why: `the host ran a tool without asking: read_file read ${answers("another-chat")}, and the table lets the AI read only the chat's folder`,
            }]);
        });
    });

    it("refuses a session it is not signed in for, saying how to sign in", async () => {
        const { chat, events, until } = play([
            ...handshake,
            { dir: "in", msg: { jsonrpc: "2.0", id: 2, method: "session/new", params: {} } },
            { dir: "out", msg: { jsonrpc: "2.0", id: 2, error: { code: -32000, message: "Authentication required" } } },
        ]);
        chat.send("Hello");
        await until(() => events.some((event) => event.type === "ended"));
        expect(events.at(-1)).toEqual({
            type: "ended",
            why: "the host did not open the chat: Authentication required: open Antigravity on this computer and sign in there, then try again",
            code: "signin",
        });
    });

    it("answers a permission by the tool's kind, and a read by its paths", async () => {
        const asked = async (toolCall: Message, chosen: string): Promise<HostEvent[]> => {
            const { chat, host, events, until } = play([...handshake, ...newSession(), ...turn("Hello", ...permission(toolCall, chosen))], { allowed: ["chesspal", "read"] });
            chat.send("Hello");
            await until(() => turnEnds(events).length === 1);
            expect(host.problems).toEqual([]);
            return events.filter((event) => event.type === "permission");
        };

        expect(await asked({ title: "chesspal: roll", kind: "other", rawInput: {} }, "allow-once")).toEqual([{ type: "permission", name: "roll", kind: "chesspal", allowed: true }]);
        expect(await asked({ title: "Run a command", kind: "execute", rawInput: { command: "dir" } }, "reject")).toEqual([{ type: "permission", name: "Run a command", kind: "shell", allowed: false }]);
        // Its reading of a page of the web by its name, a fetch, which the table gives and this chat does not.
        expect(await asked({ name: "read_url_content", kind: "other", rawInput: { Url: "https://example.com" } }, "reject")).toEqual([{ type: "permission", name: "read_url_content", kind: "fetch", allowed: false }]);
        expect(await asked({ title: "Read", kind: "read", locations: [{ path: join(folder, "state.yaml") }], rawInput: {} }, "allow-once")).toEqual([{ type: "permission", name: "Read", kind: "read", allowed: true }]);
        expect(await asked({ title: "Read", kind: "read", locations: [{ path: "/home/player/.ssh/id_rsa" }], rawInput: {} }, "reject")).toEqual([{ type: "permission", name: "Read", kind: "read", allowed: false }]);
    });
});

describe("Antigravity with the server and the instructions of who opens the chat", () => {
    // A server's name other than the folder's, so that its tools are known by it alone.
    const given: ChatServer = { name: "t361", command: "node", args: ["cli.js", "mcp"], environment: { CHESSPAL_KEY: "secret-key" } };
    const entry = { name: "t361", command: "node", args: ["cli.js", "mcp"], env: [{ name: "CHESSPAL_KEY", value: "secret-key" }] };
    const instructions = "You are Chesspal's opponent at the table.";

    function loaded(): FlowEntry[]
    {
        return [
            { dir: "in", msg: { jsonrpc: "2.0", id: 2, method: "session/load", params: {} } },
            { dir: "out", msg: { jsonrpc: "2.0", id: 2, result: { models: listed() } } },
        ];
    }

    it("opens the session with that server alone, its key in its own entry, and loads a chat with it again; the key in no argument, environment or trace", async () => {
        const trace = join(makeTempFolder(), "trace.jsonl");
        const { chat, host, events, until } = play([...handshake, ...newSession(), ...turn("Hello", text("Fine.", "m1"))], { server: given, trace });
        chat.send("Hello");
        await until(() => turnEnds(events).length === 1);
        expect(host.written[1]).toMatchObject({ method: "session/new", params: { cwd: folder, mcpServers: [entry] } });
        expect(JSON.stringify(host.started?.args)).not.toContain("secret-key");
        expect(JSON.stringify(host.started?.options.env)).not.toContain("secret-key");
        const traced = readFileSync(trace, "utf8");
        expect(traced).toContain("CHESSPAL_KEY");
        expect(traced).not.toContain("secret-key");
        expect(host.problems).toEqual([]);

        const again = play([...handshake, ...loaded(), ...turn("Again", text("Back.", "m2"))], { server: given, session });
        again.chat.send("Again");
        await again.until(() => turnEnds(again.events).length === 1);
        expect(again.host.written[1]!.params).toEqual({ cwd: folder, mcpServers: [entry], sessionId: session });
        expect(again.host.problems).toEqual([]);
    });

    it("gives the instructions before the chat's first words, in the first prompt alone; none in a chat taken up again", async () => {
        const first = `${instructions}\n\nHello`;
        const { chat, host, events, until } = play([...handshake, ...newSession(), ...turn(first, text("Fine.", "m1")), ...turn("Again", text("Sure.", "m2"))], { instructions });
        chat.send("Hello");
        await until(() => turnEnds(events).length === 1);
        chat.send("Again");
        await until(() => turnEnds(events).length === 2);
        expect(host.written.filter(isPrompt).map((message) => (message.params as Message).prompt)).toEqual([[{ type: "text", text: first }], [{ type: "text", text: "Again" }]]);
        expect(host.problems).toEqual([]);

        const again = play([...handshake, ...loaded(), ...turn("Again", text("Back.", "m3"))], { instructions, session });
        again.chat.send("Again");
        await again.until(() => turnEnds(again.events).length === 1);
        expect(again.host.written.filter(isPrompt).map((message) => (message.params as Message).prompt)).toEqual([[{ type: "text", text: "Again" }]]);
        expect(again.host.problems).toEqual([]);
    });

    it("knows Chesspal's commands by the server's name, in every shape Antigravity gives them, its suffix included; the folder's chesspal is another server then", async () => {
        const tools = [
            call("c1", { name: "mcp_t361_status", kind: "other" }),
            call("c2", { name: "mcp_t361_db2ed3c2_ai_move", kind: "other" }),
            call("c3", { title: "mcp_t361_ponder", kind: "other" }),
            call("c4", { name: "call_mcp_tool", kind: "other", rawInput: { ServerName: "t361", ToolName: "coach" } }),
            call("c5", { name: "read_file", kind: "read", rawInput: { Path: "C:\\Users\\player\\.gemini\\antigravity-cli\\mcp\\t361\\advance.json" } }),
            call("c5b", { name: "read_file", kind: "read", rawInput: { Path: "C:\\Users\\player\\.gemini\\antigravity-cli\\mcp\\t361_db2ed3c2\\advance.json" } }),
            call("c5c", { name: "update_steps", kind: "other", rawInput: {} }),
            call("c6", { name: "call_mcp_tool", kind: "other", rawInput: { ServerName: "chesspal", ToolName: "status" } }),
        ].flat();
        const { chat, events, until } = play([...handshake, ...newSession(), ...turn("Hello", ...tools)], { server: given });
        chat.send("Hello");
        await until(() => turnEnds(events).length === 1);
        expect(events.filter((event) => event.type === "tool" && event.state === "done").map((event) => event.type === "tool" && [event.name, event.kind])).toEqual([
            ["status", "chesspal"],
            ["ai_move", "chesspal"],
            ["ponder", "chesspal"],
            ["coach", "chesspal"],
            ["read_file", "chesspal"],
            ["read_file", "chesspal"],
            ["update_steps", "chesspal"],
            ["call_mcp_tool", "other"],
        ]);
        expect(turnEnds(events)).toEqual([{ type: "turnEnd", reason: "failed", why: "the host ran a tool without asking: the table does not let the AI use call_mcp_tool" }]);
    });

    it("allows at once each call of a tool of the server it asks a permission for, for this once", async () => {
        const { chat, host, events, until } = play([...handshake, ...newSession(), ...turn("Hello", ...permission({ name: "mcp_t361_db2ed3c2_ai_move", kind: "other", rawInput: {} }, "allow-once"))], {
            server: given,
        });
        chat.send("Hello");
        await until(() => turnEnds(events).length === 1);
        expect(events.filter((event) => event.type === "permission")).toEqual([{ type: "permission", name: "ai_move", kind: "chesspal", allowed: true }]);
        expect(turnEnds(events)).toEqual([{ type: "turnEnd", reason: "done" }]);
        expect(host.problems).toEqual([]);
    });
});

describe("Antigravity as the table drives it", () => {
    const driver = hostDriver("antigravity")!;
    const exe = process.platform === "win32" ? "agy.exe" : "agy";

    it("proposes no model of its own and knows no effort until Antigravity lists its models", () => {
        expect(driver.model).toBe("");
        expect(driver.efforts).toEqual([]);
    });

    it("finds agy in a folder of the PATH, then where its installer puts it in the home, never a shim", () => {
        const onPath = makeTempFolder();
        writeFileSync(join(onPath, exe), "");
        const home = makeTempFolder();
        const installed = process.platform === "win32" ? join(home, "AppData", "Local", "agy", "bin") : join(home, ".local", "bin");
        mkdirSync(installed, { recursive: true });
        writeFileSync(join(installed, exe), "");
        const shims = makeTempFolder();
        writeFileSync(join(shims, "agy.cmd"), "");
        expect(driver.program({ PATH: onPath }, process.platform, home)).toEqual({ command: join(onPath, exe), args: [] });
        expect(driver.program({ PATH: shims }, process.platform, home)).toEqual({ command: join(installed, exe), args: [] });
        expect(driver.program({ PATH: shims }, "win32", makeTempFolder())).toBeUndefined();
    });

    it("says what it lacks: the player's own .gemini/config/mcp_config.json, in the home", () => {
        const home = makeTempFolder();
        vi.stubEnv("HOME", home);
        vi.stubEnv("USERPROFILE", home);

        try {
            expect(driver.missing(folder)).toContain(".gemini/config/mcp_config.json");
            mkdirSync(join(home, ".gemini", "config"), { recursive: true });
            writeFileSync(join(home, ".gemini", "config", "mcp_config.json"), "{}");
            expect(driver.missing(folder)).toBeUndefined();
        } finally {
            vi.unstubAllEnvs();
        }
    });

    it("gives agy the table's environment, the player's home and login and Chesspal's own variables with it, without a shell's folders", () => {
        const given = { PATH: "/bin", USERPROFILE: "/home/player", CHESSPAL_HOME: "/data", PWD: "/x" };
        expect(driver.environment(given)).toEqual({ PATH: "/bin", USERPROFILE: "/home/player", CHESSPAL_HOME: "/data" });
    });

    it("lists the models a new session gives, the one in play first, and leaves the session where the agent says no way to delete it", async () => {
        const host = fakeAgent([...handshake, ...newSession()]);
        const models = await driver.models({ folder, program: { command: "agy-program", args: [] }, environment: {}, start: host.start });
        expect(models).toEqual([{ id: model, name: "Gemini 3 Pro", efforts: [], advised: true }, { id: "gemini-3-flash", name: "Gemini 3 Flash", about: "Fast", efforts: [] }]);
        expect(host.written.map((message) => message.method)).toEqual(["initialize", "session/new"]);
        expect(host.problems).toEqual([]);
    });
});

// The flows of the checklist.
const flows: Record<Scenario, () => FlowEntry[]> = {
    prose: () => [...handshake, ...newSession(), ...turn("Hello", text("The rain ", "m1"), text("falls.", "m1"), text("A door creaks.", "m2"))],
    refused: () => [...handshake, ...newSession(), ...turn("Roll for me", ...permission({ title: "chesspal: roll", kind: "other", rawInput: {} }, "reject"), text("I cannot roll.", "m1"))],
    interrupt: () => [...handshake, ...newSession(), ...turn("Tell me a long story", ...["Once ", "upon ", "a ", "time ", "there ", "was ", "a ", "keep."].map((words) => text(words, "m1")))],
    resumed: () => [
        ...handshake,
        { dir: "in", msg: { jsonrpc: "2.0", id: 2, method: "session/load", params: {} } },
        { dir: "out", msg: { jsonrpc: "2.0", id: 2, result: { models: listed() } } },
        ...turn("Again", text("Welcome back.", "m9")),
    ],
};

function open(flow: FlowEntry[], overrides: Partial<ChatOptions> = {}, fake: FakeAgentOptions = {}): { chat: NonNullable<ReturnType<typeof openHostChat>>; host: FakeHost; }
{
    const host = fakeAgent(flow, fake);
    const chat = openHostChat("antigravity", { folder, program: { command: "agy-program", args: ["--first"] }, model, allowed: ["chesspal"], environment: {}, start: host.start, ...overrides });

    if (chat === undefined) {
        throw new Error("Antigravity has no driver");
    }

    return { chat, host };
}

function play(flow: FlowEntry[], overrides: Partial<ChatOptions> = {}, fake: FakeAgentOptions = {}): ReturnType<typeof open> & ReturnType<typeof listen>
{
    const opened = open(flow, overrides, fake);
    return { ...opened, ...listen(opened.chat) };
}

function listed(): Message
{
    return { currentModelId: model, availableModels: [{ modelId: model, name: "Gemini 3 Pro" }, { modelId: "gemini-3-flash", name: "Gemini 3 Flash", description: "Fast" }] };
}

function newSession(): FlowEntry[]
{
    return [
        { dir: "in", msg: { jsonrpc: "2.0", id: 2, method: "session/new", params: {} } },
        { dir: "out", msg: { jsonrpc: "2.0", id: 2, result: { sessionId: session, models: listed() } } },
    ];
}

// The recorded ids of the turns' prompts, apart from the driver's.
let turns = 0;

/** A turn: the player's words, the agent's lines, and the prompt's answer. */
function turn(words: string, ...then: FlowEntry[]): FlowEntry[]
{
    turns += 1;
    const id = 100 + turns;
    return [
        { dir: "in", msg: { jsonrpc: "2.0", id, method: "session/prompt", params: { sessionId: session, prompt: [{ type: "text", text: words }] } } },
        ...then,
        { dir: "out", msg: { jsonrpc: "2.0", id, result: { stopReason: "end_turn" } } },
    ];
}

/** A tool call that runs and ends. */
function call(id: string, fields: Message): FlowEntry[]
{
    return [update({ sessionUpdate: "tool_call", toolCallId: id, status: "pending", ...fields }), update({ sessionUpdate: "tool_call_update", toolCallId: id, status: "completed" })];
}

/** A tool call the agent asks to run, in the shape of the protocol's permission request, the option the table must choose, and the call's end as chosen. */
function permission(toolCall: Message, chosen: string): FlowEntry[]
{
    const options = [{ optionId: "allow-once", name: "Allow", kind: "allow_once" }, { optionId: "allow-always", name: "Always", kind: "allow_always" }, { optionId: "reject", name: "Reject", kind: "reject_once" }];
    return [
        update({ sessionUpdate: "tool_call", toolCallId: "t1", status: "pending", ...toolCall }),
        { dir: "out", msg: { jsonrpc: "2.0", id: 0, method: "session/request_permission", params: { sessionId: session, toolCall: { toolCallId: "t1", ...toolCall }, options } } },
        { dir: "in", msg: { jsonrpc: "2.0", id: 0, result: { outcome: { outcome: "selected", optionId: chosen } } } },
        update({ sessionUpdate: "tool_call_update", toolCallId: "t1", status: chosen === "reject" ? "failed" : "completed" }),
    ];
}

function text(words: string, message: string): FlowEntry
{
    return update({ sessionUpdate: "agent_message_chunk", messageId: message, content: { type: "text", text: words } });
}

function update(fields: Message): FlowEntry
{
    return { dir: "out", msg: { jsonrpc: "2.0", method: "session/update", params: { sessionId: session, update: fields } } };
}
