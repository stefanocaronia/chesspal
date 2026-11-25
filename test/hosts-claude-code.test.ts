import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { type ChatOptions, drivenHosts, type HostChat, hostDriver, type HostEvent, isHostName, openHostChat, type ToolKind } from "../src/hosts/index.ts";
import { hostIds } from "../src/hosts/names.ts";
import { checklist, type Scenario } from "./hosts/checklist.ts";
import { type FakeHost, fakeHost, type FakeOptions, type FlowEntry, isModelRequest, isPlayerWords, listen, loadFlow, manualClock, playerWords, sessionOf, ticksUntil, turnEnds, wholeTexts } from "./hosts/fake-host.ts";
import { makeTempFolder, removeTempFolders } from "./hosts/temp.ts";

afterAll(removeTempFolders);

type Message = Record<string, unknown>;

const folder = "/players/test";
const recorded: Record<Scenario, string> = { prose: "three-turns", refused: "denied", interrupt: "three-turns", resumed: "resumed" };

// The arguments every chat has: the protocol, then the folder's own settings and chesspal server.
const protocol = ["-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose", "--include-partial-messages", "--permission-prompt-tool", "stdio"];
const settings = ["--setting-sources", "project,local", "--strict-mcp-config", "--mcp-config", join(folder, ".mcp.json")];

checklist({
    host: "Claude Code",
    open: (scenario) => {
        const flow = loadFlow(`claude-code/${recorded[scenario]}`);
        const session = scenario === "resumed" ? sessionOf(flow) : undefined;
        // The second turn of three-turns runs a command without asking, as the recording's settings let it: the table here allows the shell.
        const { chat, host } = open(flow, { allowed: scenario === "refused" ? ["read"] : ["chesspal", "read", "shell"], session });
        return { chat, host, turns: playerWords(flow), texts: wholeTexts(flow), session, interruptTurn: 2 };
    },
    isModelRequest,
    isPlayerWords,
});

describe("the chat in Claude Code", () => {
    describe("its program", () => {
        it("starts with the protocol's arguments after its own, in the chat's folder: a new chat with no built-in tool", () => {
            const { host } = open([], { allowed: [] });
            expect(host.started).toEqual({
                command: "claude-program",
                args: ["--first", ...protocol, "--model", "haiku", ...settings, "--disable-slash-commands", "--tools", ""],
                options: { cwd: folder, env: { HOME: "/home/player" }, errors: expect.any(Function) as unknown },
            });
        });

        it("gives the chesspal server's tools alone no built-in tool", () => {
            const { host } = open([], { allowed: ["chesspal"] });
            expect(host.started?.args.slice(-2)).toEqual(["--tools", ""]);
        });

        it("names the effort, the built-in tools of the kinds allowed and the chat taken up", () => {
            const { host } = open([], { allowed: ["chesspal", "read", "web", "fetch", "agent", "shell", "write"], effort: "high", session: "a-session" });
            expect(host.started?.args).toEqual([
                "--first",
                ...protocol,
                "--model",
                "haiku",
                "--effort",
                "high",
                ...settings,
                "--disable-slash-commands",
                "--tools",
                "Read,Glob,Grep,WebSearch,WebFetch,Task,Bash,PowerShell,Write,Edit,NotebookEdit",
                "--settings",
                JSON.stringify({ permissions: { ask: ["Agent"] } }),
                "--resume",
                "a-session",
            ]);
        });

        it("makes the host ask before any subagent starts only where the AI may start one", () => {
            const settings = (allowed: ToolKind[]): string[] => {
                const args = open([], { allowed }).host.started?.args ?? [];
                return args.flatMap((arg, index) => (arg === "--settings" ? [args[index + 1] ?? ""] : []));
            };

            expect(settings(["chesspal", "agent"])).toEqual(['{"permissions":{"ask":["Agent"]}}']);
            expect(settings(["chesspal", "read", "shell"])).toEqual([]);
        });

        it("lists only the kinds allowed: searching the web is not fetching from it", () => {
            const { host } = open([], { allowed: ["read", "web"] });
            expect(host.started?.args.at(-1)).toBe("Read,Glob,Grep,WebSearch");
        });

        it("never starts with a model or a chat whose name could be read as an option", () => {
            for (const overrides of [{ model: "--dangerously-skip-permissions" }, { model: "a\0b" }, { session: "-x" }, { session: "s".repeat(201) }]) {
                const host = fakeHost([]);
                expect(() => openHostChat("claudeCode", { ...options(host), ...overrides }), JSON.stringify(overrides).slice(0, 60)).toThrow("is no name of a model or a chat");
                expect(host.started).toBeUndefined();
            }
        });

        it("is a host with a driver, as every host of the registry is, in its order", () => {
            expect(drivenHosts()).toEqual(hostIds);
            expect(drivenHosts()).toEqual(["claudeCode", "codex", "antigravity", "openCode"]);
        });
    });

    describe("the model", () => {
        it("holds the player's words until the host confirms the model, then writes them", async () => {
            const { chat, host, events, until } = play(turn("Hello", delta("Hi")));
            expect(chat.send("Hello")).toBe(true);
            expect(host.written.map(kindOf)).toEqual(["set_model"]);
            await until((all) => turnEnds(all).length === 1);
            expect(host.written.map(kindOf)).toEqual(["set_model", "user"]);
            expect(turnEnds(events)).toEqual([{ type: "turnEnd", reason: "done" }]);
            expect(host.problems).toEqual([]);
        });

        it("takes the very name it asked", async () => {
            const { chat, host, until } = play([said("Hello"), init("session-1", "claude-opus-5-5"), result()], { model: "claude-opus-5-5" });
            chat.send("Hello");
            await until((all) => turnEnds(all).length === 1);
            expect(host.problems).toEqual([]);
        });

        it("fails the turn held and ends the chat, its process stopped, writing none of the player's words, when the host answers with an error", async () => {
            const { chat, host, events, until } = play(modelAnswer({ subtype: "error", error: "no such model" }));
            expect(chat.send("Hello")).toBe(true);
            await until((all) => all.some((event) => event.type === "ended"));
            const why = "the host did not take the model haiku: no such model";
            expect(events).toEqual([{ type: "turnEnd", reason: "failed", why }, { type: "ended", why }]);
            expect(host.stops).toBe(1);
            expect(chat.send("Again")).toBe(false);
            expect(host.written.filter(isPlayerWords)).toEqual([]);
            expect(host.problems).toEqual([]);
        });

        it("ends the chat when the host names another model, saying both", async () => {
            const { chat, host, events, until } = play(modelAnswer({ subtype: "success", response: { model: "claude-sonnet-5" } }));
            chat.send("Hello");
            await until((all) => all.some((event) => event.type === "ended"));
            const why = "the host was asked for the model haiku and runs claude-sonnet-5";
            expect(events).toEqual([{ type: "turnEnd", reason: "failed", why }, { type: "ended", why }]);
            expect(host.written.filter(isPlayerWords)).toEqual([]);
            expect(chat.send("Again")).toBe(false);
        });

        it("ends the chat when the host does not answer within 30 seconds", () => {
            const { chat, host, clock, events } = play([], {}, { ignore: ["set_model"] });
            chat.send("Hello");
            clock.advance(29_999);
            expect(events).toEqual([]);
            clock.advance(1);
            const why = "the host did not confirm the model haiku within 30 seconds";
            expect(events).toEqual([{ type: "turnEnd", reason: "failed", why }, { type: "ended", why }]);
            expect(host.stopped).toBe(true);
            expect(chat.send("Again")).toBe(false);
            expect(host.written.filter(isPlayerWords)).toEqual([]);
        });

        it("ends the chat with no turn when the answer is missing before the player's first words", () => {
            const { chat, host, clock, events } = play([], {}, { ignore: ["set_model"] });
            clock.advance(30_000);
            expect(events).toEqual([{ type: "ended", why: "the host did not confirm the model haiku within 30 seconds" }]);
            expect(host.stopped).toBe(true);
            expect(chat.send("Hello")).toBe(false);
        });

        it("stops a turn whose start names another model and fails it saying both; the next turn plays", async () => {
            const { chat, host, events, until } = play([said("Hello"), init("session-1", "claude-sonnet-5"), delta("leaked"), result(), ...turn("Again", delta("Fine"))]);
            chat.send("Hello");
            await until((all) => turnEnds(all).length === 1);
            expect(events).toEqual([{ type: "turnEnd", reason: "failed", why: "the host runs the model claude-sonnet-5 instead of claude-haiku-5-5" }]);
            expect(host.written.map(kindOf)).toEqual(["set_model", "user", "interrupt"]);
            chat.send("Again");
            await until((all) => turnEnds(all).length === 2);
            expect(events.slice(1)).toEqual([session("session-1"), { type: "text", block: 0, text: "Fine" }, { type: "turnEnd", reason: "done" }]);
            expect(host.problems).toEqual([]);
        });

        it("takes a turn whose start names the confirmed model with a suffix, as for a longer context; never one that names none", async () => {
            const { chat, host, events, until } = play([said("Hello"), init("session-1", "claude-haiku-5-5[1m]"), delta("Fine"), result(), said("Again"), init("session-1", ""), delta("leaked"), result()]);
            chat.send("Hello");
            await until((all) => turnEnds(all).length === 1);
            expect(events).toEqual([{ type: "session", session: "session-1", model: "claude-haiku-5-5[1m]" }, { type: "text", block: 0, text: "Fine" }, { type: "turnEnd", reason: "done" }]);
            chat.send("Again");
            await until((all) => turnEnds(all).length === 2);
            expect(events.at(-1)).toEqual({ type: "turnEnd", reason: "failed", why: "the host runs the model  instead of claude-haiku-5-5" });
            expect(host.problems).toEqual([]);
        });

        it("tells the session again only when it or the model changes", async () => {
            const { chat, events, until } = play([...turn("One"), ...turn("Two"), said("Three"), init("session-2"), result()]);

            for (const [index, words] of ["One", "Two", "Three"].entries()) {
                chat.send(words);
                await until((all) => turnEnds(all).length === index + 1);
            }

            expect(events.filter((event) => event.type === "session")).toEqual([session("session-1"), session("session-2")]);
        });
    });

    describe("the AI's prose", () => {
        it("tells a whole message whose text never came in pieces, once", async () => {
            const { chat, events, until } = play(turn("Hello", whole([text("All at once")]), whole([text("All at once")]), whole([text("And more")], "m2")));
            chat.send("Hello");
            await until((all) => turnEnds(all).length === 1);
            expect(texts(events)).toEqual([{ type: "text", block: 0, text: "All at once" }, { type: "text", block: 1, text: "And more" }]);
        });

        it("does not tell again the whole text of a message that came in pieces, known by its message_start when the pieces carry no id", async () => {
            const { chat, events, until } = play(turn("Hello", messageStart("m1"), textStart(), delta("Pie", undefined), delta("ces", undefined), whole([text("Pieces")])));
            chat.send("Hello");
            await until((all) => turnEnds(all).length === 1);
            expect(texts(events)).toEqual([{ type: "text", block: 0, text: "Pie" }, { type: "text", block: 0, text: "ces" }]);
        });

        it("numbers each new block of text from 0 in each turn, an empty block taking the next text", async () => {
            const { chat, events, until } = play([...turn("One", textStart(), delta("a"), textStart(), textStart(), delta("b")), ...turn("Two", textStart(), whole([text("c")], "m2"))]);
            chat.send("One");
            await until((all) => turnEnds(all).length === 1);
            chat.send("Two");
            await until((all) => turnEnds(all).length === 2);
            expect(texts(events).map((event) => [event.block, event.text])).toEqual([[0, "a"], [1, "b"], [0, "c"]]);
        });

        it("tells nothing of a subagent's text and tools", async () => {
            const { chat, events, until } = play(
                turn("Hello", delta("secret", "m9", "toolu_agent"), whole([text("secret"), toolUse("t9", "mcp__chesspal__view")], "m9", "toolu_agent"), toolResult("t9", false, "toolu_agent")),
            );
            chat.send("Hello");
            await until((all) => turnEnds(all).length === 1);
            expect(events).toEqual([session("session-1"), { type: "turnEnd", reason: "done" }]);
        });
    });

    describe("tools and permissions", () => {
        it("tells each tool once, done or failed, with its kind; a result for a tool never started is ignored", async () => {
            const uses = whole([toolUse("t1", "Read", { file_path: join(folder, "a.md") }), toolUse("t2", "Bash"), toolUse("t3", "Skill")]);
            const { chat, events, until } = play(turn("Hello", uses, uses, toolResult("t0"), toolResult("t1"), toolResult("t1"), toolResult("t2", true), toolResult("t3", true)), { allowed: ["read"] });
            chat.send("Hello");
            await until((all) => turnEnds(all).length === 1);
            expect(events.filter((event) => event.type === "tool").map((event) => `${event.name} ${event.kind} ${event.state}`)).toEqual([
                "Read read started",
                "Bash shell started",
                "Skill other started",
                "Read read done",
                "Bash shell failed",
                "Skill other failed",
            ]);
            expect(turnEnds(events)).toEqual([{ type: "turnEnd", reason: "done" }]);
        });

        it("stops the turn, failed, where a tool the table does not allow, or a read outside the folder, ran without asking; the tool search never", async () => {
            const ran = async (use: Message, allowed: ToolKind[] = ["chesspal", "read", "agent"]): Promise<HostEvent[]> => {
                const { chat, host, events, until } = play(turn("Hello", whole([toolUse("t0", "ToolSearch", { query: "chesspal" }), use]), toolResult("t0"), toolResult("t1"), whole([text("leaked")], "m2")), {
                    allowed,
                });
                chat.send("Hello");
                await until((all) => turnEnds(all).length === 1);
                expect(host.written.some((line) => (line.request as Message | undefined)?.subtype === "interrupt")).toBe(true);
                expect(texts(events)).toEqual([]);
                return turnEnds(events);
            };

            expect(await ran(toolUse("t1", "Bash", { command: "curl example.com" }))).toEqual([
                { type: "turnEnd", reason: "failed", why: "the host ran a tool without asking: the table does not let the AI use Bash" },
            ]);
            expect(await ran(toolUse("t1", "Read", { file_path: "/home/player/.ssh/id_rsa" }))).toEqual([
                { type: "turnEnd", reason: "failed", why: "the host ran a tool without asking: Read read /home/player/.ssh/id_rsa, and the table lets the AI read only the chat's folder" },
            ]);
            expect(await ran(toolUse("t1", "Agent", { subagent_type: "general-purpose", prompt: "look around" }), ["chesspal", "read"])).toEqual([
                { type: "turnEnd", reason: "failed", why: "the host ran a tool without asking: the table does not let the AI use Agent" },
            ]);
        });

        it("reads the subagent tool by its new name, Agent, as by Task: any subagent runs without asking where the table allows it", async () => {
            const other = { subagent_type: "general-purpose", prompt: "Look around." };
            const { chat, events, until } = play(turn("Hello", whole([toolUse("a1", "Agent", other)]), toolResult("a1"), whole([text("Looked around.")], "m2")), { allowed: ["agent"] });
            chat.send("Hello");
            await until((all) => turnEnds(all).length === 1);
            expect(events.filter((event) => event.type === "tool").map((event) => [event.kind, event.state])).toEqual([["agent", "started"], ["agent", "done"]]);
            expect(turnEnds(events)).toEqual([{ type: "turnEnd", reason: "done" }]);
        });

        it("allows a tool of a kind allowed with its input as received, and tells it by the command's name", async () => {
            const { chat, host, events, until } = play(turn("Roll", asks("p1", "mcp__chesspal__roll", { dice: "2d6" }), answered("p1")));
            chat.send("Roll");
            await until((all) => turnEnds(all).length === 1);
            expect(host.written.at(-1)).toEqual({ type: "control_response", response: { subtype: "success", request_id: "p1", response: { behavior: "allow", updatedInput: { dice: "2d6" } } } });
            expect(events).toContainEqual({ type: "permission", name: "roll", kind: "chesspal", allowed: true });
            expect(host.problems).toEqual([]);
        });

        it("reads any subagent as of kind agent, whatever it plays, and lets it start only where that kind is allowed", async () => {
            const character = { subagent_type: "rpg-character", prompt: "Speak as the innkeeper." };
            const other = { subagent_type: "general-purpose", prompt: "Look around." };
            const both = turn("Hello", whole([toolUse("a1", "Task", character)]), asks("p1", "Task", character), answered("p1"), whole([toolUse("a2", "Task", other)], "m2"), asks("p2", "Task", other), answered("p2"));
            const allowed = play(both, { allowed: ["agent"] });
            allowed.chat.send("Hello");
            await allowed.until((all) => turnEnds(all).length === 1);
            expect(allowed.events.filter((event) => event.type === "permission")).toEqual([{ type: "permission", name: "Task", kind: "agent", allowed: true }, { type: "permission", name: "Task", kind: "agent", allowed: true }]);
            expect(allowed.events.filter((event) => event.type === "tool").map((event) => event.kind)).toEqual(["agent", "agent"]);
            expect(allowed.host.written.slice(-2).map((line) => (line.response as Message).response)).toEqual([{ behavior: "allow", updatedInput: character }, { behavior: "allow", updatedInput: other }]);
            expect(allowed.host.problems).toEqual([]);

            const refused = play(turn("Hello", whole([toolUse("a1", "Task", other)]), asks("p1", "Task", other), answered("p1")), { allowed: ["chesspal"] });
            refused.chat.send("Hello");
            await refused.until((all) => turnEnds(all).length === 1);
            expect(refused.events.filter((event) => event.type === "permission")).toEqual([{ type: "permission", name: "Task", kind: "agent", allowed: false }]);
            expect((refused.host.written.at(-1)?.response as Message).response).toEqual({ behavior: "deny", message: "The table does not let the AI use Task: it plays with Chesspal's commands." });
            expect(refused.host.problems).toEqual([]);
        });

        it("lets a tool that reads read the chat's folder alone: every path given, relative ones from the folder, and Glob's pattern", async () => {
            const inside = [
                ["Read", { file_path: join(folder, "pages", "inn.md") }],
                ["Read", { file_path: "pages/inn.md" }],
                ["Glob", { pattern: "**/*.md" }],
                ["Glob", { pattern: "*.md", path: folder }],
                ["Grep", { pattern: "Bruna" }],
                ["Grep", { pattern: "Bruna", path: join(folder, "pages") }],
            ] as const;
            const outside = [
                ["Read", { file_path: join(folder, "..", "other", "secret.md") }, join(folder, "..", "other", "secret.md")],
                ["Read", { file_path: "~/.ssh/id_rsa" }, "~/.ssh/id_rsa"],
                ["Read", {}, "undefined"],
                ["Glob", { pattern: "../*.md" }, "../*.md"],
                ["Glob", { pattern: "/etc/*" }, "/etc/*"],
                ["Glob", { pattern: "C:/Users/*" }, "C:/Users/*"],
                ["Glob", { pattern: "*.md", path: `${folder}-other` }, `${folder}-other`],
                ["Grep", { pattern: "password", path: join(folder, "..") }, join(folder, "..")],
            ] as const;
            const asked = [...inside, ...outside].map(([tool, input], index) => [asks(`p${index}`, tool, input), answered(`p${index}`)]).flat();
            const { chat, host, events, until } = play(turn("Look", ...asked), { allowed: ["read"] });
            chat.send("Look");
            await until((all) => turnEnds(all).length === 1);
            const answers = host.written.filter((line) => line.type === "control_response").map((line) => (line.response as Message).response as Message);
            expect(answers.slice(0, inside.length).map((answer) => answer.behavior)).toEqual(inside.map(() => "allow"));
            expect(answers.slice(inside.length)).toEqual(outside.map(([tool, , path]) => ({ behavior: "deny", message: `The table lets the AI read only the chat's folder: ${tool} asked for ${path}.` })));
            expect(events.filter((event) => event.type === "permission").map((event) => event.allowed)).toEqual([...inside.map(() => true), ...outside.map(() => false)]);
            expect(host.problems).toEqual([]);
        });

        it.runIf(process.platform === "win32")("reads the folder on Windows whatever the case of its letters", async () => {
            const { chat, host, until } = play(turn("Look", asks("p1", "Read", { file_path: join(folder, "Pages", "inn.md").toUpperCase() }), answered("p1")), { allowed: ["read"] });
            chat.send("Look");
            await until((all) => turnEnds(all).length === 1);
            expect(((host.written.at(-1)?.response as Message).response as Message).behavior).toBe("allow");
        });

        it("never lets the AI fetch from the web: a fetch is not a search", async () => {
            const { chat, host, events, until } = play(turn("Look", asks("p1", "WebFetch", { url: "https://example.com/?q=secret" }), answered("p1")), { allowed: ["chesspal", "read", "web", "agent"] });
            chat.send("Look");
            await until((all) => turnEnds(all).length === 1);
            expect(events).toContainEqual({ type: "permission", name: "WebFetch", kind: "fetch", allowed: false });
            expect(((host.written.at(-1)?.response as Message).response as Message).behavior).toBe("deny");
        });

        it("refuses with an error any other request of the host, between turns too", async () => {
            const { chat, host, until } = play([out({ type: "control_request", request_id: "h1", request: { subtype: "hook_callback" } }), answered("h1"), ...turn("Hello")]);
            await ticksUntil(() => host.written.length === 2);
            expect(host.written[1]).toEqual({ type: "control_response", response: { subtype: "error", request_id: "h1", error: "The table does not handle hook_callback." } });
            chat.send("Hello");
            await until((all) => turnEnds(all).length === 1);
            expect(host.problems).toEqual([]);
        });
    });

    describe("the turn's end", () => {
        it("fails with the host's words when the result is an error, else with its subtype", async () => {
            const { chat, events, until } = play([said("Hello"), init(), result("success", { is_error: true, result: "API Error: overloaded" }), said("Again"), init(), result("error_max_turns", { result: "" })]);
            chat.send("Hello");
            await until((all) => turnEnds(all).length === 1);
            chat.send("Again");
            await until((all) => turnEnds(all).length === 2);
            expect(turnEnds(events)).toEqual([{ type: "turnEnd", reason: "failed", why: "API Error: overloaded" }, { type: "turnEnd", reason: "failed", why: "error_max_turns" }]);
        });

        it("fails the turn and ends the chat when the process ends", async () => {
            const { chat, host, events, until } = play([said("Hello"), init(), delta("Half")]);
            chat.send("Hello");
            await until((all) => all.some((event) => event.type === "text"));
            host.end("exit code 1");
            expect(events.slice(-2)).toEqual([{ type: "turnEnd", reason: "failed", why: "the host's program ended (exit code 1)" }, { type: "ended", why: "the host's program ended (exit code 1)" }]);
            expect(chat.send("Again")).toBe(false);
        });

        it("says why the host ended in its own words: its last five lines on stderr, each cut at 300 characters", async () => {
            const { chat, host, events, until } = play([said("Hello"), init(), delta("Half")]);
            chat.send("Hello");
            await until((all) => all.some((event) => event.type === "text"));
            ["one", "", "two", "   ", "three", "four", "five", `six ${"x".repeat(400)}`].forEach((line) => host.complain(line));
            host.end("exit code 1");
            const why = `the host's program ended (exit code 1): two | three | four | five | six ${"x".repeat(296)}`;
            expect(events.slice(-2)).toEqual([{ type: "turnEnd", reason: "failed", why }, { type: "ended", why }]);
        });

        it("never stops the process again once it ended by itself: its pid may be another program's", () => {
            const { chat, host, events } = play([]);
            host.end("exit code 3");
            expect(events).toEqual([{ type: "ended", why: "the host's program ended (exit code 3)" }]);
            chat.close();
            expect(host.stops).toBe(0);
        });

        it("stops the process when the host does not stop its turn within 10 seconds, having asked once", async () => {
            const { chat, host, clock, events, until } = play([said("Hello"), init(), delta("Long")], {}, { ignore: ["interrupt"] });
            chat.interrupt();
            chat.send("Hello");
            await until((all) => all.some((event) => event.type === "text"));
            chat.interrupt();
            chat.interrupt();
            expect(host.written.map(kindOf)).toEqual(["set_model", "user", "interrupt"]);
            clock.advance(9_999);
            expect(host.stopped).toBe(false);
            clock.advance(1);
            expect(host.stopped).toBe(true);
            expect(events.slice(-2)).toEqual([{ type: "turnEnd", reason: "interrupted" }, { type: "ended", why: "the host did not stop its turn and was closed" }]);
            expect(chat.send("Again")).toBe(false);
        });

        it("ends a turn whose words wait for the model as interrupted, never writing them", () => {
            const { chat, host, events } = play([], {}, { ignore: ["set_model"] });
            chat.send("Hello");
            chat.interrupt();
            expect(events).toEqual([{ type: "turnEnd", reason: "interrupted" }]);
            expect(host.written.map(kindOf)).toEqual(["set_model"]);
        });

        it("writes request ids unique in the chat", async () => {
            const { chat, host } = open([...turn("One", delta("a")), ...turn("Two", delta("b"))]);
            const events: HostEvent[] = [];
            chat.onEvent((event) => {
                events.push(event);

                if (event.type === "text") {
                    chat.interrupt();
                }
            });

            for (const [index, words] of ["One", "Two"].entries()) {
                chat.send(words);
                await ticksUntil(() => turnEnds(events).length === index + 1);
            }

            expect(turnEnds(events).map((event) => event.type === "turnEnd" && event.reason)).toEqual(["interrupted", "interrupted"]);
            expect(host.written.filter((line) => line.type === "control_request").map((line) => line.request_id)).toEqual(["table-1", "table-2", "table-3"]);
        });
    });

    describe("the chat", () => {
        it("ignores lines it does not understand", async () => {
            const { chat, host, events, until } = play(turn(
                "Hello",
                raw("not JSON"),
                raw("[1, 2]"),
                raw("null"),
                raw('"text"'),
                out({ type: "mystery" }),
                out({ type: "stream_event", event: null }),
                out({ type: "assistant", message: { content: [null, 5, { type: "tool_use", id: 7 }] } }),
                out({ type: "user", message: { content: "plain" } }),
                out({ type: "control_response" }),
                out({ type: "control_request" }),
                delta("Fine"),
            ));
            chat.send("Hello");
            await until((all) => turnEnds(all).length === 1);
            expect(events).toEqual([session("session-1"), { type: "text", block: 0, text: "Fine" }, { type: "turnEnd", reason: "done" }]);
            expect(host.problems).toEqual([]);
        });

        it("hands what a listener throws to its handler and goes on, as when the process ends", async () => {
            const failures: unknown[] = [];
            const { chat, host } = open(turn("Hello", delta("a"), delta("b")), { failed: (error) => failures.push(error) });
            const events: HostEvent[] = [];
            chat.onEvent((event) => {
                events.push(event);

                if ((event.type === "text" && event.text === "a") || event.type === "turnEnd") {
                    throw new Error(`the listener broke at ${event.type}`);
                }
            });
            chat.send("Hello");
            await ticksUntil(() => turnEnds(events).length === 1);
            expect(texts(events).map((event) => event.text)).toEqual(["a", "b"]);
            chat.send("Again");
            host.end("exit code 1");
            expect(events.map((event) => event.type).slice(-2)).toEqual(["turnEnd", "ended"]);
            expect(failures.map((error) => (error as Error).message)).toEqual(["the listener broke at text", "the listener broke at turnEnd", "the listener broke at turnEnd"]);
        });

        it("sends nothing while a turn runs, with words of only spaces, or once closed", async () => {
            const { chat, host, events, until } = play(turn("Hello", delta("a")));
            expect(chat.send("  \n ")).toBe(false);
            expect(chat.send("Hello")).toBe(true);
            expect(chat.send("Again")).toBe(false);
            await until((all) => turnEnds(all).length === 1);
            chat.close();
            expect(host.stopped).toBe(true);
            expect(chat.send("Again")).toBe(false);
            chat.interrupt();
            host.end("exit code 0");
            expect(events.at(-1)).toEqual({ type: "turnEnd", reason: "done" });
            expect(host.written.filter(isPlayerWords)).toHaveLength(1);
        });

        it("tells nothing after close", async () => {
            const { chat, host, events, until } = play(turn("Hello", delta("a"), delta("b"), delta("c")));
            chat.send("Hello");
            await until((all) => texts(all).length > 0);
            chat.close();
            const told = events.length;
            await ticks(20);
            expect(events).toHaveLength(told);
            expect(host.stopped).toBe(true);
        });

        it("lets a listener send, interrupt and close during an event", async () => {
            const { chat, host } = open([...turn("One", delta("1")), said("Two"), init(), delta("2"), delta("more"), result(), ...turn("Three", delta("3"), delta("never"))]);
            const events: HostEvent[] = [];
            chat.onEvent((event) => {
                events.push(event);
                const ends = turnEnds(events).length;

                if (event.type === "turnEnd" && ends === 1) {
                    expect(chat.send("Two")).toBe(true);
                } else if (event.type === "text" && event.text === "2") {
                    chat.interrupt();
                } else if (event.type === "turnEnd" && ends === 2) {
                    expect(chat.send("Three")).toBe(true);
                } else if (event.type === "text" && event.text === "3") {
                    chat.close();
                }
            });
            chat.send("One");
            await ticksUntil(() => host.stopped);
            await ticks(20);
            expect(events.map(summary)).toEqual(["session", "1", "done", "2", "interrupted", "3"]);
            expect(host.problems).toEqual([]);
        });

        it("keeps the events that came before a listener and tells them when it is set", async () => {
            const { chat, host } = open(turn("Hello", delta("a")));
            chat.send("Hello");
            await ticksUntil(() => host.done());
            const events: HostEvent[] = [];
            chat.onEvent((event) => events.push(event));
            expect(events).toEqual([session("session-1"), { type: "text", block: 0, text: "a" }, { type: "turnEnd", reason: "done" }]);
        });
    });
});

describe("the chat in Claude Code over a real process and pipe", () => {
    const replayHost = fileURLToPath(new URL("hosts/replay-host.mjs", import.meta.url));
    const flowFile = (name: string): string => fileURLToPath(new URL(`hosts/flows/claude-code/${name}.jsonl`, import.meta.url));

    /** The driver on the replay host, started by the core with this very node. */
    function openReal(environment: Record<string, string>, allowed: ChatOptions["allowed"] = ["chesspal", "read"]): ReturnType<typeof listen> & { chat: HostChat; pid: () => number; }
    {
        const pidFile = join(makeTempFolder(), "pid");
        const chat = openHostChat("claudeCode", {
            folder: makeTempFolder(),
            program: { command: process.execPath, args: [replayHost] },
            model: "haiku",
            allowed,
            environment: { ...process.env, ...environment, PID_FILE: pidFile },
        });

        if (chat === undefined) {
            throw new Error("Claude Code has no driver");
        }

        return { chat, ...listen(chat), pid: () => Number(readFileSync(pidFile, "utf8")) };
    }

    for (const ends of ["\n", "\r\n"]) {
        it(`gives the recorded flows' texts as the fake host does, its lines ended by ${JSON.stringify(ends)}`, async () => {
            for (const name of ["three-turns", "denied", "resumed"]) {
                const flow = loadFlow(`claude-code/${name}`);
                const { chat, events } = openReal({ FLOW: flowFile(name), ...(ends === "\r\n" ? { CRLF: "1" } : {}) }, name === "denied" ? ["read"] : ["chesspal", "read", "shell"]);

                const words = playerWords(flow);
                // The last turn of three-turns is the one stopped in the recording.
                const turns = name === "three-turns" ? 2 : words.length;

                for (let turn = 0; turn < turns; turn++) {
                    const before = events.length;
                    expect(chat.send(words[turn]!)).toBe(true);
                    await waitFor(() => turnEnds(events).length === turn + 1);
                    const blocks: string[] = [];
                    texts(events.slice(before)).forEach((event) => (blocks[event.block] = `${blocks[event.block] ?? ""}${event.text}`));
                    expect(blocks, `${name}, turn ${turn}`).toEqual(wholeTexts(flow)[turn]);
                }

                chat.close();
            }
        }, 30_000);
    }

    it("stops the process at close: it is gone, and nothing is told after", async () => {
        const { chat, events, pid } = openReal({ FLOW: flowFile("three-turns") });
        chat.send(playerWords(loadFlow("claude-code/three-turns"))[0]!);
        await waitFor(() => events.some((event) => event.type === "session"));
        const told = events.length;
        chat.close();
        await waitFor(() => !isAlive(pid()));
        expect(events).toHaveLength(told);
    }, 30_000);

    it("says why the host ended in the words it wrote on its stderr", async () => {
        const { chat, events } = openReal({ COMPLAIN: "Not logged in|Please run /login" });
        chat.send("Hello");
        await waitFor(() => events.some((event) => event.type === "ended"));
        const why = "the host's program ended (exit code 1): Not logged in | Please run /login";
        expect(events.slice(-2)).toEqual([{ type: "turnEnd", reason: "failed", why }, { type: "ended", why }]);
    }, 30_000);
});

describe("Claude Code as the table drives it", () => {
    const driver = hostDriver("claudeCode")!;
    const exe = process.platform === "win32" ? "claude.exe" : "claude";

    /** A file in a new folder of the test's; the folder. */
    function folderWith(...files: string[]): string
    {
        const made = makeTempFolder();
        files.forEach((file) => {
            mkdirSync(join(made, file, ".."), { recursive: true });
            writeFileSync(join(made, file), "");
        });
        return made;
    }

    it("proposes opus and knows its efforts lowest first", () => {
        expect(driver.model).toBe("opus");
        expect(driver.efforts).toEqual(["low", "medium", "high", "xhigh", "max"]);
    });

    it("finds its own program in a folder of the PATH, whatever the case of the name, before the one in the home's .local/bin", () => {
        const empty = folderWith();
        const onPath = folderWith(exe);
        const home = folderWith(join(".local", "bin", exe));
        const separator = process.platform === "win32" ? ";" : ":";
        expect(driver.program({ Path: [empty, onPath].join(separator) }, process.platform, home)).toEqual({ command: join(onPath, exe), args: [] });
        expect(driver.program({ PATH: empty }, process.platform, home)).toEqual({ command: join(home, ".local", "bin", exe), args: [] });
        expect(driver.program({}, process.platform, home)).toEqual({ command: join(home, ".local", "bin", exe), args: [] });
    });

    it("never takes a shim that needs a shell, a folder of its name, nor another platform's program", () => {
        const shims = folderWith("claude.cmd", "claude.ps1");
        const folder = makeTempFolder();
        mkdirSync(join(folder, exe));
        expect(driver.program({ PATH: [shims, folder].join(process.platform === "win32" ? ";" : ":") }, process.platform, makeTempFolder())).toBeUndefined();
        const linux = folderWith("claude");
        expect(driver.program({ PATH: linux }, "win32", makeTempFolder())).toBeUndefined();
        const windows = folderWith("claude.exe");
        expect(driver.program({ PATH: windows }, "linux", makeTempFolder())).toBeUndefined();
    });

    it("says what a folder lacks for it, and how to mend it: its .mcp.json", () => {
        expect(driver.missing(folderWith(".mcp.json"))).toBeUndefined();
        expect(driver.missing(folderWith())).toBe("This folder has no .mcp.json, which tells Claude Code how to start Chesspal's server: run `chesspal init` in this folder, then try again.");
        expect(driver.missing(folderWith(join(".mcp.json", "a-file")))).toBeDefined();
    });

    it("takes a name of a model or a chat of letters, digits and . _ - : / @ [ ], from a letter or a digit, up to 200", () => {
        for (const name of ["sonnet", "claude-opus-5-5", "sonnet[1m]", "us.anthropic.claude:1", "a/b@c_d", "4o", "x".repeat(200), "0b1c2d3e-aaaa-bbbb"]) {
            expect(isHostName(name), name).toBe(true);
        }

        for (const name of ["", "-x", "--dangerously-skip-permissions", ".hidden", "_x", "a b", "a\0b", "a\nb", "x".repeat(201), "é", "a;b", "a$b"]) {
            expect(isHostName(name), JSON.stringify(name)).toBe(false);
        }
    });

    it("gives the host the table's environment as it is, with what the player set for Claude Code, in a copy", () => {
        const given = { PATH: "/bin", CLAUDE_CODE_USE_BEDROCK: "1", CLAUDE_CONFIG_DIR: "/config", MCP_TIMEOUT: "5", ANTHROPIC_MODEL: "opus", HOME: "/home" };
        expect(driver.environment(given)).toEqual(given);
        expect(driver.environment(given)).not.toBe(given);
    });

    it("drops a Claude Code session's variables, Anthropic's and an MCP server's when the table was started from inside one, but where its settings are", () => {
        const given = { PATH: "/bin", ClaudeCode: "1", CLAUDE_CODE_ENTRYPOINT: "cli", Claude_Code_SSE_PORT: "1", MCP_TIMEOUT: "5", ANTHROPIC_BASE_URL: "http://proxy", anthropic_api_key: "k", claude_config_dir: "/config" };
        expect(driver.environment(given)).toEqual({ PATH: "/bin", claude_config_dir: "/config" });
    });
});

/** Opens the Claude Code driver on a flow played by a fake host, with a clock moved by hand. */
function open(flow: FlowEntry[], overrides: Partial<ChatOptions> = {}, fake: FakeOptions = {}): { chat: HostChat; host: FakeHost; clock: ReturnType<typeof manualClock>; }
{
    const host = fakeHost(flow, fake);
    const clock = manualClock();
    const chat = openHostChat("claudeCode", { ...options(host), later: clock.later, ...overrides });

    if (chat === undefined) {
        throw new Error("Claude Code has no driver");
    }

    return { chat, host, clock };
}

/** Opens the driver on a flow and listens to it. */
function play(flow: FlowEntry[], overrides: Partial<ChatOptions> = {}, fake: FakeOptions = {}): ReturnType<typeof open> & ReturnType<typeof listen>
{
    const opened = open(flow, overrides, fake);
    return { ...opened, ...listen(opened.chat) };
}

function options(host: FakeHost): ChatOptions
{
    return { folder, program: { command: "claude-program", args: ["--first"] }, model: "haiku", allowed: ["chesspal"], environment: { HOME: "/home/player" }, start: host.start };
}

/** Waits in real time until `done` holds, as a real process answers; fails after twenty seconds. */
async function waitFor(done: () => boolean): Promise<void>
{
    for (let waited = 0; waited < 20_000; waited += 10) {
        if (done()) {
            return;
        }

        await new Promise((resolve) => setTimeout(resolve, 10));
    }

    throw new Error("waited twenty seconds in vain");
}

/** Whether a process is running. */
function isAlive(pid: number): boolean
{
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

async function ticks(count: number): Promise<void>
{
    for (let tick = 0; tick < count; tick++) {
        await new Promise((resolve) => setImmediate(resolve));
    }
}

function kindOf(line: Message): string
{
    return line.type === "control_request" ? String((line.request as Message).subtype) : String(line.type);
}

function texts(events: HostEvent[]): Extract<HostEvent, { type: "text"; }>[]
{
    return events.filter((event) => event.type === "text");
}

function summary(event: HostEvent): string
{
    return event.type === "text" ? event.text : event.type === "turnEnd" ? event.reason : event.type;
}

function session(id: string): HostEvent
{
    return { type: "session", session: id, model: "claude-haiku-5-5" };
}

// The lines of hand-written flows.

function said(words: string): FlowEntry
{
    return { dir: "in", msg: { type: "user", message: { role: "user", content: [{ type: "text", text: words }] } } };
}

function out(msg: Message): FlowEntry
{
    return { dir: "out", msg };
}

function raw(line: string): FlowEntry
{
    return { dir: "out", msg: {}, raw: line };
}

/** A turn: the player's words, the host's start, the lines given, a successful end. */
function turn(words: string, ...lines: FlowEntry[]): FlowEntry[]
{
    return [said(words), init(), ...lines, result()];
}

function init(sessionId = "session-1", model = "claude-haiku-5-5"): FlowEntry
{
    return out({ type: "system", subtype: "init", session_id: sessionId, model });
}

function messageStart(id: string): FlowEntry
{
    return out({ type: "stream_event", parent_tool_use_id: null, event: { type: "message_start", message: { id } } });
}

function textStart(id = "m1"): FlowEntry
{
    return out({ type: "stream_event", parent_tool_use_id: null, api_message_id: id, event: { type: "content_block_start", content_block: { type: "text" } } });
}

function delta(words: string, id: string | undefined = "m1", parent: string | null = null): FlowEntry
{
    return out({ type: "stream_event", parent_tool_use_id: parent, ...(id === undefined ? {} : { api_message_id: id }), event: { type: "content_block_delta", delta: { type: "text_delta", text: words } } });
}

function whole(content: Message[], id = "m1", parent: string | null = null): FlowEntry
{
    return out({ type: "assistant", parent_tool_use_id: parent, message: { id, role: "assistant", content } });
}

function text(words: string): Message
{
    return { type: "text", text: words };
}

function toolUse(id: string, name: string, input: Message = {}): Message
{
    return { type: "tool_use", id, name, input };
}

function toolResult(id: string, isError = false, parent: string | null = null): FlowEntry
{
    return out({ type: "user", parent_tool_use_id: parent, message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, is_error: isError, content: "result" }] } });
}

function result(subtype = "success", extra: Message = {}): FlowEntry
{
    return out({ type: "result", subtype, is_error: subtype !== "success", ...extra });
}

function asks(id: string, tool: string, input: Message = {}): FlowEntry
{
    return out({ type: "control_request", request_id: id, request: { subtype: "can_use_tool", tool_name: tool, input, tool_use_id: "toolu" } });
}

function answered(id: string): FlowEntry
{
    return { dir: "in", msg: { type: "control_response", response: { subtype: "success", request_id: id } } };
}

/** The host's answer to the model asked, recorded in the flow. */
function modelAnswer(response: Message): FlowEntry[]
{
    return [
        { dir: "in", msg: { type: "control_request", request_id: "recorded", request: { subtype: "set_model", model: "haiku" } } },
        out({ type: "control_response", response: { request_id: "recorded", ...response } }),
    ];
}
