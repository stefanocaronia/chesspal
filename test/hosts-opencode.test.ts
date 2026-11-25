import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { type ChatOptions, hostDriver, type HostEvent, openHostChat } from "../src/hosts/index.ts";
import type { LineProcess } from "../src/hosts/process.ts";
import { checklist, type Scenario } from "./hosts/checklist.ts";
import { fakeAgent, type FakeAgentOptions, isModelSetting, isPrompt, joinedTexts, promptWords, sessionOfFlow } from "./hosts/fake-agent.ts";
import { type FakeHost, type FlowEntry, listen, loadFlow, manualClock, ticksUntil, turnEnds } from "./hosts/fake-host.ts";
import { makeTempFolder, removeTempFolders } from "./hosts/temp.ts";

afterAll(removeTempFolders);

type Message = Record<string, unknown>;

const folder = "/players/test";
const model = "ollama/gpt-oss:20b";
// The flows recorded with OpenCode 2.3.0: a new chat whose model calls chesspal's commands as tools of their own, which fail; a chat taken up that runs one in
// execute. OpenCode asked no permission in those runs: the refused flow is the second's execute with a permission request in the protocol's shape.
const recorded: Record<Scenario, string> = { prose: "new", refused: "refused", interrupt: "new", resumed: "load" };

checklist({
    host: "OpenCode",
    open: (scenario) => {
        const flow = loadFlow(`opencode/${recorded[scenario]}`);
        const session = scenario === "resumed" ? sessionOfFlow(flow) : undefined;
        const { chat, host } = open(flow, { allowed: scenario === "refused" ? ["read"] : ["chesspal", "read"], ...(session === undefined ? {} : { session }) });
        return { chat, host, turns: promptWords(flow), texts: joinedTexts(flow), ...(session === undefined ? {} : { session }), interruptTurn: 0 };
    },
    isModelRequest: isModelSetting,
    isPlayerWords: isPrompt,
});

describe("the chat in OpenCode", () => {
    describe("its program", () => {
        it("starts as opencode acp after its own arguments, in the chat's folder, which PWD names too", () => {
            const host = fakeAgent([]);
            openHostChat("openCode", { ...options(host), environment: { HOME: "/home/player", pwd: "/elsewhere" } });
            expect(host.started?.command).toBe("opencode-program");
            expect(host.started?.args).toEqual(["--first", "acp"]);
            expect(host.started?.options.cwd).toBe(folder);
            expect(host.started?.options.env).toEqual({ HOME: "/home/player", PWD: folder });
        });

        it("begins the protocol, then opens a new session in the chat's folder with no MCP server of the table's", async () => {
            const { host, until } = play([...begin(), ...newSession()]);
            await until(() => host.written.length >= 3);
            expect(host.written.map((message) => message.method)).toEqual(["initialize", "session/new", "session/set_config_option"]);
            expect(host.written[0]!.params).toMatchObject({ protocolVersion: 1, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false } });
            expect(host.written[1]!.params).toEqual({ cwd: folder, mcpServers: [] });
        });
    });

    describe("the model", () => {
        it("sets the model and then the effort, each confirmed, before it writes the player's words", async () => {
            const flow = [...begin(), ...newSession([modelOption(), effortOption()]), ...setting("model", model, [modelOption(model), effortOption()]), ...turn("Hello", text("Fine"))];
            const { chat, host, events, until } = play(flow, { effort: "high" });
            chat.send("Hello");
            await until(() => turnEnds(events).length === 1);
            expect(host.written.map((message) => [message.method, (message.params as Message).configId ?? null])).toEqual([
                ["initialize", null],
                ["session/new", null],
                ["session/set_config_option", "model"],
                ["session/set_config_option", "effort"],
                ["session/prompt", null],
            ]);
            expect(host.written[3]!.params).toEqual({ sessionId: "ses_1", configId: "effort", value: "high" });
            expect(events).toEqual([
                { type: "session", session: "ses_1", model },
                { type: "text", block: 0, text: "Fine" },
                { type: "turnEnd", reason: "done" },
            ]);
            expect(host.problems).toEqual([]);
        });

        it("takes no effort where the model has no such option", async () => {
            const { chat, host, events, until } = play([...begin(), ...newSession(), ...turn("Hello", text("Fine"))], { effort: "high" });
            chat.send("Hello");
            await until(() => turnEnds(events).length === 1);
            expect(host.written.filter((message) => message.method === "session/set_config_option")).toHaveLength(1);
            expect(host.problems).toEqual([]);
        });

        it("ends the chat, writing none of the player's words, when the agent runs another model than the one asked", async () => {
            const { chat, host, events, until } = play([...begin(), ...newSession(), ...turn("Hello", text("leaked"))], {}, { models: { [model]: "opencode/free" } });
            chat.send("Hello");
            await until(() => events.some((event) => event.type === "ended"));
            const why = `the host was asked for the model ${model} and runs opencode/free`;
            expect(events).toEqual([{ type: "turnEnd", reason: "failed", why }, { type: "ended", why }]);
            expect(host.written.some(isPrompt)).toBe(false);
            expect(host.stopped).toBe(true);
        });

        it("ends the chat with the agent's words when it refuses the model", async () => {
            const { chat, events, until } = play([...begin(), ...newSession()], {}, { failing: ["session/set_config_option"] });
            chat.send("Hello");
            await until(() => events.some((event) => event.type === "ended"));
            expect(events.at(-1)).toEqual({ type: "ended", why: `the host did not take the model ${model}: session/set_config_option failed` });
        });

        it("ends the chat when the agent opens no session, saying why", async () => {
            const { events, until } = play(begin(), {}, { failing: ["session/new"] });
            await until(() => events.some((event) => event.type === "ended"));
            expect(events).toEqual([{ type: "ended", why: "the host did not open the chat: session/new failed" }]);
        });

        it("ends the chat when the agent is not signed in, saying how to sign it in", async () => {
            const { events, until } = play([...begin(), { dir: "in", msg: { jsonrpc: "2.0", id: 2, method: "session/new", params: {} } }, {
                dir: "out",
                msg: { jsonrpc: "2.0", id: 2, error: { code: -32000, message: "Authentication required" } },
            }]);
            await until(() => events.some((event) => event.type === "ended"));
            expect(events).toEqual([{ type: "ended", why: "the host did not open the chat: Authentication required: run opencode auth login in a terminal, then try again" }]);
        });

        it("ends the chat when the agent is not ready within 60 seconds", async () => {
            const clock = manualClock();
            const { chat, host, events, until } = play([...begin(), ...newSession()], { later: clock.later }, { ignore: ["session/set_config_option"] });
            chat.send("Hello");
            await until(() => host.written.some(isModelSetting));
            clock.advance(59_999);
            expect(events).toEqual([]);
            clock.advance(1);
            const why = `the host was not ready to play with the model ${model} within 60 seconds`;
            expect(events).toEqual([{ type: "turnEnd", reason: "failed", why }, { type: "ended", why }]);
            expect(host.stopped).toBe(true);
        });

        it("fails the turn whose model the agent changes, and asks the model again before the next words", async () => {
            const changed = update({ sessionUpdate: "config_option_update", configOptions: [modelOption("opencode/free")] });
            const flow = [...begin(), ...newSession(), ...turn("Hello", text("Fine"), changed, text("leaked")), ...turn("Again", text("Back"))];
            const { chat, host, events, until } = play(flow);
            chat.send("Hello");
            await until(() => turnEnds(events).length === 1);
            expect(turnEnds(events)).toEqual([{ type: "turnEnd", reason: "failed", why: `the host runs the model opencode/free instead of ${model}` }]);
            expect(events.filter((event) => event.type === "text").map((event) => event.type === "text" && event.text)).toEqual(["Fine"]);
            expect(host.written).toContainEqual({ jsonrpc: "2.0", method: "session/cancel", params: { sessionId: "ses_1" } });
            expect(host.written.filter(isModelSetting)).toHaveLength(2);
        });
    });

    describe("the AI's prose and tools", () => {
        it("tells Chesspal's commands called as tools by their own names, failed, and the other tools by theirs", async () => {
            const flow = loadFlow("opencode/new");
            const { chat, events, until } = play(flow);
            chat.send(promptWords(flow)[0]!);
            await until(() => turnEnds(events).length === 1);
            expect(events.filter((event) => event.type === "tool")).toEqual([
                { type: "tool", id: "call_00000001", name: "instructions", kind: "chesspal", state: "started" },
                { type: "tool", id: "call_00000001", name: "instructions", kind: "chesspal", state: "failed" },
                { type: "tool", id: "call_00000002", name: "status", kind: "chesspal", state: "started" },
                { type: "tool", id: "call_00000002", name: "status", kind: "chesspal", state: "failed" },
                { type: "tool", id: "call_00000003", name: "skill", kind: "other", state: "started" },
                { type: "tool", id: "call_00000003", name: "skill", kind: "other", state: "failed" },
            ]);
        });

        it("tells the commands execute ran, as its update names them at its end, before its own end", async () => {
            const flow = loadFlow("opencode/load");
            const { chat, events, until } = play(flow, { session: sessionOfFlow(flow) });
            chat.send(promptWords(flow)[0]!);
            await until(() => turnEnds(events).length === 1);
            expect(events.filter((event) => event.type === "tool")).toEqual([
                { type: "tool", id: "call_00000004", name: "execute", kind: "chesspal", state: "started" },
                { type: "tool", id: "call_00000004/0", name: "status", kind: "chesspal", state: "started" },
                { type: "tool", id: "call_00000004/0", name: "status", kind: "chesspal", state: "done" },
                { type: "tool", id: "call_00000004", name: "execute", kind: "chesspal", state: "done" },
            ]);
        });

        it("tells nothing of the history the agent replays as it takes a chat up", async () => {
            const flow = loadFlow("opencode/load");
            const { chat, host, events, until } = play(flow, { session: sessionOfFlow(flow) });
            chat.send(promptWords(flow)[0]!);
            await until(() => turnEnds(events).length === 1);
            expect(host.written[1]).toMatchObject({ method: "session/load", params: { cwd: folder, mcpServers: [], sessionId: sessionOfFlow(flow) } });
            expect(events.filter((event) => event.type === "text").map((event) => event.type === "text" && event.text).join("")).toBe(joinedTexts(flow)[0]!.join(""));
            expect(events.filter((event) => event.type === "tool").every((event) => event.id === "call_00000004" || event.id.startsWith("call_00000004/"))).toBe(true);
            expect(host.problems).toEqual([]);
        });

        it("numbers a new block for each message of the agent and after a tool", async () => {
            const tool = [
                update({ sessionUpdate: "tool_call", toolCallId: "call_1", name: "chesspal.roll", title: "chesspal.roll", kind: "other", status: "pending", rawInput: {} }),
                update({ sessionUpdate: "tool_call_update", toolCallId: "call_1", status: "completed" }),
            ];
            const flow = [...begin(), ...newSession(), ...turn("Hello", text("One", "m1"), text(" more", "m1"), text("Two", "m2"), ...tool, text("Three", "m2"))];
            const { chat, events, until } = play(flow);
            chat.send("Hello");
            await until(() => turnEnds(events).length === 1);
            expect(events.filter((event) => event.type === "text")).toEqual([
                { type: "text", block: 0, text: "One" },
                { type: "text", block: 0, text: " more" },
                { type: "text", block: 1, text: "Two" },
                { type: "text", block: 2, text: "Three" },
            ]);
        });

        it("stops the turn, failed, where the agent ran without asking a tool the table does not allow, a read outside the folder, or another server's tool within execute", async () => {
            const ran = async (fields: Message, end: Message = {}): Promise<HostEvent[]> => {
                const tool = [
                    update({ sessionUpdate: "tool_call", toolCallId: "call_1", status: "pending", ...fields }),
                    update({ sessionUpdate: "tool_call_update", toolCallId: "call_1", status: "in_progress" }),
                    update({ sessionUpdate: "tool_call_update", toolCallId: "call_1", status: "completed", rawInput: {}, ...end }),
                ];
                const { chat, host, events, until } = play([...begin(), ...newSession(), ...turn("Hello", ...tool, text("leaked"))], { allowed: ["chesspal", "read"] });
                chat.send("Hello");
                await until(() => turnEnds(events).length === 1);
                expect(host.written.filter((message) => message.method === "session/cancel")).toEqual([{ jsonrpc: "2.0", method: "session/cancel", params: { sessionId: "ses_1" } }]);
                expect(events.some((event) => event.type === "text")).toBe(false);
                return turnEnds(events);
            };

            const failed = (why: string): HostEvent[] => [{ type: "turnEnd", reason: "failed", why: `the host ran a tool without asking: ${why}` }];

            expect(await ran({ name: "bash", kind: "execute", rawInput: { command: "curl example.com" } })).toEqual(failed("the table does not let the AI use bash"));
            expect(await ran({ name: "shell", kind: "execute", rawInput: { command: "curl example.com" } })).toEqual(failed("the table does not let the AI use shell"));
            expect(await ran({ name: "webfetch", kind: "fetch", rawInput: { url: "https://example.com" } })).toEqual(failed("the table does not let the AI use webfetch"));
            expect(await ran({ name: "read", kind: "read", rawInput: { filePath: "/home/player/.ssh/id_rsa" } })).toEqual(
                failed("read read /home/player/.ssh/id_rsa, and the table lets the AI read only the chat's folder"),
            );
            const code = { name: "execute", kind: "other", rawInput: { code: "await tools.chesspal.status(); await tools.jira.search();" } };
            expect(await ran(code)).toEqual(failed("the table does not let the AI use execute"));
            const metadata = { rawOutput: { metadata: { toolCalls: [{ tool: "chesspal.status", status: "completed" }, { tool: "jira.search", status: "completed" }] } } };
            expect(await ran({ ...code, rawInput: { code: "await tools.chesspal.status();" } }, metadata)).toEqual(failed("the table does not let the AI use jira.search"));
        });

        it("lets a tool run that the table allowed when asked, or of a kind it allows, reading inside the folder", async () => {
            const options = [{ optionId: "once", kind: "allow_once" }, { optionId: "no", kind: "reject_once" }];
            const asked = { toolCallId: "call_1", name: "chesspal.roll", kind: "other", rawInput: {} };
            const flow = [
                ...begin(),
                ...newSession(),
                ...turn(
                    "Hello",
                    update({ sessionUpdate: "tool_call", status: "pending", ...asked }),
                    { dir: "out", msg: { jsonrpc: "2.0", id: "ask-1", method: "session/request_permission", params: { sessionId: "ses_1", toolCall: asked, options } } },
                    { dir: "in", msg: { jsonrpc: "2.0", id: "ask-1", result: { outcome: { outcome: "selected", optionId: "once" } } } },
                    update({ sessionUpdate: "tool_call_update", toolCallId: "call_1", status: "completed" }),
                    update({ sessionUpdate: "tool_call", toolCallId: "call_2", name: "read", kind: "read", status: "completed", rawInput: { filePath: join(folder, "a.md") } }),
                    update({ sessionUpdate: "tool_call", toolCallId: "call_3", name: "list", kind: "read", status: "completed", rawInput: {} }),
                    text("Done."),
                ),
            ];
            const { chat, host, events, until } = play(flow, { allowed: ["chesspal", "read"] });
            chat.send("Hello");
            await until(() => turnEnds(events).length === 1);
            expect(turnEnds(events)).toEqual([{ type: "turnEnd", reason: "done" }]);
            expect(host.problems).toEqual([]);
        });

        it("fails a turn the agent stops short, in words a player reads, or with the agent's error", async () => {
            const flow = [...begin(), ...newSession(), ...turn("Hello", "max_tokens"), ...turn("Again", "something_new")];
            const { chat, events, until } = play(flow);
            chat.send("Hello");
            await until(() => turnEnds(events).length === 1);
            chat.send("Again");
            await until(() => turnEnds(events).length === 2);
            expect(turnEnds(events)).toEqual([
                { type: "turnEnd", reason: "failed", why: "the AI's answer reached the longest its model may write" },
                { type: "turnEnd", reason: "failed", why: "the host stopped the turn: something_new" },
            ]);
        });
    });

    describe("a subagent's session", () => {
        // The table's own kinds: any subagent is allowed.
        const tableKinds: ChatOptions["allowed"] = ["chesspal", "read", "web", "agent", "image"];

        /** The AI's own words of a recorded flow, all its turns joined: never those of a subagent's session. */
        function chatWords(flow: FlowEntry[]): string
        {
            const updates = flow.map((entry) => (entry.dir === "out" && isObject(entry.msg.params) ? entry.msg.params.update : undefined)).filter(isObject);
            return updates.filter((one) => one.sessionUpdate === "agent_message_chunk" && one._meta === undefined).map((one) => String((one.content as Message).text)).join("");
        }

        /** A recorded flow played with the model it asked, each of its turns sent once the one before ended. */
        async function played(name: string): Promise<{ events: HostEvent[]; host: FakeHost; flow: FlowEntry[]; }>
        {
            const flow = loadFlow(name);
            const asked = flow.find((entry) => entry.dir === "in" && isModelSetting(entry.msg))?.msg.params as Message;
            const { chat, host, events, until } = play(flow, { model: String(asked.value), allowed: tableKinds });

            for (const [index, words] of promptWords(flow).entries()) {
                await until(() => turnEnds(events).length === index);
                chat.send(words);
            }

            await until(() => turnEnds(events).length === promptWords(flow).length);
            return { events, host, flow };
        }

        it("never tells its words as the AI's: what the subagent keeps secret stays out of the chat (recorded, gpt-oss)", async () => {
            const { events, host, flow } = await played("opencode/voice-child-session");
            const told = events.filter((event) => event.type === "text").map((event) => event.type === "text" && event.text).join("");
            expect(told).toBe(chatWords(flow));
            expect(told).not.toContain("Keeps");
            expect(turnEnds(events)).toEqual([{ type: "turnEnd", reason: "done" }, { type: "turnEnd", reason: "done" }]);
            expect(host.problems).toEqual([]);
        });

        it("never tells its tools as the AI's, the subagent's start alone; its chesspal commands run within the AI's limits (recorded, DeepSeek)", async () => {
            const { events, flow } = await played("opencode/voice-child-tools");
            const tools = events.filter((event) => event.type === "tool" && event.state === "started").map((event) => event.type === "tool" && event.id);
            expect(tools.some((id) => String(id).startsWith("ses_"))).toBe(false);
            expect(events.filter((event) => event.type === "tool" && event.kind === "agent" && event.state === "done")).toEqual([{ type: "tool", id: expect.any(String), name: "subagent", kind: "agent", state: "done" }]);
            expect(events.filter((event) => event.type === "text").map((event) => event.type === "text" && event.text).join("")).toBe(chatWords(flow));
            expect(turnEnds(events)).toEqual([{ type: "turnEnd", reason: "done" }]);
        });

        /** A turn whose subagent, started as given, runs a tool of its session's: the turn's end. */
        async function childRuns(start: Message, ran: Message, allowed: ChatOptions["allowed"] = tableKinds): Promise<HostEvent[]>
        {
            const child = { "opencode/child-session": { id: "ses_child", parentID: "ses_1", depth: 1, title: "Bertoldo" } };
            const flow = [
                ...begin(),
                ...newSession(),
                ...turn(
                    "Hello",
                    update({ sessionUpdate: "tool_call", toolCallId: "a1", status: "in_progress", kind: "think", name: "subagent", rawInput: start }),
                    update({ sessionUpdate: "tool_call_update", toolCallId: "a1", status: "completed", rawOutput: { metadata: { sessionID: "ses_child" } } }),
                    update({ sessionUpdate: "tool_call", toolCallId: "ses_child:c1", status: "in_progress", kind: "other", ...ran, _meta: child }),
                    update({ sessionUpdate: "tool_call_update", toolCallId: "ses_child:c1", status: "completed", _meta: child }),
                    update({ sessionUpdate: "agent_message_chunk", messageId: "k1", content: { type: "text", text: "Keeps: the key." }, _meta: child }),
                    text("The innkeeper shrugs."),
                ),
            ];
            const { chat, events, until } = play(flow, { allowed });
            chat.send("Hello");
            await until(() => turnEnds(events).length === 1);
            expect(events.filter((event) => event.type === "text").map((event) => event.type === "text" && event.text).join("")).not.toContain("Keeps");
            return turnEnds(events);
        }

        it("holds a tool the subagent ran without asking to the AI's limits: a shell, or a read outside the chat's folder, fails the turn", async () => {
            const any = { agent: "general", prompt: "Bertoldo" };
            expect(await childRuns(any, { name: "execute", rawInput: { code: "return await tools.chesspal.view({ as: 'Bertoldo' });" } })).toEqual([{ type: "turnEnd", reason: "done" }]);
            expect(await childRuns(any, { name: "bash", rawInput: { command: "dir" } })).toEqual([{ type: "turnEnd", reason: "failed", why: "the host ran a tool without asking: the table does not let the AI use bash" }]);
            expect(await childRuns(any, { name: "read", rawInput: { filePath: "/home/player/.ssh/id_rsa" } })).toEqual([{
                type: "turnEnd",
                reason: "failed",
                why: "the host ran a tool without asking: read read /home/player/.ssh/id_rsa, and the table lets the AI read only the chat's folder",
            }]);
        });

        it("fails the turn for a subagent where the table does not allow one, and for a session no subagent the table allows started", async () => {
            const noAgent = tableKinds.filter((kind) => kind !== "agent");
            expect(await childRuns({ agent: "general", prompt: "Look around" }, { name: "execute", rawInput: { code: "return 1;" } }, noAgent)).toEqual([{
                type: "turnEnd",
                reason: "failed",
                why: "the host ran a tool without asking: the table does not let the AI use subagent",
            }]);

            const flow = [
                ...begin(),
                ...newSession(),
                ...turn(
                    "Hello",
                    update({ sessionUpdate: "agent_message_chunk", messageId: "k1", content: { type: "text", text: "Keeps: the key." }, _meta: { "opencode/child-session": { id: "ses_other" } } }),
                    text("Never told."),
                ),
            ];
            const { chat, events, until } = play(flow, { allowed: tableKinds });
            chat.send("Hello");
            await until(() => turnEnds(events).length === 1);
            expect(turnEnds(events)).toEqual([{ type: "turnEnd", reason: "failed", why: "the host ran a subagent the table did not let the AI start" }]);
            expect(events.filter((event) => event.type === "text")).toEqual([]);
        });
    });

    describe("permissions", () => {
        /** A turn whose agent asks for a tool, and the option the table must choose. */
        function asking(call: Message, chosen: string): FlowEntry[]
        {
            const options = [{ optionId: "once", kind: "allow_once" }, { optionId: "always", kind: "allow_always" }, { optionId: "no", kind: "reject_once" }];
            return [
                ...begin(),
                ...newSession(),
                { dir: "in", msg: { jsonrpc: "2.0", id: 9, method: "session/prompt", params: { sessionId: "ses_1", prompt: [{ type: "text", text: "Hello" }] } } },
                { dir: "out", msg: { jsonrpc: "2.0", id: "ask-1", method: "session/request_permission", params: { sessionId: "ses_1", toolCall: { toolCallId: "call_1", ...call }, options } } },
                { dir: "in", msg: { jsonrpc: "2.0", id: "ask-1", result: { outcome: { outcome: "selected", optionId: chosen } } } },
                { dir: "out", msg: { jsonrpc: "2.0", id: 9, result: { stopReason: "end_turn" } } },
            ];
        }

        async function answered(call: Message, chosen: string, allowed: ChatOptions["allowed"] = ["chesspal", "read"]): Promise<HostEvent[]>
        {
            const { chat, host, events, until } = play(asking(call, chosen), { allowed });
            chat.send("Hello");
            await until(() => turnEnds(events).length === 1);
            expect(host.problems).toEqual([]);
            return events.filter((event) => event.type === "permission");
        }

        it("allows once a chesspal command run in execute, and refuses it once where the kind is not allowed", async () => {
            const call = { name: "execute", title: "execute", kind: "other", rawInput: { code: "await tools.chesspal.roll({ dice: '1d20' });" } };
            expect(await answered(call, "once")).toEqual([{ type: "permission", name: "execute", kind: "chesspal", allowed: true }]);
            expect(await answered(call, "no", ["read"])).toEqual([{ type: "permission", name: "execute", kind: "chesspal", allowed: false }]);
        });

        it("refuses execute whose code reaches another server's tools, or the tools by another name", async () => {
            for (const code of ["await tools.chesspal.status(); await tools.jira.search();", "const t = tools; await t.chesspal.status();", "await tools['chesspal'].status(); await tools[name].x();"]) {
                expect(await answered({ name: "execute", rawInput: { code } }, "no"), code).toEqual([{ type: "permission", name: "execute", kind: "other", allowed: false }]);
            }

            expect(await answered({ name: "execute", rawInput: { code: 'await tools["chesspal"].status();' } }, "once")).toEqual([{ type: "permission", name: "execute", kind: "chesspal", allowed: true }]);
        });

        it("lets a tool that reads read the chat's folder alone, refusing one that shows no input", async () => {
            expect(await answered({ name: "read", rawInput: { filePath: join(folder, "world", "a.md") } }, "once")).toEqual([{ type: "permission", name: "read", kind: "read", allowed: true }]);
            expect(await answered({ name: "read", rawInput: { filePath: "../secrets.txt" } }, "no")).toEqual([{ type: "permission", name: "read", kind: "read", allowed: false }]);
            expect(await answered({ name: "list", locations: [{ path: "/etc" }], rawInput: {} }, "no")).toEqual([{ type: "permission", name: "list", kind: "read", allowed: false }]);
            expect(await answered({ name: "glob", rawInput: { pattern: "**/*.md" } }, "once")).toEqual([{ type: "permission", name: "glob", kind: "read", allowed: true }]);
            expect(await answered({ name: "glob", rawInput: { pattern: "../**/*.md" } }, "no")).toEqual([{ type: "permission", name: "glob", kind: "read", allowed: false }]);
            expect(await answered({ name: "read" }, "no")).toEqual([{ type: "permission", name: "read", kind: "read", allowed: false }]);
            expect(await answered({ name: "read", rawInput: {} }, "no")).toEqual([{ type: "permission", name: "read", kind: "read", allowed: false }]);
        });

        it("reads every path an input names, by any name, and never forgets one said before; a pattern with braces is refused", async () => {
            const refused = [{ type: "permission", name: "read", kind: "read", allowed: false }];
            expect(await answered({ name: "read", rawInput: { dirPath: "/etc" } }, "no")).toEqual(refused);
            expect(await answered({ name: "read", rawInput: { file: "C:\\Windows\\win.ini" } }, "no")).toEqual(refused);
            expect(await answered({ name: "read", rawInput: { filePath: join(folder, "a.md"), paths: [join(folder, "b.md"), "/etc/passwd"] } }, "no")).toEqual(refused);
            expect(await answered({ name: "glob", rawInput: { pattern: "{..,x}/**" } }, "no")).toEqual([{ type: "permission", name: "glob", kind: "read", allowed: false }]);
            expect(await answered({ name: "grep", rawInput: { pattern: "secret", include: "*.{md,yaml}" } }, "no")).toEqual([{ type: "permission", name: "grep", kind: "read", allowed: false }]);

            const options = [{ optionId: "once", kind: "allow_once" }, { optionId: "no", kind: "reject_once" }];
            // A listing with no path lists the folder: the path said before is what it lists.
            const toolCall = { toolCallId: "call_1", name: "list", kind: "read", rawInput: {} };
            const flow = [
                ...begin(),
                ...newSession(),
                ...turn(
                    "Hello",
                    update({ sessionUpdate: "tool_call", toolCallId: "call_1", name: "list", kind: "read", status: "pending", rawInput: { path: "/home/player/.ssh" } }),
                    { dir: "out", msg: { jsonrpc: "2.0", id: "ask-1", method: "session/request_permission", params: { sessionId: "ses_1", toolCall, options } } },
                    { dir: "in", msg: { jsonrpc: "2.0", id: "ask-1", result: { outcome: { outcome: "selected", optionId: "no" } } } },
                ),
            ];
            const { chat, host, events, until } = play(flow, { allowed: ["chesspal", "read"] });
            chat.send("Hello");
            await until(() => turnEnds(events).length === 1);
            expect(events.filter((event) => event.type === "permission")).toEqual([{ type: "permission", name: "list", kind: "read", allowed: false }]);
            expect(host.problems).toEqual([]);
        });

        it("chooses only an option for this once, and cancels where there is none, or once the turn is asked to stop", async () => {
            const lasting = [{ optionId: "always", kind: "allow_always" }, { optionId: "never", kind: "reject_always" }];
            const flow = (call: Message): FlowEntry[] => [
                ...begin(),
                ...newSession(),
                { dir: "in", msg: { jsonrpc: "2.0", id: 9, method: "session/prompt", params: { sessionId: "ses_1", prompt: [{ type: "text", text: "Hello" }] } } },
                { dir: "out", msg: { jsonrpc: "2.0", id: "ask-1", method: "session/request_permission", params: { sessionId: "ses_1", toolCall: { toolCallId: "call_1", ...call }, options: lasting } } },
                { dir: "in", msg: { jsonrpc: "2.0", id: "ask-1", result: { outcome: { outcome: "cancelled" } } } },
                { dir: "out", msg: { jsonrpc: "2.0", id: 9, result: { stopReason: "end_turn" } } },
            ];

            for (const call of [{ name: "chesspal.roll", rawInput: {} }, { name: "bash", rawInput: { command: "ls" } }]) {
                const { chat, host, events, until } = play(flow(call), { allowed: ["chesspal"] });
                chat.send("Hello");
                await until(() => turnEnds(events).length === 1);
                expect(host.problems).toEqual([]);
                expect(events.filter((event) => event.type === "permission").map((event) => event.type === "permission" && event.allowed)).toEqual([false]);
            }

            // The agent's lines said by hand, so that its request comes after the cancel.
            const written: Message[] = [];
            let say = (_line: Message): void => undefined;
            const start = (): LineProcess => ({
                pid: undefined,
                write: (line) => written.push(JSON.parse(line) as Message),
                onLine: (listener) => (say = (line) => listener(JSON.stringify(line))),
                onEnd: () => undefined,
                stop: () => undefined,
            });
            const chat = openHostChat("openCode", { ...options(fakeAgent([])), allowed: ["chesspal"], start })!;
            say({ jsonrpc: "2.0", id: 1, result: { protocolVersion: 1, agentCapabilities: {} } });
            say({ jsonrpc: "2.0", id: 2, result: { sessionId: "ses_1", configOptions: [modelOption()] } });
            say({ jsonrpc: "2.0", id: 3, result: { configOptions: [modelOption(model)] } });
            chat.send("Hello");
            chat.interrupt();
            say({ jsonrpc: "2.0", id: "ask-1", method: "session/request_permission", params: { sessionId: "ses_1", toolCall: { toolCallId: "call_1", name: "chesspal.roll" }, options: [{ optionId: "once", kind: "allow_once" }] } });
            expect(written.map((line) => line.method ?? line.result)).toEqual(["initialize", "session/new", "session/set_config_option", "session/prompt", "session/cancel", { outcome: { outcome: "cancelled" } }]);
            chat.close();
        });

        it("refuses the shell, writing and fetching, and reads any subagent as of kind agent, which starts only where that kind is allowed", async () => {
            expect(await answered({ name: "bash", rawInput: { command: "echo hi" } }, "no", ["chesspal", "read", "web", "agent"])).toEqual([{ type: "permission", name: "bash", kind: "shell", allowed: false }]);
            expect(await answered({ name: "edit", rawInput: {} }, "no", ["chesspal", "read", "web", "agent"])).toEqual([{ type: "permission", name: "edit", kind: "write", allowed: false }]);
            expect(await answered({ name: "webfetch", rawInput: {} }, "no", ["chesspal", "read", "web", "agent"])).toEqual([{ type: "permission", name: "webfetch", kind: "fetch", allowed: false }]);
            expect(await answered({ name: "task", rawInput: { subagent_type: "rpg-character" } }, "once", ["agent"])).toEqual([{ type: "permission", name: "task", kind: "agent", allowed: true }]);
            expect(await answered({ name: "task", rawInput: { subagent_type: "general" } }, "once", ["agent"])).toEqual([{ type: "permission", name: "task", kind: "agent", allowed: true }]);
            expect(await answered({ name: "task", rawInput: { subagent_type: "general" } }, "no", ["chesspal"])).toEqual([{ type: "permission", name: "task", kind: "agent", allowed: false }]);
        });

        it("knows its tools by their new names too: shell, apply_patch, and subagent, of kind agent whatever its agent", async () => {
            const everything: ChatOptions["allowed"] = ["chesspal", "read", "web", "agent"];
            expect(await answered({ name: "shell", rawInput: { command: "echo hi" } }, "no", everything)).toEqual([{ type: "permission", name: "shell", kind: "shell", allowed: false }]);
            expect(await answered({ name: "apply_patch", rawInput: {} }, "no", everything)).toEqual([{ type: "permission", name: "apply_patch", kind: "write", allowed: false }]);
            expect(await answered({ name: "subagent", rawInput: { agent: "general" } }, "once", ["agent"])).toEqual([{ type: "permission", name: "subagent", kind: "agent", allowed: true }]);
            expect(await answered({ name: "subagent", rawInput: { agent: "general" } }, "no", ["chesspal"])).toEqual([{ type: "permission", name: "subagent", kind: "agent", allowed: false }]);
        });

        it("refuses any other request of the agent, which then never waits", async () => {
            const flow = [...begin(), ...newSession(), { dir: "out" as const, msg: { jsonrpc: "2.0", id: 5, method: "fs/read_text_file", params: { path: "/etc/hosts" } } }, {
                dir: "in" as const,
                msg: { jsonrpc: "2.0", id: 5, error: { code: -32601, message: "The table does not handle fs/read_text_file." } },
            }];
            const { host, until } = play(flow);
            await until(() => host.done());
            expect(host.problems).toEqual([]);
        });
    });

    describe("the turn's end and the chat's", () => {
        it("asks the agent to cancel at interrupt(), and stops its process when it does not end the turn within 10 seconds", async () => {
            const clock = manualClock();
            const { chat, host, events, until } = play([...begin(), ...newSession(), ...turn("Hello", ...["One", "Two", "Three", "Four", "Five", "Six"].map((words) => text(words)))], { later: clock.later }, { ignore: ["session/cancel"] });
            chat.send("Hello");
            await until((all) => all.some((event) => event.type === "text"));
            chat.interrupt();
            chat.interrupt();
            expect(host.written.filter((message) => message.method === "session/cancel")).toEqual([{ jsonrpc: "2.0", method: "session/cancel", params: { sessionId: "ses_1" } }]);
            clock.advance(10_000);
            expect(events.slice(-2)).toEqual([{ type: "turnEnd", reason: "interrupted" }, { type: "ended", why: "the host did not stop its turn and was closed" }]);
            expect(host.stopped).toBe(true);
        });

        it("fails the turn and ends the chat when the process ends, with its last lines on stderr", async () => {
            const { chat, host, events, until } = play([...begin(), ...newSession(), { dir: "in", msg: { jsonrpc: "2.0", id: 4, method: "session/prompt", params: { prompt: [{ type: "text", text: "Hello" }] } } }]);
            chat.send("Hello");
            await until(() => host.written.some(isPrompt));
            host.complain("Error: no provider is signed in");
            host.complain("Run opencode auth login");
            host.end("exit code 1");
            const why = "the host's program ended (exit code 1): Error: no provider is signed in | Run opencode auth login";
            expect(events.slice(-2)).toEqual([{ type: "turnEnd", reason: "failed", why }, { type: "ended", why }]);
            expect(host.stops).toBe(0);
        });

        it("ends the chat when its program is not there, saying so", async () => {
            const chat = openHostChat("openCode", { folder: makeTempFolder(), program: { command: join(makeTempFolder(), "no-such-program"), args: [] }, model, allowed: ["chesspal"], environment: process.env });
            const { events, until } = listen(chat!);
            await until(() => events.some((event) => event.type === "ended"));
            expect(events.at(-1)).toMatchObject({ type: "ended", why: expect.stringContaining("the host's program ended (spawn") });
        });

        it("tells nothing after close, and stops the process once", async () => {
            const { chat, host, events, until } = play([...begin(), ...newSession(), ...turn("Hello", text("One"))]);
            chat.send("Hello");
            await until((all) => all.some((event) => event.type === "text"));
            const told = events.length;
            chat.close();
            chat.close();
            await ticksUntil(() => true);
            expect(events).toHaveLength(told);
            expect(host.stops).toBe(1);
        });
    });
});

describe("OpenCode as the table drives it", () => {
    const driver = hostDriver("openCode")!;
    const exe = process.platform === "win32" ? "opencode.exe" : "opencode";
    const separator = process.platform === "win32" ? ";" : ":";

    /** Files in a new folder of the test's; the folder. */
    function folderWith(...files: string[]): string
    {
        const made = makeTempFolder();
        files.forEach((file) => {
            mkdirSync(join(made, file, ".."), { recursive: true });
            writeFileSync(join(made, file), file.endsWith("package.json") ? JSON.stringify({ name: "@opencode/cli", bin: { opencode: "./bin/opencode.exe" } }) : "");
        });
        return made;
    }

    it("proposes no model of its own, the first OpenCode lists being the one it would play, and knows the efforts OpenCode offers", () => {
        expect(driver.model).toBe("");
        expect(driver.efforts).toEqual(["minimal", "low", "medium", "high", "xhigh", "max"]);
    });

    it("finds its own program in a folder of the PATH, then in the home's .opencode/bin, then as npm installed its package", () => {
        const onPath = folderWith(exe);
        const home = folderWith(join(".opencode", "bin", exe));
        const npm = folderWith("opencode.cmd", join("node_modules", "@opencode", "cli", "package.json"), join("node_modules", "@opencode", "cli", "bin", "opencode.exe"));
        expect(driver.program({ Path: [makeTempFolder(), onPath].join(separator) }, process.platform, home)).toEqual({ command: join(onPath, exe), args: [] });
        expect(driver.program({ PATH: npm }, process.platform, home)).toEqual({ command: join(home, ".opencode", "bin", exe), args: [] });
        expect(driver.program({ PATH: npm }, process.platform, makeTempFolder())).toEqual({ command: join(npm, "node_modules", "@opencode", "cli", "bin", "opencode.exe"), args: [] });
    });

    it("never takes a shim that needs a shell, nor a package whose program is missing", () => {
        const shims = folderWith("opencode.cmd", "opencode.ps1", join("node_modules", "@opencode", "cli", "package.json"));
        expect(driver.program({ PATH: shims }, "win32", makeTempFolder())).toBeUndefined();
    });

    it("says what a folder lacks for it, and how to mend it: its opencode.json", () => {
        expect(driver.missing(folderWith("opencode.json"))).toBeUndefined();
        expect(driver.missing(makeTempFolder())).toContain("no opencode.json");
    });

    it("gives OpenCode the table's environment without what belongs to another OpenCode chat or to a shell, in a copy", () => {
        const given = { PATH: "/bin", OPENCODE_CONFIG: "/mine.json", OPENCODE_DISABLE_PROJECT_CONFIG: "1", opencode_session_id: "s", OPENCODE_CONFIG_CONTENT: "{}", PWD: "/x", OLDPWD: "/y" };
        const environment = driver.environment(given);
        expect(environment).toEqual({ PATH: "/bin", OPENCODE_CONFIG: "/mine.json" });
        expect(environment).not.toBe(given);
    });

    describe("its models", () => {
        const flow = loadFlow("opencode/models");

        /** The recorded answer, and the session made for asking deleted. */
        function asked(): FakeHost
        {
            return fakeAgent([...flow, { dir: "in", msg: { jsonrpc: "2.0", id: 3, method: "session/delete", params: { sessionId: "ses_00000000000000000000000002" } } }, { dir: "out", msg: { jsonrpc: "2.0", id: 3, result: {} } }]);
        }

        it("are those a new session lists, the one it plays first with its efforts, the others with none known", async () => {
            const host = asked();
            const models = await driver.models({ folder, program: { command: "opencode-program", args: [] }, environment: { HOME: "/home/player" }, start: host.start });
            expect(host.started?.args).toEqual(["acp"]);
            expect(host.started?.options.env).toEqual({ HOME: "/home/player", PWD: folder });
            expect(models[0]).toEqual({ id: "opencode/tidepool-alpha-free", name: "opencode/Tidepool Alpha Free", efforts: ["minimal", "low", "medium", "high", "xhigh", "max"] });
            expect(models.slice(1).map((one) => one.id)).toEqual(["cloudflare-ai-gateway/reflection-ai/beam-1.0-501b-a23b", "cloudflare-ai-gateway/anthropic/claude-fable-5", "cloudflare-ai-gateway/anthropic/claude-fable-5.1", model]);
            expect(models.slice(1).every((one) => one.efforts.length === 0)).toBe(true);
            expect(host.written.map((message) => message.method)).toEqual(["initialize", "session/new", "session/delete"]);
            expect(host.problems).toEqual([]);
            expect(host.stopped).toBe(true);
        });

        it("are none, the program stopped, where it does not answer within 20 seconds, or cannot start", async () => {
            const clock = manualClock();
            const host = fakeAgent([], { ignore: ["initialize"] });
            const asking = driver.models({ folder, program: { command: "opencode-program", args: [] }, environment: {}, start: host.start, later: clock.later });
            clock.advance(20_000);
            expect(await asking).toEqual([]);
            expect(host.stopped).toBe(true);
            expect(await driver.models({ folder, program: { command: join(makeTempFolder(), "no-such-program"), args: [] }, environment: process.env })).toEqual([]);
        });
    });
});

/** The driver on a fake agent. */
function open(flow: FlowEntry[], overrides: Partial<ChatOptions> = {}, fake: FakeAgentOptions = {}): { chat: NonNullable<ReturnType<typeof openHostChat>>; host: FakeHost; }
{
    const host = fakeAgent(flow, fake);
    const chat = openHostChat("openCode", { ...options(host), ...overrides });

    if (chat === undefined) {
        throw new Error("OpenCode has no driver");
    }

    return { chat, host };
}

function play(flow: FlowEntry[], overrides: Partial<ChatOptions> = {}, fake: FakeAgentOptions = {}): ReturnType<typeof open> & ReturnType<typeof listen>
{
    const opened = open(flow, overrides, fake);
    return { ...opened, ...listen(opened.chat) };
}

function options(host: FakeHost): ChatOptions
{
    return { folder, program: { command: "opencode-program", args: ["--first"] }, model, allowed: ["chesspal"], environment: { HOME: "/home/player" }, start: host.start };
}

/** The protocol begun, as OpenCode answers. */
function begin(): FlowEntry[]
{
    return [
        { dir: "in", msg: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} } },
        { dir: "out", msg: { jsonrpc: "2.0", id: 1, result: { protocolVersion: 1, agentCapabilities: { loadSession: true, sessionCapabilities: { resume: {} } } } } },
    ];
}

function newSession(configOptions: Message[] = [modelOption()]): FlowEntry[]
{
    return [
        { dir: "in", msg: { jsonrpc: "2.0", id: 2, method: "session/new", params: {} } },
        { dir: "out", msg: { jsonrpc: "2.0", id: 2, result: { sessionId: "ses_1", configOptions } } },
    ];
}

/** A recorded setting and the options its answer lists. */
function setting(id: string, value: string, configOptions: Message[]): FlowEntry[]
{
    return [
        { dir: "in", msg: { jsonrpc: "2.0", id: 3, method: "session/set_config_option", params: { sessionId: "ses_1", configId: id, value } } },
        { dir: "out", msg: { jsonrpc: "2.0", id: 3, result: { configOptions } } },
    ];
}

function modelOption(current = "opencode/free"): Message
{
    return { id: "model", name: "Model", category: "model", type: "select", currentValue: current, options: [{ value: "opencode/free", name: "Free" }, { value: model, name: "GPT OSS" }] };
}

function effortOption(): Message
{
    return { id: "effort", name: "Effort", category: "thought_level", type: "select", currentValue: "default", options: [{ value: "low" }, { value: "high" }, { value: "default" }] };
}

// The recorded ids of the turns' prompts, apart from the driver's.
let turns = 0;

/** A turn: the player's words, the agent's updates, and the prompt's answer, which ends it as given. */
function turn(words: string, ...then: (FlowEntry | string)[]): FlowEntry[]
{
    turns += 1;
    const id = 100 + turns;
    const reason = then.find((one) => typeof one === "string") ?? "end_turn";
    return [
        { dir: "in", msg: { jsonrpc: "2.0", id, method: "session/prompt", params: { sessionId: "ses_1", prompt: [{ type: "text", text: words }] } } },
        ...then.filter((one): one is FlowEntry => typeof one !== "string"),
        { dir: "out", msg: { jsonrpc: "2.0", id, result: { stopReason: reason } } },
    ];
}

function text(words: string, message = "m1"): FlowEntry
{
    return update({ sessionUpdate: "agent_message_chunk", messageId: message, content: { type: "text", text: words } });
}

function update(fields: Message): FlowEntry
{
    return { dir: "out", msg: { jsonrpc: "2.0", method: "session/update", params: { sessionId: "ses_1", update: fields } } };
}

function isObject(value: unknown): value is Message
{
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
