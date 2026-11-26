import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { codex } from "../src/hosts/codex/index.ts";
import type { ChatOptions, HostChat, HostEvent } from "../src/hosts/index.ts";
import { checklist, type Scenario } from "./hosts/checklist.ts";
import { deltaTexts, fakeCodex, type FakeCodexOptions, isThreadRequest, isTurnStart, threadOfFlow, turnWords } from "./hosts/fake-codex.ts";
import { type FakeHost, type FlowEntry, listen, loadFlow, manualClock, ticksUntil, turnEnds } from "./hosts/fake-host.ts";
import { makeTempFolder, removeTempFolders } from "./hosts/temp.ts";

afterAll(removeTempFolders);

type Message = Record<string, unknown>;

const folder = "/players/test";
const model = "gpt-6-luna";
const thread = "thr_1";
// The kinds of tools the table allows.
const tableKinds: ChatOptions["allowed"] = ["chesspal", "read", "web", "fetch", "agent", "image"];
// The flows of codex-cli 0.171.0 (24 Nov): a new chat of two turns that runs chesspal's commands without asking, as the folder's configuration lets them.
// Codex asked no approval and took no thread up in those runs: the refused flow is the first turn with each command asking its approval as an MCP form of
// the shape guessed, and the resumed one the same turn on thread/resume.
const recorded: Record<Scenario, string> = { prose: "new", refused: "refused", interrupt: "new", resumed: "resumed" };

checklist({
    host: "Codex",
    open: (scenario) => {
        const flow = loadFlow(`codex/${recorded[scenario]}`);
        const session = scenario === "resumed" ? threadOfFlow(flow) : undefined;
        const { chat, host } = open(flow, { allowed: scenario === "refused" ? ["read"] : ["chesspal", "read"], ...(session === undefined ? {} : { session }) });
        return { chat, host, turns: turnWords(flow), texts: deltaTexts(flow), ...(session === undefined ? {} : { session }), interruptTurn: 1 };
    },
    isModelRequest: isThreadRequest,
    isPlayerWords: isTurnStart,
});

describe("the chat in Codex", () => {
    describe("its program", () => {
        it("starts as codex app-server after its own arguments, in the chat's folder trusted for this process alone", () => {
            const host = fakeCodex([]);
            codex.open({ ...options(host), environment: { HOME: "/home/player" } });
            expect(host.started?.command).toBe("codex-program");
            expect(host.started?.args).toEqual(["--first", "app-server", "-c", `projects.${folder}.trust_level="trusted"`, "-c", "check_for_update_on_startup=false", "-c", "features.apps=false", "-c", "features.plugins=false"]);
            expect(host.started?.options.cwd).toBe(folder);
            expect(host.started?.options.env).toEqual({ HOME: "/home/player" });
        });

        it("trusts a folder with a dot, which a key of -c cannot hold, in the value: a table of projects holding it alone, in TOML's quotes", () => {
            const host = fakeCodex([]);
            codex.open({ ...options(host), folder: 'C:\\Users\\mario.rossi\\"x"' });
            expect(host.started?.args).toEqual([
                "--first",
                "app-server",
                "-c",
                'projects={"C:\\\\Users\\\\mario.rossi\\\\\\"x\\""={trust_level="trusted"}}',
                "-c",
                "check_for_update_on_startup=false",
                "-c",
                "features.apps=false",
                "-c",
                "features.plugins=false",
            ]);
        });

        it("begins the protocol as the table, reads its configuration and the account, then opens a thread with the model, the effort, its approvals, its sandbox and no web search", async () => {
            const { host, until } = play([...begin(), ...threadStart()], { effort: "low" });
            await until(() => host.written.length >= 5);
            expect(host.written.map((message) => message.method)).toEqual(["initialize", "initialized", "config/read", "account/read", "thread/start"]);
            expect(host.written[0]!.params).toMatchObject({ clientInfo: { name: "chesspal", title: "Chesspal" }, capabilities: { experimentalApi: true } });
            expect(host.written[2]!.params).toEqual({ cwd: folder });
            expect(host.written[4]!.params).toEqual({ cwd: folder, model, approvalPolicy: "on-request", sandbox: "read-only", config: { model_reasoning_effort: "low", web_search: "disabled" } });
        });

        it("opens the thread with the player's own MCP servers turned off, chesspal alone left on", async () => {
            const servers = { chesspal: { command: "chesspal" }, github: { command: "gh-mcp" }, "my.notes": { url: "http://localhost:9" } };
            const { host, until } = play([...begin(), ...threadStart()], {}, { servers });
            await until(() => host.written.some(isThreadRequest));
            expect((host.written.find(isThreadRequest)?.params as Message).config).toEqual({ web_search: "disabled", mcp_servers: { github: { enabled: false }, "my.notes": { enabled: false } } });
        });

        it("opens the thread all the same where Codex fails to say its configuration, or keeps silent 5 seconds, turning off no server, and the table's log says so", async () => {
            const logged: string[] = [];
            const log = (line: string): number => logged.push(line);
            const failed = play([...begin(), ...threadStart()], { log }, { failing: ["config/read"] });
            await failed.until(() => failed.host.written.some(isThreadRequest));
            expect((failed.host.written.find(isThreadRequest)?.params as Message).config).toEqual({ web_search: "disabled" });

            const clock = manualClock();
            const silent = play([...begin(), ...threadStart()], { later: clock.later, log }, { ignore: ["config/read"], servers: { github: {} } });
            await silent.until(() => silent.host.written.some((message) => message.method === "config/read"));
            clock.advance(4999);
            expect(silent.host.written.map((message) => message.method)).toEqual(["initialize", "initialized", "config/read"]);
            clock.advance(1);
            await silent.until(() => silent.host.written.some(isThreadRequest));
            expect((silent.host.written.find(isThreadRequest)?.params as Message).config).toEqual({ web_search: "disabled" });
            expect(logged).toEqual([
                "Codex did not say its configuration (config/read failed): the chat opens with the player's own MCP servers on.",
                "Codex did not say its configuration within 5 seconds: the chat opens with the player's own MCP servers on.",
            ]);
        });
    });

    describe("the model and the effort", () => {
        it("are confirmed by the thread before the player's words, which carry them again", async () => {
            const { chat, host, events, until } = play([...begin(), ...threadStart(), ...turn("Hello", delta("Fine"))], { effort: "low" });
            chat.send("Hello");
            await until(() => turnEnds(events).length === 1);
            expect(host.written.find(isTurnStart)?.params).toEqual({ threadId: thread, input: [{ type: "text", text: "Hello", text_elements: [] }], model, effort: "low" });
            expect(events).toEqual([{ type: "session", session: thread, model }, { type: "text", block: 0, text: "Fine" }, { type: "turnEnd", reason: "done" }]);
            expect(host.problems).toEqual([]);
        });

        it("are set again on the thread taken up, as Codex goes back to the account's own", async () => {
            const { chat, host, events, until } = play([...begin(), ...threadStart(), ...turn("Again", delta("Back"))], { session: thread, effort: "high" });
            chat.send("Again");
            await until(() => turnEnds(events).length === 1);
            expect(host.written.find(isThreadRequest)).toMatchObject({
                method: "thread/resume",
                params: { threadId: thread, cwd: folder, model, config: { model_reasoning_effort: "high" }, excludeTurns: true },
            });
            expect(events[0]).toEqual({ type: "session", session: thread, model });
            expect(host.problems).toEqual([]);
        });

        it("ends the chat, writing none of the player's words, when the thread runs another model or effort than those asked", async () => {
            for (
                const [fake, why] of [
                    [{ models: { [model]: "gpt-6.1-sol" } }, `the host was asked for the model ${model} and runs gpt-6.1-sol`],
                    [{ efforts: { low: "high" } }, "the host was asked for the effort low and runs high"],
                ] as [FakeCodexOptions, string][]
            ) {
                for (const session of [undefined, "thr_old"]) {
                    const { chat, host, events, until } = play([...begin(), ...threadStart(), ...turn("Hello", delta("leaked"))], { effort: "low", ...(session === undefined ? {} : { session }) }, fake);
                    chat.send("Hello");
                    await until(() => events.some((event) => event.type === "ended"));
                    expect(events).toEqual([{ type: "turnEnd", reason: "failed", why }, { type: "ended", why }]);
                    expect(host.written.some(isTurnStart)).toBe(false);
                    expect(host.inputClosed).toBe(true);
                    expect(host.stopped).toBe(false);
                }
            }
        });

        it("ends the chat with the sign-in's code, saying to sign in to Codex, when it is not signed in", async () => {
            const flow = begin({ account: null, requiresOpenaiAuth: true });
            const { chat, events, until } = play(flow);
            chat.send("Hello");
            await until(() => events.some((event) => event.type === "ended"));
            const why = "Codex is not signed in on this computer: sign in to Codex, then open the chat again";
            expect(events).toEqual([{ type: "turnEnd", reason: "failed", why, code: "signin" }, { type: "ended", why, code: "signin" }]);
            expect(why).not.toMatch(/terminal/);
        });

        it("ends the chat with Codex's words when it opens no thread", async () => {
            const { events, until } = play(begin(), {}, { failing: ["thread/start"] });
            await until(() => events.some((event) => event.type === "ended"));
            expect(events).toEqual([{ type: "ended", why: "the host did not open the chat: thread/start failed" }]);
        });

        it("ends the chat when Codex is not ready within 60 seconds", async () => {
            const clock = manualClock();
            const { chat, host, events, until } = play(begin(), { later: clock.later }, { ignore: ["thread/start"] });
            chat.send("Hello");
            await until(() => host.written.some(isThreadRequest));
            clock.advance(59_999);
            expect(events).toEqual([]);
            clock.advance(1);
            const why = `the host was not ready to play with the model ${model} within 60 seconds`;
            expect(events).toEqual([{ type: "turnEnd", reason: "failed", why }, { type: "ended", why }]);
            // Its input closed, it has ten seconds to end by itself before it is stopped.
            expect(host.inputClosed).toBe(true);
            clock.advance(9999);
            expect(host.stopped).toBe(false);
            clock.advance(1);
            expect(host.stopped).toBe(true);
        });

        it("fails the turn whose model Codex changes, and asks it to stop", async () => {
            const changed = notice("thread/settings/updated", { threadSettings: { model: "gpt-6.1-sol", effort: "low" } });
            const { chat, host, events, until } = play([...begin(), ...threadStart(), ...turn("Hello", delta("Fine"), changed, delta("leaked"))]);
            chat.send("Hello");
            await until(() => turnEnds(events).length === 1);
            expect(turnEnds(events)).toEqual([{ type: "turnEnd", reason: "failed", why: `the host runs the model gpt-6.1-sol instead of ${model}` }]);
            expect(events.filter((event) => event.type === "text").map((event) => event.type === "text" && event.text)).toEqual(["Fine"]);
            expect(host.written.filter((message) => message.method === "turn/interrupt")).toMatchObject([{ params: { threadId: thread, turnId: "turn_1" } }]);
        });
    });

    describe("the AI's prose and tools", () => {
        it("tells Chesspal's commands by their own names, started and done, and nothing of Codex's warnings", async () => {
            const flow = loadFlow("codex/new");
            const { chat, events, until } = play(flow, { allowed: ["chesspal"] });
            chat.send(turnWords(flow)[0]!);
            await until(() => turnEnds(events).length === 1);
            expect(events.filter((event) => event.type === "tool")).toEqual([
                { type: "tool", id: "exec-00000000-0000-0000-0000-000000000004", name: "instructions", kind: "chesspal", state: "started" },
                { type: "tool", id: "exec-00000000-0000-0000-0000-000000000004", name: "instructions", kind: "chesspal", state: "done" },
                { type: "tool", id: "exec-00000000-0000-0000-0000-000000000005", name: "status", kind: "chesspal", state: "started" },
                { type: "tool", id: "exec-00000000-0000-0000-0000-000000000005", name: "status", kind: "chesspal", state: "done" },
            ]);
            expect(events.filter((event) => event.type === "text").every((event) => event.type === "text" && !event.text.includes("deprecated"))).toBe(true);
        });

        it("numbers a new block for each message and after a tool, and tells a message's whole text where none came in pieces", async () => {
            const tool = [
                item("started", { type: "mcpToolCall", id: "call_1", server: "chesspal", tool: "roll", status: "inProgress" }),
                item("completed", { type: "mcpToolCall", id: "call_1", server: "chesspal", tool: "roll", status: "completed" }),
            ];
            const whole = [item("started", { type: "agentMessage", id: "m3", text: "" }), item("completed", { type: "agentMessage", id: "m3", text: "Four" })];
            const flow = [
                ...begin(),
                ...threadStart(),
                ...turn("Hello", delta("One", "m1"), delta(" more", "m1"), item("completed", { type: "agentMessage", id: "m1", text: "One more" }), delta("Two", "m2"), ...tool, delta("Three", "m2"), ...whole),
            ];
            const { chat, events, until } = play(flow);
            chat.send("Hello");
            await until(() => turnEnds(events).length === 1);
            expect(events.filter((event) => event.type === "text")).toEqual([
                { type: "text", block: 0, text: "One" },
                { type: "text", block: 0, text: " more" },
                { type: "text", block: 1, text: "Two" },
                { type: "text", block: 2, text: "Three" },
                { type: "text", block: 3, text: "Four" },
            ]);
        });

        it("fails a turn Codex fails, with its words", async () => {
            const { chat, events, until } = play([...begin(), ...threadStart(), ...turn("Hello", { status: "failed", error: { message: "You've hit your usage limit." } })]);
            chat.send("Hello");
            await until(() => turnEnds(events).length === 1);
            expect(turnEnds(events)).toEqual([{ type: "turnEnd", reason: "failed", why: "You've hit your usage limit." }]);
        });

        it("stops the turn, failed, where a tool the table does not allow ran without asking", async () => {
            const command = { type: "commandExecution", id: "cmd_1", command: "curl example.com", cwd: folder, commandActions: [{ type: "unknown", command: "curl example.com" }] };
            const flow = [...begin(), ...threadStart(), ...turn("Hello", item("started", { ...command, status: "inProgress" }), item("completed", { ...command, status: "completed" }), delta("leaked"))];
            const { chat, host, events, until } = play(flow, { allowed: ["chesspal", "read"] });
            chat.send("Hello");
            await until(() => turnEnds(events).length === 1);
            expect(events.filter((event) => event.type === "tool").map((event) => event.type === "tool" && [event.kind, event.state])).toEqual([["shell", "started"], ["shell", "done"]]);
            expect(turnEnds(events)).toEqual([{ type: "turnEnd", reason: "failed", why: "the host ran a tool without asking: the table does not let the AI use commandExecution" }]);
            expect(host.written.some((message) => message.method === "turn/interrupt")).toBe(true);
            expect(events.some((event) => event.type === "text")).toBe(false);
        });

        it("names the path where a read outside the folder ran without asking", async () => {
            const command = { type: "commandExecution", id: "cmd_1", command: "cat /etc/passwd", cwd: folder, commandActions: [{ type: "read", command: "cat /etc/passwd", name: "passwd", path: "/etc/passwd" }] };
            const flow = [...begin(), ...threadStart(), ...turn("Hello", item("completed", { ...command, status: "completed" }))];
            const { chat, events, until } = play(flow, { allowed: ["chesspal", "read"] });
            chat.send("Hello");
            await until(() => turnEnds(events).length === 1);
            expect(turnEnds(events)).toEqual([
                { type: "turnEnd", reason: "failed", why: "the host ran a tool without asking: commandExecution read /etc/passwd, and the table lets the AI read only the chat's folder" },
            ]);
        });

        it("lets a page of the web opened by its search go on at the table, which gives fetching; never where fetching is not given", async () => {
            const opened = async (allowed: ChatOptions["allowed"]): Promise<HostEvent[]> => {
                const search = { type: "webSearch", id: "ws_1", query: "", action: { type: "openPage", url: "https://example.com" } };
                const flow = [...begin(), ...threadStart(), ...turn("Hello", item("started", search), item("completed", search))];
                const { chat, events, until } = play(flow, { allowed });
                chat.send("Hello");
                await until(() => turnEnds(events).length === 1);
                return turnEnds(events);
            };

            expect(await opened(tableKinds)).toEqual([{ type: "turnEnd", reason: "done" }]);
            expect(await opened(["chesspal", "read", "web"])).toEqual([{ type: "turnEnd", reason: "failed", why: "the host ran a tool without asking: the table does not let the AI use webSearch" }]);
        });

        it("reads a picture Codex painted as failed only where it says its failure, whatever its status says", async () => {
            const painted = async (fields: Message): Promise<string[]> => {
                const picture = { type: "imageGeneration", id: "img_1", revisedPrompt: null, result: "", ...fields };
                const flow = [...begin(), ...threadStart(), ...turn("Hello", item("started", { ...picture, status: "generating" }), item("completed", picture))];
                const { chat, events, until } = play(flow, { allowed: ["chesspal"] });
                chat.send("Hello");
                await until(() => turnEnds(events).length === 1);
                return events.flatMap((event) => (event.type === "tool" && event.state !== "started" ? [event.state] : event.type === "turnEnd" ? [event.reason] : []));
            };

            expect(await painted({ status: "generated", savedPath: "/home/player/.codex/images/a.png", failure: null })).toEqual(["done", "failed"]);
            expect(await painted({ status: "failed", failure: "the model refused" })).toEqual(["failed", "done"]);
        });

        it("reads a picture whose line is megabytes long, its whole image in it, and tells nothing of the image (recorded, its image grown back)", async () => {
            const flow = loadFlow("codex/picture-saved-outside").map((entry): FlowEntry => {
                const painted = entry.msg.method === "item/completed" && (entry.msg.params as { item: Message; }).item.type === "imageGeneration";
                const params = entry.msg.params as { item: Message; };
                return painted ? { ...entry, raw: JSON.stringify({ ...entry.msg, params: { ...params, item: { ...params.item, result: "iVBORw0KGgo".repeat(400_000) } } }) } : entry;
            });
            expect(flow.find((entry) => entry.raw !== undefined)?.raw?.length).toBeGreaterThan(4_000_000);
            const { chat, host, events, until } = play(flow, { effort: "low", allowed: tableKinds });

            for (const [index, words] of turnWords(flow).entries()) {
                await until(() => turnEnds(events).length === index);
                chat.send(words);
            }

            await until(() => turnEnds(events).length === 2);
            expect(turnEnds(events)).toEqual([{ type: "turnEnd", reason: "done" }, { type: "turnEnd", reason: "done" }]);
            expect(events.filter((event) => event.type === "tool" && event.kind === "image")).toEqual([
                { type: "tool", id: "exec-964013f0-660c-4d08-a847-4b7f6072e75d", name: "imageGeneration", kind: "image", state: "started" },
                { type: "tool", id: "exec-964013f0-660c-4d08-a847-4b7f6072e75d", name: "imageGeneration", kind: "image", state: "done" },
            ]);
            expect(JSON.stringify(events)).not.toContain("iVBORw0KGgo");
            expect(host.problems).toEqual([]);
        });
    });

    describe("a subagent", () => {
        const voice = loadFlow("codex/voice-subagent");

        async function played(flow: FlowEntry[], allowed: ChatOptions["allowed"] = tableKinds): Promise<{ events: HostEvent[]; host: FakeHost; }>
        {
            const { chat, host, events, until } = play(flow, { effort: "low", allowed });
            chat.send(turnWords(flow)[0] ?? "");
            await until(() => turnEnds(events).length === 1);
            return { events, host };
        }

        it("lets any subagent play, never asking Codex which agent it is: its words and tools are never told as the AI's (recorded)", async () => {
            const { events, host } = await played(voice);
            expect(host.written.filter((message) => message.method === "thread/read")).toEqual([]);
            expect(turnEnds(events)).toEqual([{ type: "turnEnd", reason: "done" }]);
            const told = events.filter((event) => event.type === "text").map((event) => event.type === "text" && event.text).join("");
            expect(told).not.toContain("Keeps");
            expect(told).toContain("Bertoldo incrocia le braccia");
            expect(events.filter((event) => event.type === "tool" && event.state === "done").map((event) => event.type === "tool" && `${event.name}:${event.kind}`)).toEqual([
                "instructions:chesspal",
                "status:chesspal",
                "find:chesspal",
                "show:chesspal",
                "scene:chesspal",
                "subAgentActivity:agent",
                "collabAgentToolCall:agent",
            ]);
            expect(host.problems).toEqual([]);
        });

        it("fails the turn where the table does not allow a subagent", async () => {
            const { events } = await played(voice, tableKinds.filter((kind) => kind !== "agent"));
            expect(turnEnds(events)).toEqual([{ type: "turnEnd", reason: "failed", why: "the host ran a tool without asking: the table does not let the AI use subAgentActivity" }]);
        });

        it("holds what a subagent's thread ran without asking to the AI's limits, and never tells its words", async () => {
            const ran = async (fields: Message): Promise<HostEvent[]> => {
                const launch = { type: "subAgentActivity", id: "call_1", kind: "started", agentThreadId: "thr_child", agentPath: "/root/bertoldo" };
                const inChild = (phase: "started" | "completed", one: Message): FlowEntry => ({ dir: "out", msg: { method: `item/${phase}`, params: { threadId: "thr_child", turnId: "turn_c", item: one } } });
                const flow = [
                    ...begin(),
                    ...threadStart(),
                    ...turn(
                        "Hello",
                        item("started", launch),
                        item("completed", launch),
                        inChild("started", { id: "c1", ...fields, status: "inProgress" }),
                        inChild("completed", { id: "c1", ...fields, status: "completed" }),
                        inChild("completed", { type: "agentMessage", id: "k1", text: "Keeps: the key." }),
                        item("completed", { type: "agentMessage", id: "m1", text: "The innkeeper shrugs." }),
                    ),
                ];
                const { events } = await played(flow);
                expect(events.filter((event) => event.type === "text").map((event) => event.type === "text" && event.text)).not.toContain("Keeps: the key.");
                expect(events.filter((event) => event.type === "tool" && event.id === "c1")).toEqual([]);
                return turnEnds(events);
            };

            expect(await ran({ type: "mcpToolCall", server: "chesspal", tool: "view", arguments: { as: "Bertoldo" } })).toEqual([{ type: "turnEnd", reason: "done" }]);
            expect(await ran({ type: "commandExecution", command: "dir", cwd: folder, commandActions: [{ type: "unknown", command: "dir" }] })).toEqual([{
                type: "turnEnd",
                reason: "failed",
                why: "the host ran a tool without asking: the table does not let the AI use commandExecution",
            }]);
        });
    });

    describe("approvals", () => {
        /** A turn whose Codex asks, and the answer the table must give; before it, the tools started. */
        function asking(method: string, params: Message, answer: Message | undefined, ...before: FlowEntry[]): FlowEntry[]
        {
            const reply: Message = answer === undefined ? { jsonrpc: "2.0", id: "ask-1", error: { code: -32601, message: `The table does not handle ${method}.` } } : { jsonrpc: "2.0", id: "ask-1", result: answer };
            return [...begin(), ...threadStart(), ...turn("Hello", ...before, { dir: "out", msg: { id: "ask-1", method, params: { threadId: thread, turnId: "turn_1", ...params } } }, { dir: "in", msg: reply })];
        }

        async function answered(flow: FlowEntry[], allowed: ChatOptions["allowed"] = ["chesspal", "read"]): Promise<HostEvent[]>
        {
            const { chat, host, events, until } = play(flow, { allowed });
            chat.send("Hello");
            await until(() => turnEnds(events).length === 1);
            expect(host.problems).toEqual([]);
            return events.filter((event) => event.type === "permission");
        }

        const commandApproval = "item/commandExecution/requestApproval";
        const reading = (path: string): Message => ({ itemId: "cmd_1", command: `cat ${path}`, cwd: folder, commandActions: [{ type: "read", command: `cat ${path}`, name: "a.md", path }] });
        const elicitation = "mcpServer/elicitation/request";
        const approvalForm = { mode: "form", _meta: { codex_approval_kind: "mcp_tool_call" }, message: "Allow the tool?", requestedSchema: { type: "object", properties: {} } };

        it("refuses a command, and lets one that only reads read the chat's folder alone", async () => {
            const everything: ChatOptions["allowed"] = ["chesspal", "read", "web", "agent"];
            const shell = { itemId: "cmd_1", command: "rm -rf world", cwd: folder, commandActions: [{ type: "unknown", command: "rm -rf world" }] };
            expect(await answered(asking(commandApproval, shell, { decision: "decline" }), everything)).toEqual([{ type: "permission", name: "commandExecution", kind: "shell", allowed: false }]);
            expect(await answered(asking(commandApproval, reading(join(folder, "world", "a.md")), { decision: "accept" }))).toEqual([{ type: "permission", name: "commandExecution", kind: "read", allowed: true }]);
            expect(await answered(asking(commandApproval, reading("/etc/passwd"), { decision: "decline" }))).toEqual([{ type: "permission", name: "commandExecution", kind: "read", allowed: false }]);
            expect(await answered(asking(commandApproval, reading("~/.ssh/id_rsa"), { decision: "decline" }))).toEqual([{ type: "permission", name: "commandExecution", kind: "read", allowed: false }]);
        });

        it("refuses writing and the network", async () => {
            expect(await answered(asking("item/fileChange/requestApproval", { itemId: "patch_1" }, { decision: "decline" }))).toEqual([{ type: "permission", name: "fileChange", kind: "write", allowed: false }]);
            const network = { itemId: "cmd_1", cwd: folder, reason: null, permissions: { network: { enabled: true }, fileSystem: null } };
            // The network for a command is a command's, refused even where the table lets the AI open a page.
            expect(await answered(asking("item/permissions/requestApproval", network, { permissions: {}, scope: "turn" }), tableKinds)).toEqual([{ type: "permission", name: "permissions", kind: "shell", allowed: false }]);
        });

        it("grants more permissions only in the shapes it reads, and only what it read; any other shape is refused", async () => {
            const permissions = "item/permissions/requestApproval";
            const asked = (fileSystem: unknown, network: unknown = null): Message => ({ itemId: "cmd_1", cwd: folder, reason: null, permissions: { network, fileSystem } });
            const inside = join(folder, "games");
            const read = { read: [inside], write: null, entries: null, globScanMaxDepth: null };
            expect(await answered(asking(permissions, asked(read), { permissions: { fileSystem: { read: [inside] } }, scope: "turn" }))).toEqual([{ type: "permission", name: "permissions", kind: "read", allowed: true }]);

            const refused = { permissions: {}, scope: "turn" };
            const odd = [
                asked({ read: [inside], write: "/etc" }),
                asked({ read: [inside], extra: ["/"] }),
                asked({ read: [inside] }, { enabled: true }),
                asked({ read: [inside] }, { domains: ["example.com"] }),
                { itemId: "cmd_1", cwd: folder, permissions: { fileSystem: { read: [inside] }, macos: { accessibility: true } } },
                asked({ read: [inside, 7] }),
                asked({ entries: [{ access: "read", path: { type: "path", path: inside } }] }),
            ];

            for (const params of odd) {
                expect(await answered(asking(permissions, params, refused), ["chesspal", "read", "fetch", "write"])).toEqual([{ type: "permission", name: "permissions", kind: "other", allowed: false }]);
            }
        });

        it("answers an MCP server's approval by the tool of that server running, a chesspal command by its own name", async () => {
            const running = (server: string, tool: string): FlowEntry => item("started", { type: "mcpToolCall", id: "call_1", server, tool, status: "inProgress" });
            const chesspal = asking(elicitation, { serverName: "chesspal", ...approvalForm }, { action: "accept", content: null, _meta: null }, running("chesspal", "roll"));
            expect(await answered(chesspal)).toEqual([{ type: "permission", name: "roll", kind: "chesspal", allowed: true }]);
            const other = asking(elicitation, { serverName: "jira", ...approvalForm }, { action: "decline", content: null, _meta: null }, running("jira", "search"));
            expect(await answered(other)).toEqual([{ type: "permission", name: "jira/search", kind: "other", allowed: false }]);
        });

        it("cancels a form that asks the player, which the table cannot show, and refuses any other request, so that Codex never waits", async () => {
            const question = { serverName: "chesspal", mode: "form", _meta: null, message: "Which road?", requestedSchema: { type: "object", properties: { road: { type: "string" } } } };
            expect(await answered(asking(elicitation, question, { action: "cancel", content: null, _meta: null }))).toEqual([]);
            expect(await answered(asking("item/tool/requestUserInput", { itemId: "x", questions: [], isBlocking: true }, undefined))).toEqual([]);
        });
    });

    describe("the turn's end and the chat's", () => {
        it("asks Codex to interrupt the turn, once, and stops its process when it does not end the turn within 10 seconds", async () => {
            const clock = manualClock();
            const { chat, host, events, until } = play([...begin(), ...threadStart(), ...turn("Hello", ...["One", "Two", "Three", "Four", "Five", "Six"].map((words) => delta(words)))], { later: clock.later }, {
                ignore: ["turn/interrupt"],
            });
            chat.send("Hello");
            await until((all) => all.some((event) => event.type === "text"));
            chat.interrupt();
            chat.interrupt();
            expect(host.written.filter((message) => message.method === "turn/interrupt").map((message) => message.params)).toEqual([{ threadId: thread, turnId: "turn_1" }]);
            clock.advance(10_000);
            expect(events.slice(-2)).toEqual([{ type: "turnEnd", reason: "interrupted" }, { type: "ended", why: "the host did not stop its turn and was closed" }]);
            expect(host.stopped).toBe(true);
        });

        it("ends a turn interrupted before Codex named it once it does, and one whose words were never written at once", async () => {
            const { chat, host, events, until } = play([...begin(), ...threadStart(), ...turn("Hello", delta("One"))]);
            chat.send("Hello");
            await until(() => host.written.some(isTurnStart));
            chat.interrupt();
            await until(() => turnEnds(events).length === 1);
            expect(turnEnds(events)).toEqual([{ type: "turnEnd", reason: "interrupted" }]);
            expect(host.written.filter((message) => message.method === "turn/interrupt")).toHaveLength(1);

            const waiting = play(begin(), {}, { ignore: ["thread/start"] });
            waiting.chat.send("Hello");
            waiting.chat.interrupt();
            expect(turnEnds(waiting.events)).toEqual([{ type: "turnEnd", reason: "interrupted" }]);
        });

        it("fails the turn and ends the chat when the process ends, with its last lines on stderr", async () => {
            const { chat, host, events, until } = play([...begin(), ...threadStart(), { dir: "in", msg: { id: 4, method: "turn/start", params: { input: [{ type: "text", text: "Hello" }] } } }]);
            chat.send("Hello");
            await until(() => host.written.some(isTurnStart));
            host.complain("Error: stream disconnected before completion");
            host.complain("Reconnecting... 5/5");
            host.end("exit code 1");
            const why = "the host's program ended (exit code 1): Error: stream disconnected before completion | Reconnecting... 5/5";
            expect(events.slice(-2)).toEqual([{ type: "turnEnd", reason: "failed", why }, { type: "ended", why }]);
            expect(host.stops).toBe(0);
        });

        it("ends the chat when its program is not there, saying so", async () => {
            const chat = codex.open({ folder: makeTempFolder(), program: { command: join(makeTempFolder(), "no-such-program"), args: [] }, model, allowed: ["chesspal"], environment: process.env });
            const { events, until } = listen(chat);
            await until(() => events.some((event) => event.type === "ended"));
            expect(events.at(-1)).toMatchObject({ type: "ended", why: expect.stringContaining("the host's program ended (spawn") });
        });

        it("tells nothing after close, and stops the process once", async () => {
            const { chat, host, events, until } = play([...begin(), ...threadStart(), ...turn("Hello", delta("One"))]);
            chat.send("Hello");
            await until((all) => all.some((event) => event.type === "text"));
            const told = events.length;
            chat.close();
            chat.close();
            await ticksUntil(() => true);
            expect(events).toHaveLength(told);
            expect(host.stops).toBe(1);
        });

        it("closed gently, as the table ends it, closes the program's input and stops it only ten seconds later, where it is still there", async () => {
            const clock = manualClock();
            const { chat, host, until } = play([...begin(), ...threadStart(), ...turn("Hello", delta("One"))], { later: clock.later });
            chat.send("Hello");
            await until((all) => all.some((event) => event.type === "text"));
            chat.close(true);
            expect(host.inputClosed).toBe(true);
            clock.advance(9999);
            expect(host.stops).toBe(0);
            clock.advance(1);
            expect(host.stops).toBe(1);
        });
    });
});

describe("Codex as the table drives it", () => {
    it("refuses a server or instructions from the table, before starting any process", () => {
        for (const given of [{ server: { name: "chesspal", command: "node", args: [], environment: { KEY: "secret" } } }, { instructions: "You play chess." }]) {
            const host = fakeCodex([]);
            expect(() => codex.open({ ...options(host), ...given })).toThrow("Codex's driver does not take its server or its instructions from the table yet.");
            expect(host.started).toBeUndefined();
        }
    });

    const exe = process.platform === "win32" ? "codex.exe" : "codex";
    const separator = process.platform === "win32" ? ";" : ":";

    /** Files in a new folder of the test's; the folder. */
    function folderWith(...files: string[]): string
    {
        const made = makeTempFolder();
        files.forEach((file) => {
            mkdirSync(join(made, file, ".."), { recursive: true });
            writeFileSync(join(made, file), file.endsWith("package.json") ? JSON.stringify({ name: "@openai/codex", bin: { codex: "bin/codex.js" } }) : "");
        });
        return made;
    }

    it("proposes no model of its own, the first Codex lists being the account's default, and knows the efforts Codex offers", () => {
        expect(codex.model).toBe("");
        expect(codex.efforts).toEqual(["low", "medium", "high", "xhigh", "max", "ultra"]);
    });

    it("finds its own program in a folder of the PATH, then as npm installed its package, run with this node", () => {
        const onPath = folderWith(exe);
        const npm = folderWith("codex.cmd", join("node_modules", "@openai", "codex", "package.json"), join("node_modules", "@openai", "codex", "bin", "codex.js"));
        expect(codex.program({ Path: [makeTempFolder(), onPath].join(separator) }, process.platform, makeTempFolder())).toEqual({ command: join(onPath, exe), args: [] });
        expect(codex.program({ PATH: npm }, process.platform, makeTempFolder())).toEqual({ command: process.execPath, args: [join(npm, "node_modules", "@openai", "codex", "bin", "codex.js")] });
    });

    it("never takes a shim that needs a shell, nor a package whose program is missing", () => {
        const shims = folderWith("codex.cmd", "codex.ps1", join("node_modules", "@openai", "codex", "package.json"));
        expect(codex.program({ PATH: shims }, "win32", makeTempFolder())).toBeUndefined();
    });

    it("says what a folder lacks for it, and how to mend it: its .codex/config.toml", () => {
        expect(codex.missing(folderWith(join(".codex", "config.toml")))).toBeUndefined();
        expect(codex.missing(makeTempFolder())).toContain("no .codex/config.toml");
    });

    it("gives Codex the table's environment without what belongs to a Codex thread it runs in, in a copy", () => {
        const given = { PATH: "/bin", CODEX_HOME: "/home/player/.codex", CODEX_THREAD_ID: "t", codex_sandbox: "seatbelt", CODEX_SANDBOX_NETWORK_DISABLED: "1" };
        const environment = codex.environment(given);
        expect(environment).toEqual({ PATH: "/bin", CODEX_HOME: "/home/player/.codex" });
        expect(environment).not.toBe(given);
    });

    describe("its models", () => {
        it("are those Codex lists, the default first, each with its efforts, asked with no thread opened", async () => {
            const host = fakeCodex(loadFlow("codex/models"));
            const models = await codex.models({ folder, program: { command: "codex-program", args: [] }, environment: { HOME: "/home/player" }, start: host.start });
            expect(host.started?.args).toEqual(["app-server", "-c", "check_for_update_on_startup=false"]);
            expect(models).toHaveLength(10);
            expect(models[0]).toEqual({
                id: "gpt-6.2-sol",
                name: "GPT-6.2-Sol",
                about: "Fast, go-to model for coding and everyday work.",
                efforts: ["low", "medium", "high", "xhigh", "max", "ultra"],
                advised: true,
            });
            expect(models.slice(1).some((one) => one.advised === true || one.metered === true || one.group !== undefined)).toBe(false);
            expect(models.find((one) => one.id === model)?.efforts).toEqual(["low", "medium", "high", "xhigh", "max"]);
            expect(host.written.map((message) => message.method)).toEqual(["initialize", "initialized", "model/list"]);
            expect(host.problems).toEqual([]);
            expect(host.inputClosed).toBe(true);
            expect(host.stopped).toBe(false);
        });

        it("are none where it does not answer within 10 seconds, the program let go and stopped only ten seconds later, or cannot start", async () => {
            const clock = manualClock();
            const host = fakeCodex([], { ignore: ["initialize"] });
            const asking = codex.models({ folder, program: { command: "codex-program", args: [] }, environment: {}, start: host.start, later: clock.later });
            clock.advance(10_000);
            expect(await asking).toEqual([]);
            expect(host.stopped).toBe(false);
            clock.advance(10_000);
            expect(host.stopped).toBe(true);
            expect(await codex.models({ folder, program: { command: join(makeTempFolder(), "no-such-program"), args: [] }, environment: process.env })).toEqual([]);
        });
    });
});

/** The driver on a fake Codex. */
function open(flow: FlowEntry[], overrides: Partial<ChatOptions> = {}, fake: FakeCodexOptions = {}): { chat: HostChat; host: FakeHost; }
{
    const host = fakeCodex(flow, fake);
    return { chat: codex.open({ ...options(host), ...overrides }), host };
}

function play(flow: FlowEntry[], overrides: Partial<ChatOptions> = {}, fake: FakeCodexOptions = {}): ReturnType<typeof open> & ReturnType<typeof listen>
{
    const opened = open(flow, overrides, fake);
    return { ...opened, ...listen(opened.chat) };
}

function options(host: FakeHost): ChatOptions
{
    return { folder, program: { command: "codex-program", args: ["--first"] }, model, allowed: ["chesspal"], environment: { HOME: "/home/player" }, start: host.start };
}

/** The protocol begun and the account read, as Codex answers. */
function begin(account: Message = { account: { type: "chatgpt", email: null, planType: "plus", workspaceName: null }, userId: null, requiresOpenaiAuth: true }): FlowEntry[]
{
    return [
        { dir: "in", msg: { id: 1, method: "initialize", params: {} } },
        { dir: "out", msg: { id: 1, result: { userAgent: "chesspal/0.171.0", platformFamily: "unix", platformOs: "linux" } } },
        { dir: "in", msg: { method: "initialized" } },
        { dir: "in", msg: { id: 2, method: "account/read", params: {} } },
        { dir: "out", msg: { id: 2, result: account } },
    ];
}

/** A new thread: the fake answers it with the model and effort asked. */
function threadStart(): FlowEntry[]
{
    return [
        { dir: "in", msg: { id: 3, method: "thread/start", params: {} } },
        { dir: "out", msg: { id: 3, result: { thread: { id: thread }, approvalPolicy: "on-request", sandbox: { type: "readOnly", networkAccess: false } } } },
    ];
}

// The recorded ids of the turns' requests, apart from the driver's.
let turns = 0;

/** A turn: the player's words, Codex's answer naming the turn, its notifications, and its end, completed or as given. */
function turn(words: string, ...then: (FlowEntry | Message)[]): FlowEntry[]
{
    turns += 1;
    const id = 100 + turns;
    const end = then.find((one): one is Message => !("dir" in one)) ?? { status: "completed", error: null };
    return [
        { dir: "in", msg: { id, method: "turn/start", params: { threadId: thread, input: [{ type: "text", text: words, text_elements: [] }] } } },
        { dir: "out", msg: { id, result: { turn: { id: "turn_1", items: [], status: "inProgress", error: null } } } },
        ...then.filter((one): one is FlowEntry => "dir" in one),
        notice("turn/completed", { turn: { id: "turn_1", items: [], ...end } }),
    ];
}

function delta(text: string, message = "m1"): FlowEntry
{
    return notice("item/agentMessage/delta", { turnId: "turn_1", itemId: message, delta: text });
}

function item(phase: "started" | "completed", fields: Message): FlowEntry
{
    return notice(`item/${phase}`, { turnId: "turn_1", item: fields });
}

function notice(method: string, params: Message): FlowEntry
{
    return { dir: "out", msg: { method, params: { threadId: thread, ...params } } };
}
