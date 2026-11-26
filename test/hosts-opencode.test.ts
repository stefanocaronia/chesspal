import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { type ChatOptions, hostDriver, type HostEvent, openHostChat } from "../src/hosts/index.ts";
import type { LineProcess } from "../src/hosts/process.ts";
import { checklist, type Scenario } from "./hosts/checklist.ts";
import { type FakeAgent, fakeAgent, type FakeAgentOptions, isModelSetting, isPrompt, joinedTexts, promptWords, sessionOfFlow } from "./hosts/fake-agent.ts";
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

// What the table's OpenCode may not do by itself: read files, and reach any folder outside the chat's.
// The kinds of tools the table allows.
const tableKinds: ChatOptions["allowed"] = ["chesspal", "web", "fetch", "agent", "image"];
const denied = { read: "deny", glob: "deny", grep: "deny", list: "deny", external_directory: "deny" };

describe("the chat in OpenCode", () => {
    describe("its program", () => {
        it("starts as opencode acp after its own arguments, in the chat's folder, which PWD names too, its reading tools and any folder outside denied", () => {
            const host = fakeAgent([]);
            openHostChat("openCode", { ...options(host), environment: { HOME: "/home/player", pwd: "/elsewhere" } });
            expect(host.started?.command).toBe("opencode-program");
            expect(host.started?.args).toEqual(["--first", "acp"]);
            expect(host.started?.options.cwd).toBe(folder);
            expect(host.started?.options.env).toEqual({ HOME: "/home/player", PWD: folder, OPENCODE_CONFIG_CONTENT: JSON.stringify({ permission: denied }) });
        });

        it("denies its reading tools only where the kinds allowed hold no read, and any folder outside the chat's always, in this process alone", () => {
            const given = (allowed: ChatOptions["allowed"]): unknown => {
                const host = fakeAgent([]);
                openHostChat("openCode", { ...options(host), allowed });
                return JSON.parse(String(host.started?.options.env?.OPENCODE_CONFIG_CONTENT));
            };

            expect(given(tableKinds)).toEqual({ permission: denied });
            expect(given(["chesspal", "read"])).toEqual({ permission: { external_directory: "deny" } });
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
                { type: "session", session: "ses_1", model, efforts: ["low", "high"] },
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

        it("sets an effort the chosen model takes, known only once it is set, and tells the table that model's efforts with the session", async () => {
            const flow = [...begin(), ...newSession([modelOption()]), ...setting("model", model, [modelOption(model), effortOption()]), ...turn("Hello", text("Fine"))];
            const { chat, host, events, until } = play(flow, { effort: "high" });
            chat.send("Hello");
            await until(() => turnEnds(events).length === 1);
            expect(host.written.filter((message) => message.method === "session/set_config_option").map((message) => (message.params as Message).configId)).toEqual(["model", "effort"]);
            expect(events[0]).toEqual({ type: "session", session: "ses_1", model, efforts: ["low", "high"] });
            expect(host.problems).toEqual([]);
        });

        it("leaves out an effort the chosen model does not take, its own default kept, and plays", async () => {
            const flow = [...begin(), ...newSession([modelOption()]), ...setting("model", model, [modelOption(model), effortOption()]), ...turn("Hello", text("Fine"))];
            const { chat, host, events, until } = play(flow, { effort: "max" });
            chat.send("Hello");
            await until(() => turnEnds(events).length === 1);
            expect(host.written.filter((message) => message.method === "session/set_config_option")).toHaveLength(1);
            expect(events).toEqual([{ type: "session", session: "ses_1", model, efforts: ["low", "high"] }, { type: "text", block: 0, text: "Fine" }, { type: "turnEnd", reason: "done" }]);
            expect(host.problems).toEqual([]);
        });

        it("in an open chat, sets the new model and then the effort it takes, and tells its efforts", async () => {
            const flow = [
                ...begin(),
                ...newSession([modelOption()]),
                ...setting("model", model, [modelOption(model)]),
                ...turn("Hello", text("Fine")),
                ...setting("model", "opencode/free", [modelOption("opencode/free"), effortOption()]),
                ...turn("Again", text("Sure", "m2")),
            ];
            const { chat, host, events, until } = play(flow);
            chat.send("Hello");
            await until(() => turnEnds(events).length === 1);
            expect(chat.setModel?.("opencode/free", "low")).toBe(true);
            await until(() => events.filter((event) => event.type === "session").length === 2);
            chat.send("Again");
            await until(() => turnEnds(events).length === 2);
            expect(host.written.filter((message) => message.method === "session/set_config_option").map((message) => (message.params as Message).value)).toEqual([model, "opencode/free", "low"]);
            expect(events.filter((event) => event.type === "session")).toEqual([
                { type: "session", session: "ses_1", model, efforts: [] },
                { type: "session", session: "ses_1", model: "opencode/free", efforts: ["low", "high"] },
            ]);
            expect(host.problems).toEqual([]);
        });

        it("in an open chat, sets another effort of the same model, telling no new session", async () => {
            const flow = [
                ...begin(),
                ...newSession([modelOption(), effortOption()]),
                ...setting("model", model, [modelOption(model), effortOption()]),
                ...turn("Hello", text("Fine")),
                ...turn("Again", text("Sure", "m2")),
            ];
            const { chat, host, events, until } = play(flow);
            chat.send("Hello");
            await until(() => turnEnds(events).length === 1);
            expect(chat.setModel?.(model, "low")).toBe(true);
            await ticksUntil(() => chat.send("Again"));
            await until(() => turnEnds(events).length === 2);
            expect(host.written.filter((message) => message.method === "session/set_config_option").map((message) => (message.params as Message).value)).toEqual([model, model, "low"]);
            expect(events.filter((event) => event.type === "session")).toEqual([{ type: "session", session: "ses_1", model, efforts: ["low", "high"] }]);
            expect(turnEnds(events)).toEqual([{ type: "turnEnd", reason: "done" }, { type: "turnEnd", reason: "done" }]);
            expect(host.problems).toEqual([]);
        });

        it("ends the chat, writing none of the player's words, when the agent runs another model than the one asked", async () => {
            const { chat, host, events, until } = play([...begin(), ...newSession(), ...turn("Hello", text("leaked"))], {}, { models: { [model]: "opencode/free" } });
            chat.send("Hello");
            await until(() => events.some((event) => event.type === "ended"));
            const why = `the host was asked for the model ${model} and runs opencode/free`;
            expect(events).toEqual([{ type: "turnEnd", reason: "failed", why }, { type: "ended", why }]);
            expect(host.written.some(isPrompt)).toBe(false);
            expect(host.inputClosed).toBe(true);
            expect(host.stopped).toBe(false);
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
            expect(events).toEqual([{ type: "ended", why: "the host did not open the chat: Authentication required: sign in from OpenCode itself, then try again", code: "signin" }]);
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
            expect(host.inputClosed).toBe(true);
            clock.advance(10_000);
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

        it("holds a tool the subagent ran without asking to the AI's limits: a shell, or any read of a file, fails the turn", async () => {
            const any = { agent: "general", prompt: "Bertoldo" };
            expect(await childRuns(any, { name: "execute", rawInput: { code: "return await tools.chesspal.view({ as: 'Bertoldo' });" } })).toEqual([{ type: "turnEnd", reason: "done" }]);
            expect(await childRuns(any, { name: "bash", rawInput: { command: "dir" } })).toEqual([{ type: "turnEnd", reason: "failed", why: "the host ran a tool without asking: the table does not let the AI use bash" }]);
            const read = (path: string): Promise<HostEvent[]> => childRuns(any, { name: "read", rawInput: { filePath: path } });
            const refused = [{ type: "turnEnd", reason: "failed", why: "the host ran a tool without asking: the table does not let the AI use read" }];
            expect(await read("/home/player/.ssh/id_rsa")).toEqual(refused);
            expect(await read(join(folder, "games", "a.json"))).toEqual(refused);
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

    describe("a turn the host begins by itself", () => {
        const child = { "opencode/child-session": { id: "ses_child", parentID: "ses_1", depth: 1, title: "Bertoldo" } };
        const hostTurn = { type: "turnStart", by: "host" };
        const silence = 20_000;
        // The player's turn, in which the AI starts a subagent, whose answer comes after it.
        const flow = [
            ...begin(),
            ...newSession(),
            ...turn(
                "Hello",
                update({ sessionUpdate: "tool_call", toolCallId: "a1", status: "in_progress", kind: "think", name: "subagent", rawInput: { agent: "rpg-character", prompt: "Bertoldo" } }),
                update({ sessionUpdate: "tool_call_update", toolCallId: "a1", status: "completed", rawOutput: { metadata: { sessionID: "ses_child" } } }),
                text("The innkeeper listens."),
            ),
        ];

        /** A chat on the clock of the test, whose first turn of the player's ended. */
        async function afterTurn(flow: FlowEntry[], overrides: Partial<ChatOptions> = {}): Promise<ReturnType<typeof play> & { clock: ReturnType<typeof manualClock>; }>
        {
            const clock = manualClock();
            const played = play(flow, { allowed: tableKinds, later: clock.later, ...overrides }, { ignore: ["session/cancel"] });
            played.chat.send(promptWords(flow)[0]!);
            await played.until(() => turnEnds(played.events).length === 1 && played.host.done());
            return { ...played, clock };
        }

        /** The AI's prose told since `from`, joined. */
        function toldSince(events: HostEvent[], from: number): string
        {
            return events.slice(from).map((event) => (event.type === "text" ? event.text : "")).join("");
        }

        it("tells the AI's words after the prompt's answer in a turn of its own, which a silence ends; no word of the subagent's (recorded, DeepSeek)", async () => {
            const flow = loadFlow("opencode/voice-answer-after-prompt");
            const asked = flow.find((entry) => entry.dir === "in" && isModelSetting(entry.msg))?.msg.params as Message;
            const { events, host, clock } = await afterTurn(flow, { model: String(asked.value) });
            const ended = events.findIndex((event) => event.type === "turnEnd");
            expect(events[ended]).toEqual({ type: "turnEnd", reason: "done" });
            expect(events[ended + 1]).toEqual(hostTurn);
            const answer = flow.slice(flow.findIndex((entry) => isObject(entry.msg.result) && entry.msg.result.stopReason === "end_turn"));
            const parentWords = (entries: FlowEntry[]): string =>
                entries.map((entry) => (isObject(entry.msg.params) && isObject(entry.msg.params.update) ? entry.msg.params.update : {}))
                    .filter((one) => one.sessionUpdate === "agent_message_chunk" && one._meta === undefined)
                    .map((one) => String((one.content as Message).text))
                    .join("");
            expect(toldSince(events, ended)).toBe(parentWords(answer));
            expect(toldSince(events, ended)).toContain("come se quel debito potesse essere tuo.");
            expect(toldSince(events, 0)).toBe(parentWords(flow));
            expect(turnEnds(events)).toHaveLength(1);
            clock.advance(silence - 1);
            expect(turnEnds(events)).toHaveLength(1);
            clock.advance(1);
            expect(turnEnds(events)).toEqual([{ type: "turnEnd", reason: "done" }, { type: "turnEnd", reason: "done" }]);
            expect(host.problems).toEqual([]);
        });

        it("goes on while the AI or its subagent says anything, or a tool of the AI's runs; a later word opens another turn", async () => {
            const { chat, events, host, until, clock } = await afterTurn(flow);
            host.says(update({ sessionUpdate: "usage_update", used: 10 }).msg);
            host.says(update({ sessionUpdate: "available_commands_update", availableCommands: [] }).msg);
            await ticksUntil(() => host.done());
            expect(events.at(-1)).toEqual({ type: "turnEnd", reason: "done" });

            host.says(update({ sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "Bertoldo answered." } }).msg);
            await until((all) => all.at(-1)?.type === "turnStart");
            expect(chat.send("Too soon")).toBe(false);
            clock.advance(silence - 1000);
            host.says(update({ sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "Still." }, _meta: child }).msg);
            await ticksUntil(() => host.done());
            clock.advance(silence - 1000);
            host.says(update({ sessionUpdate: "tool_call", toolCallId: "ask-1", name: "execute", kind: "other", status: "in_progress", rawInput: { code: "return await tools.chesspal.ask({});" } }).msg);
            await until((all) => all.some((event) => event.type === "tool" && event.id === "ask-1"));
            clock.advance(silence * 3);
            expect(turnEnds(events)).toHaveLength(1);
            host.says(update({ sessionUpdate: "tool_call_update", toolCallId: "ask-1", status: "completed" }).msg);
            host.says(text("Bertoldo shrugs.", "m2").msg);
            await until((all) => toldSince(all, 0).includes("Bertoldo shrugs."));
            clock.advance(silence);
            expect(turnEnds(events)).toHaveLength(2);

            host.says(text("And leaves.", "m3").msg);
            await until((all) => all.at(-1)?.type === "text");
            clock.advance(silence);
            expect(events.slice(-3)).toEqual([hostTurn, { type: "text", block: 0, text: "And leaves." }, { type: "turnEnd", reason: "done" }]);
            expect(chat.send("Now me")).toBe(true);
        });

        it("ends at interrupt(), asking the agent to cancel, and fails at once where it runs a tool the table does not allow", async () => {
            const { chat, events, host, until, clock } = await afterTurn(flow);
            host.says(text("Bertoldo", "m2").msg);
            await until((all) => all.at(-1)?.type === "text");
            chat.interrupt();
            expect(events.at(-1)).toEqual({ type: "turnEnd", reason: "interrupted" });
            expect(host.written.filter((message) => message.method === "session/cancel")).toHaveLength(1);

            host.says(update({ sessionUpdate: "tool_call", toolCallId: "sh-1", name: "bash", kind: "execute", status: "completed", rawInput: { command: "curl example.com" } }).msg);
            await until(() => turnEnds(events).length === 3);
            expect(events.slice(-4)).toEqual([
                hostTurn,
                { type: "tool", id: "sh-1", name: "bash", kind: "shell", state: "started" },
                { type: "tool", id: "sh-1", name: "bash", kind: "shell", state: "done" },
                { type: "turnEnd", reason: "failed", why: "the host ran a tool without asking: the table does not let the AI use bash" },
            ]);
            expect(host.written.filter((message) => message.method === "session/cancel")).toHaveLength(2);
            clock.advance(silence);
            expect(turnEnds(events)).toHaveLength(3);
            expect(host.stopped).toBe(false);
        });

        it("opens no turn of the host's for a subagent's words between turns, nor before the chat is ready", async () => {
            const { events, host } = await afterTurn(flow);
            host.says(update({ sessionUpdate: "agent_message_chunk", messageId: "k1", content: { type: "text", text: "Keeps: the key." }, _meta: child }).msg);
            await ticksUntil(() => host.done());
            expect(events.some((event) => event.type === "turnStart")).toBe(false);

            const replayed = loadFlow("opencode/load");
            const { chat, events: loaded, until } = play(replayed, { session: sessionOfFlow(replayed) });
            chat.send(promptWords(replayed)[0]!);
            await until(() => turnEnds(loaded).length === 1);
            expect(loaded.some((event) => event.type === "turnStart")).toBe(false);

            // The session open, its model not confirmed yet.
            const early = play([...begin(), ...newSession(), text("Before the model.")], { later: manualClock().later }, { ignore: ["session/set_config_option"] });
            await ticksUntil(() => early.host.done());
            expect(early.host.written.at(-1)).toMatchObject({ method: "session/set_config_option" });
            expect(early.events).toEqual([]);
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
                closeInput: () => undefined,
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

        it("refuses the shell, writing, and fetching where it is not given, and reads any subagent as of kind agent, which starts only where that kind is allowed", async () => {
            expect(await answered({ name: "bash", rawInput: { command: "echo hi" } }, "no", ["chesspal", "read", "web", "agent"])).toEqual([{ type: "permission", name: "bash", kind: "shell", allowed: false }]);
            expect(await answered({ name: "edit", rawInput: {} }, "no", ["chesspal", "read", "web", "agent"])).toEqual([{ type: "permission", name: "edit", kind: "write", allowed: false }]);
            expect(await answered({ name: "webfetch", rawInput: {} }, "no", ["chesspal", "read", "web", "agent"])).toEqual([{ type: "permission", name: "webfetch", kind: "fetch", allowed: false }]);
            expect(await answered({ name: "webfetch", rawInput: {} }, "once", ["chesspal", "read", "web", "fetch", "agent"])).toEqual([{ type: "permission", name: "webfetch", kind: "fetch", allowed: true }]);
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
    it("refuses a server or instructions from the table, before starting any process", () => {
        for (const given of [{ server: { name: "chesspal", command: "node", args: [], environment: { KEY: "secret" } } }, { instructions: "You play chess." }]) {
            const host = fakeAgent([]);
            expect(() => openHostChat("openCode", { ...options(host), ...given })).toThrow("OpenCode's driver does not take its server or its instructions from the table yet.");
            expect(host.started).toBeUndefined();
        }
    });

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

    it("gives OpenCode the table's environment without what belongs to another OpenCode chat or to a shell, nor the player's Claude Code instructions, in a copy", () => {
        const given = { PATH: "/bin", OPENCODE_CONFIG: "/mine.json", OPENCODE_DISABLE_PROJECT_CONFIG: "1", opencode_session_id: "s", OPENCODE_CONFIG_CONTENT: "{}", PWD: "/x", OLDPWD: "/y" };
        const environment = driver.environment(given);
        expect(environment).toEqual({ PATH: "/bin", OPENCODE_CONFIG: "/mine.json", OPENCODE_DISABLE_CLAUDE_CODE: "1" });
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
            expect(models[0]).toEqual({
                id: "opencode/tidepool-alpha-free",
                name: "opencode/Tidepool Alpha Free",
                efforts: ["minimal", "low", "medium", "high", "xhigh", "max"],
                group: "opencode",
                advised: true,
            });
            // The providers' models are paid apart for each answer, on the player's key, but for one run on this computer, kept before them; none is advised.
            expect(models.slice(1).map((one) => [one.group, one.metered, one.advised])).toEqual([
                ["ollama", undefined, undefined],
                ["cloudflare-ai-gateway", true, undefined],
                ["cloudflare-ai-gateway", true, undefined],
                ["cloudflare-ai-gateway", true, undefined],
            ]);
            expect(models.slice(1).map((one) => one.id)).toEqual([model, "cloudflare-ai-gateway/reflection-ai/beam-1.0-501b-a23b", "cloudflare-ai-gateway/anthropic/claude-fable-5", "cloudflare-ai-gateway/anthropic/claude-fable-5.1"]);
            expect(models.slice(1).every((one) => one.efforts.length === 0)).toBe(true);
            expect(host.written.map((message) => message.method)).toEqual(["initialize", "session/new", "session/delete"]);
            expect(host.problems).toEqual([]);
            expect(host.inputClosed).toBe(true);
            expect(host.stopped).toBe(false);
        });

        it("are none where it does not answer within 20 seconds, the program let go and stopped only ten seconds later, or cannot start", async () => {
            const clock = manualClock();
            const host = fakeAgent([], { ignore: ["initialize"] });
            const asking = driver.models({ folder, program: { command: "opencode-program", args: [] }, environment: {}, start: host.start, later: clock.later });
            clock.advance(20_000);
            expect(await asking).toEqual([]);
            expect(host.stopped).toBe(false);
            clock.advance(10_000);
            expect(host.stopped).toBe(true);
            expect(await driver.models({ folder, program: { command: join(makeTempFolder(), "no-such-program"), args: [] }, environment: process.env })).toEqual([]);
        });
    });
});

/** The driver on a fake agent. */
function open(flow: FlowEntry[], overrides: Partial<ChatOptions> = {}, fake: FakeAgentOptions = {}): { chat: NonNullable<ReturnType<typeof openHostChat>>; host: FakeAgent; }
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
