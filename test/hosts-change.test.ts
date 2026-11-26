// Another model in an open chat, between two turns, and a player not signed in to the host: in Claude Code, Codex and OpenCode, on flows recorded with the
// hosts themselves (2026-11-25/44), the bench's own requests left out: in Claude Code's, its initialize (the set_model it sent in the first turn is kept,
// with the echo Claude Code wrote of it); in Codex's, its thread/read and the notifications the driver does not read (warnings, the MCP servers' start,
// the account, its limits and its tokens, the moderation's metadata).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type ChatOptions, type HostChat, hostDriver, type HostEvent, openHostChat, proposedModel } from "../src/hosts/index.ts";
import { fakeAgent, promptWords } from "./hosts/fake-agent.ts";
import { fakeCodex, isTurnStart, threadOfFlow, turnWords } from "./hosts/fake-codex.ts";
import { type FakeHost, fakeHost, type FlowEntry, listen, loadFlow, manualClock, playerWords, ticksUntil, turnEnds } from "./hosts/fake-host.ts";
import { makeTempFolder } from "./hosts/temp.ts";

type Message = Record<string, unknown>;

const folder = "/players/test";

/** A chat of a host on a fake process, with a clock moved by hand, and its events. */
function chatOn(host: "claudeCode" | "codex" | "openCode", fake: FakeHost, given: Partial<ChatOptions>): { chat: HostChat; clock: ReturnType<typeof manualClock>; } & ReturnType<typeof listen>
{
    const clock = manualClock();
    const options: ChatOptions = { folder, program: { command: "host-program", args: [] }, model: "", allowed: ["chesspal"], environment: {}, start: fake.start, later: clock.later, ...given };
    const chat = openHostChat(host, options);

    if (chat === undefined) {
        throw new Error(`${host} has no driver`);
    }

    // Chesspal's driver of Claude Code tells a turn's tokens with its end, which these flows do not check.
    const withoutUsage = (event: HostEvent): HostEvent => Object.fromEntries(Object.entries(event).filter(([key]) => key !== "usage")) as HostEvent;
    return { chat, clock, ...listen({ ...chat, onEvent: (listener) => chat.onEvent((event) => listener(withoutUsage(event))) }) };
}

function sessions(events: HostEvent[]): string[]
{
    return events.flatMap((event) => (event.type === "session" ? [event.model] : []));
}

function texts(events: HostEvent[]): string
{
    return events.flatMap((event) => (event.type === "text" ? [event.text] : [])).join("");
}

function kindOf(line: Message): string
{
    return line.type === "control_request" ? String((line.request as Message).subtype) : String(line.type);
}

/** The changes the host took, by the model asked. */
function taken(events: HostEvent[]): string[]
{
    return events.flatMap((event) => (event.type === "changeTaken" ? [event.model] : []));
}

describe("another model in an open chat", () => {
    describe("in Claude Code", () => {
        const flow = loadFlow("claude-code/model-change");
        const [first, second] = playerWords(flow) as [string, string];

        it("is asked between turns, the player's next words held until the host confirms it; the next turn runs it, and the host's echo is never shown", async () => {
            const host = fakeHost(flow);
            const { chat, events, until } = chatOn("claudeCode", host, { model: "haiku" });
            // Not before the chat is ready, nor while a turn runs.
            expect(chat.setModel?.("sonnet")).toBe(false);
            chat.send(first);
            expect(chat.setModel?.("sonnet")).toBe(false);
            await until((all) => turnEnds(all).length === 1);

            expect(chat.setModel?.("sonnet")).toBe(true);
            // The host's confirmation is told at once, before any turn names it.
            await until((all) => sessions(all).length === 2);
            expect(chat.send(second)).toBe(true);
            await until((all) => turnEnds(all).length === 2);

            expect(host.problems).toEqual([]);
            expect(host.written.map(kindOf)).toEqual(["set_model", "user", "set_model", "user"]);
            expect((host.written[2]!.request as Message).model).toBe("sonnet");
            // The next turn's start, which names the same model, tells nothing more.
            expect(sessions(events)).toEqual(["claude-haiku-5-5", "claude-sonnet-5-5"]);
            expect(taken(events)).toEqual(["sonnet"]);
            expect(turnEnds(events)).toEqual([{ type: "turnEnd", reason: "done" }, { type: "turnEnd", reason: "done" }]);
            expect(texts(events)).toBe("oklanterna");
        });

        it("sets the effort asked with it once the model is confirmed, and holds the words until the host took it", async () => {
            const host = fakeHost(flow, { ignore: ["apply_flag_settings"] });
            const { chat, clock, events, until } = chatOn("claudeCode", host, { model: "haiku" });
            chat.send(first);
            await until((all) => turnEnds(all).length === 1);

            expect(chat.setModel?.("sonnet", "high")).toBe(true);
            chat.send(second);
            await ticksUntil(() => host.written.some((line) => kindOf(line) === "apply_flag_settings"));
            expect(host.written.at(-1)).toEqual({ type: "control_request", request_id: expect.any(String) as unknown, request: { subtype: "apply_flag_settings", settings: { effortLevel: "high" } } });

            // The host never answers it: the words are never written, and the chat ends when the wait is over.
            await new Promise((resolve) => setImmediate(resolve));
            expect(host.written.filter((line) => line.type === "user")).toHaveLength(1);
            clock.advance(30_000);
            const why = "the host did not confirm the model sonnet within 30 seconds";
            expect(events.slice(-2)).toEqual([{ type: "turnEnd", reason: "failed", why }, { type: "ended", why }]);
        });

        it("goes on with the model taken and the effort it ran before when the host does not take the effort", async () => {
            const host = fakeHost(flow, { effortError: "no such effort" });
            const { chat, events, until } = chatOn("claudeCode", host, { model: "haiku", effort: "low" });
            chat.send(first);
            await until((all) => turnEnds(all).length === 1);

            chat.setModel?.("sonnet", "ultra");
            await until((all) => sessions(all).length === 2);
            expect(events.filter((event) => event.type === "changeRefused")).toEqual([
                { type: "changeRefused", asked: "sonnet", model: "sonnet", effort: "low", why: "the host did not take the effort ultra: no such effort" },
            ]);
            expect(chat.send(second)).toBe(true);
            await until((all) => turnEnds(all).length === 2);
            expect(turnEnds(events)[1]).toEqual({ type: "turnEnd", reason: "done" });
            expect(events.some((event) => event.type === "ended")).toBe(false);
            // The model taken, its effort not: the refusal first, then the change taken.
            expect(events.filter((event) => event.type === "changeRefused" || event.type === "changeTaken").map((event) => event.type)).toEqual(["changeRefused", "changeTaken"]);
        });

        it("goes on with the model it ran when the host answers another with an error, or says it stayed on it", async () => {
            for (const refusing of [{ modelErrors: { opus: "no such model" } }, { modelRuns: { opus: "claude-haiku-5-5" } }]) {
                const host = fakeHost(flow, refusing);
                const { chat, events, until } = chatOn("claudeCode", host, { model: "haiku" });
                chat.send(first);
                await until((all) => turnEnds(all).length === 1);

                expect(chat.setModel?.("opus")).toBe(true);
                await until((all) => all.some((event) => event.type === "changeRefused"));
                const why = "modelErrors" in refusing ? "the host did not take the model opus: no such model" : "the host was asked for the model opus and stayed on claude-haiku-5-5";
                expect(events.filter((event) => event.type === "changeRefused")).toEqual([{ type: "changeRefused", asked: "opus", model: "haiku", why }]);

                // Ready again with it: another change, then the next turn, play as recorded.
                expect(chat.setModel?.("sonnet")).toBe(true);
                await until((all) => sessions(all).length === 2);
                chat.send(second);
                await until((all) => turnEnds(all).length === 2);
                expect(turnEnds(events)[1]).toEqual({ type: "turnEnd", reason: "done" });
                expect(host.written.map(kindOf)).toEqual(["set_model", "user", "set_model", "set_model", "user"]);
                expect(taken(events)).toEqual(["sonnet"]);
            }
        });

        it("ends the chat when the host says it runs a third model", async () => {
            const host = fakeHost(flow, { modelRuns: { opus: "claude-fable-5" } });
            const { chat, events, until } = chatOn("claudeCode", host, { model: "haiku" });
            chat.send(first);
            await until((all) => turnEnds(all).length === 1);

            chat.setModel?.("opus");
            await until((all) => all.some((event) => event.type === "ended"));
            expect(events.at(-1)).toEqual({ type: "ended", why: "the host was asked for the model opus and runs claude-fable-5" });
        });

        it("is refused once the chat ended, and for a name the program could read as an option", async () => {
            const host = fakeHost(flow);
            const { chat, until } = chatOn("claudeCode", host, { model: "haiku" });
            chat.send(first);
            await until((all) => turnEnds(all).length === 1);

            expect(chat.setModel?.("--dangerously-skip-permissions")).toBe(false);
            expect(chat.setModel?.("sonnet", "--x")).toBe(false);
            chat.close();
            expect(chat.setModel?.("sonnet")).toBe(false);
            expect(host.written.map(kindOf)).toEqual(["set_model", "user"]);
        });
    });

    describe("in Codex", () => {
        const flow = loadFlow("codex/model-change");
        const [first, second] = turnWords(flow) as [string, string];
        // The same two turns with the thread's settings changed between them, as Elena Galli recorded it from Codex 0.166.0 on a thread with no turn
        // (2026-11-25/43, cx5): the request, its empty answer, then the settings that confirm it; its thread and folder made the flow's.
        const now = loadFlow("codex/model-change-now");

        /** The flow with the thread's settings Codex answers the change with naming another model or effort. */
        const settingsSay = (model: string, effort: string): FlowEntry[] =>
            now.map((entry) => {
                if (entry.msg.method !== "thread/settings/updated") {
                    return entry;
                }

                const params = entry.msg.params as Message;
                return { ...entry, msg: { ...entry.msg, params: { ...params, threadSettings: { ...(params.threadSettings as Message), model, effort } } } };
            });

        it("is set on the thread between turns and told as soon as the thread's settings confirm it, before any turn; the next turn's start names it", async () => {
            const host = fakeCodex(now);
            const { chat, events, until } = chatOn("codex", host, { model: "gpt-6-luna", effort: "low" });
            chat.send(first);
            await until((all) => turnEnds(all).length === 1);

            expect(chat.setModel?.("gpt-6.1-sol", "low")).toBe(true);
            await until((all) => taken(all).length === 1);
            expect(sessions(events)).toEqual(["gpt-6-luna", "gpt-6.1-sol"]);
            expect(host.written.at(-1)).toEqual({ jsonrpc: "2.0", id: expect.any(Number) as unknown, method: "thread/settings/update", params: { threadId: threadOfFlow(now), model: "gpt-6.1-sol", effort: "low" } });

            chat.send(second);
            await until((all) => turnEnds(all).length === 2);
            expect(host.problems).toEqual([]);
            const starts = host.written.filter(isTurnStart).map((line) => line.params as Message);
            expect(starts.map((params) => [params.model, params.effort])).toEqual([["gpt-6-luna", "low"], ["gpt-6.1-sol", "low"]]);
            // The next turn, which names the same model, tells nothing more.
            expect(sessions(events)).toEqual(["gpt-6-luna", "gpt-6.1-sol"]);
            expect(taken(events)).toEqual(["gpt-6.1-sol"]);
            expect(turnEnds(events)).toEqual([{ type: "turnEnd", reason: "done" }, { type: "turnEnd", reason: "done" }]);
            expect(texts(events)).toBe("oklanterna");
        });

        it("holds the player's words until Codex confirms it; with no settings within the wait, goes back to the model it ran and writes them with it", async () => {
            const host = fakeCodex(now, { ignore: ["thread/settings/update"] });
            const { chat, clock, events, until } = chatOn("codex", host, { model: "gpt-6-luna", effort: "low" });
            chat.send(first);
            await until((all) => turnEnds(all).length === 1);

            expect(chat.setModel?.("gpt-6.1-sol", "low")).toBe(true);
            // Another change meanwhile waits too.
            expect(chat.setModel?.("gpt-6-sol")).toBe(false);
            expect(chat.send(second)).toBe(true);
            await new Promise((resolve) => setImmediate(resolve));
            expect(host.written.filter(isTurnStart)).toHaveLength(1);

            clock.advance(30_000);
            expect(events.filter((event) => event.type === "changeRefused")).toEqual([
                { type: "changeRefused", asked: "gpt-6.1-sol", model: "gpt-6-luna", effort: "low", why: "the host did not confirm the model gpt-6.1-sol within 30 seconds" },
            ]);
            const starts = host.written.filter(isTurnStart).map((line) => line.params as Message);
            expect(starts.map((params) => [params.model, params.effort])).toEqual([["gpt-6-luna", "low"], ["gpt-6-luna", "low"]]);
            expect(taken(events)).toEqual([]);
            expect(events.some((event) => event.type === "ended")).toBe(false);
        });

        it("goes back to the model it ran when Codex answers the change with an error, and plays the next turn with it", async () => {
            const host = fakeCodex(now, { failing: ["thread/settings/update"] });
            const { chat, events, until } = chatOn("codex", host, { model: "gpt-6-luna", effort: "low" });
            chat.send(first);
            await until((all) => turnEnds(all).length === 1);

            expect(chat.setModel?.("gpt-6.1-sol", "high")).toBe(true);
            await until((all) => all.some((event) => event.type === "changeRefused"));
            expect(events.filter((event) => event.type === "changeRefused")).toEqual([
                { type: "changeRefused", asked: "gpt-6.1-sol", model: "gpt-6-luna", effort: "low", why: "the host did not take the model gpt-6.1-sol: thread/settings/update failed" },
            ]);

            // The settings the recording holds, which Codex would not send after an error, change nothing: the next turn plays with the model it ran.
            chat.send(second);
            await until((all) => turnEnds(all).length === 2);
            expect(turnEnds(events)[1]).toEqual({ type: "turnEnd", reason: "done" });
            const starts = host.written.filter(isTurnStart).map((line) => line.params as Message);
            expect(starts.map((params) => [params.model, params.effort])).toEqual([["gpt-6-luna", "low"], ["gpt-6-luna", "low"]]);
            expect(sessions(events)).toEqual(["gpt-6-luna"]);
            expect(taken(events)).toEqual([]);
        });

        it("goes back to the model it ran when the thread's settings name another model or effort than those asked", async () => {
            for (
                const [model, effort, why] of [
                    ["gpt-other", "low", "the host was asked for the model gpt-6.1-sol and runs gpt-other"],
                    ["gpt-6.1-sol", "medium", "the host was asked for the effort low and runs medium"],
                ] as const
            ) {
                const host = fakeCodex(settingsSay(model, effort));
                const { chat, events, until } = chatOn("codex", host, { model: "gpt-6-luna", effort: "low" });
                chat.send(first);
                await until((all) => turnEnds(all).length === 1);

                expect(chat.setModel?.("gpt-6.1-sol", "low")).toBe(true);
                await until((all) => all.some((event) => event.type === "changeRefused"));
                expect(events.filter((event) => event.type === "changeRefused")).toEqual([{ type: "changeRefused", asked: "gpt-6.1-sol", model: "gpt-6-luna", effort: "low", why }]);
                chat.send(second);
                await until((all) => turnEnds(all).length === 2);
                expect((host.written.filter(isTurnStart).at(-1)?.params as Message).model).toBe("gpt-6-luna");
                expect(taken(events)).toEqual([]);
            }
        });

        it("changes the effort alone at once, telling no new session", async () => {
            const host = fakeCodex(settingsSay("gpt-6-luna", "high"));
            const { chat, events, until } = chatOn("codex", host, { model: "gpt-6-luna", effort: "low" });
            chat.send(first);
            await until((all) => turnEnds(all).length === 1);

            expect(chat.setModel?.("gpt-6-luna", "high")).toBe(true);
            await until((all) => taken(all).length === 1);
            chat.send(second);
            await until((all) => turnEnds(all).length === 2);
            const starts = host.written.filter(isTurnStart).map((line) => line.params as Message);
            expect(starts.map((params) => [params.model, params.effort])).toEqual([["gpt-6-luna", "low"], ["gpt-6-luna", "high"]]);
            expect(sessions(events)).toEqual(["gpt-6-luna"]);
            expect(taken(events)).toEqual(["gpt-6-luna"]);
            expect(turnEnds(events)).toEqual([{ type: "turnEnd", reason: "done" }, { type: "turnEnd", reason: "done" }]);
            expect(host.problems).toEqual([]);
        });

        it("without the change, the same flow fails the second turn: the recorded settings name another model", async () => {
            const host = fakeCodex(flow);
            const { chat, events, until } = chatOn("codex", host, { model: "gpt-6-luna", effort: "low" });
            chat.send(first);
            await until((all) => turnEnds(all).length === 1);
            chat.send(second);
            await until((all) => turnEnds(all).length === 2);
            expect(turnEnds(events)[1]).toEqual({ type: "turnEnd", reason: "failed", why: "the host runs the model gpt-5.6-luna instead of gpt-6-luna" });
        });

        it("is refused while a turn runs", async () => {
            const host = fakeCodex(now);
            const { chat, until } = chatOn("codex", host, { model: "gpt-6-luna", effort: "low" });
            await ticksUntil(() => chat.send(first));
            expect(chat.setModel?.("gpt-5.6-luna")).toBe(false);
            await until((all) => turnEnds(all).length === 1);
            expect(chat.setModel?.("gpt-5.6-luna")).toBe(true);
        });
    });

    describe("in OpenCode", () => {
        const flow = loadFlow("opencode/model-change");
        const [first, second] = promptWords(flow) as [string, string];
        const session = "ses_deb260f9dffe7THsuxEQxNsN1x";

        it("is set as the session's option between turns, its answer the confirmation, told at once", async () => {
            const host = fakeAgent(flow);
            const { chat, events, until } = chatOn("openCode", host, { model: "opencode/deepseek-v4.1-flash-free" });
            chat.send(first);
            await until((all) => turnEnds(all).length === 1);

            expect(chat.setModel?.("opencode/big-pickle")).toBe(true);
            await until((all) => sessions(all).length === 2);
            chat.send(second);
            await until((all) => turnEnds(all).length === 2);

            expect(host.problems).toEqual([]);
            const settings = host.written.filter((line) => line.method === "session/set_config_option").map((line) => (line.params as Message).value);
            expect(settings).toEqual(["opencode/deepseek-v4.1-flash-free", "opencode/big-pickle"]);
            expect(host.written.map((line) => line.method).slice(-2)).toEqual(["session/set_config_option", "session/prompt"]);
            expect(sessions(events)).toEqual(["opencode/deepseek-v4.1-flash-free", "opencode/big-pickle"]);
            expect(taken(events)).toEqual(["opencode/big-pickle"]);
            expect(texts(events)).toBe("oklanterna");
        });

        it("goes on with the model it ran when the agent answers the one asked with an error, and plays the next turn", async () => {
            const host = fakeAgent(flow, { refusing: { "opencode/big-pickle": "Model not found: opencode/big-pickle" } });
            const { chat, events, until } = chatOn("openCode", host, { model: "opencode/deepseek-v4.1-flash-free" });
            chat.send(first);
            await until((all) => turnEnds(all).length === 1);

            expect(chat.setModel?.("opencode/big-pickle")).toBe(true);
            await until((all) => all.some((event) => event.type === "changeRefused"));
            expect(events.filter((event) => event.type === "changeRefused")).toEqual([{
                type: "changeRefused",
                asked: "opencode/big-pickle",
                model: "opencode/deepseek-v4.1-flash-free",
                why: "the host did not take the model opencode/big-pickle: Model not found: opencode/big-pickle",
            }]);
            expect(chat.send(second)).toBe(true);
            await until((all) => turnEnds(all).length === 2);
            expect(turnEnds(events)[1]).toEqual({ type: "turnEnd", reason: "done" });
            expect(sessions(events)).toEqual(["opencode/deepseek-v4.1-flash-free"]);
            expect(taken(events)).toEqual([]);
            expect(events.some((event) => event.type === "ended")).toBe(false);
        });

        it("is refused while a turn the host began by itself runs", async () => {
            const host = fakeAgent(flow);
            const { chat, until } = chatOn("openCode", host, { model: "opencode/deepseek-v4.1-flash-free" });
            chat.send(first);
            await until((all) => turnEnds(all).length === 1);

            host.says({ jsonrpc: "2.0", method: "session/update", params: { sessionId: session, update: { sessionUpdate: "agent_message_chunk", messageId: "m9", content: { type: "text", text: "And then…" } } } });
            await until((all) => all.some((event) => event.type === "turnStart"));
            expect(chat.setModel?.("opencode/big-pickle")).toBe(false);
            expect(host.written.filter((line) => line.method === "session/set_config_option")).toHaveLength(1);
        });
    });
});

describe("a player not signed in to the host", () => {
    it("in Claude Code: the host's own message is never the AI's words; the chat ends with the sign-in's code and the table's words", async () => {
        const flow = loadFlow("claude-code/not-signed-in");
        const host = fakeHost(flow, { models: { opus: "claude-opus-5-5" } });
        const { chat, events, until } = chatOn("claudeCode", host, { model: "opus" });
        chat.send(playerWords(flow)[0]!);
        await until((all) => all.some((event) => event.type === "ended"));

        const why = "Claude Code is not signed in on this computer: sign in to Claude Code, then open the chat again";
        expect(events.filter((event) => event.type !== "session")).toEqual([{ type: "turnEnd", reason: "failed", why, code: "signin" }, { type: "ended", why, code: "signin" }]);
        expect(JSON.stringify(events)).not.toMatch(/login|terminal/i);
        // Let go to end by itself, as one saving the player's login: never stopped at once.
        expect(host.inputClosed).toBe(true);
        expect(host.stopped).toBe(false);
    });

    it("in Claude Code, any other error of the API the host words itself fails the turn with its words, once, never as the AI's, and the chat goes on", async () => {
        // The recorded flow with the error of a limit of use in place of the sign-in's: its shape, is_api_error_message and the result after it, as recorded.
        const recorded = loadFlow("claude-code/not-signed-in");
        const limit = "You've hit your usage limit · resets 3pm";
        const flow = recorded.map((entry) => {
            if (entry.msg.type === "assistant") {
                const body = entry.msg.message as Message;
                return { ...entry, msg: { ...entry.msg, error: "rate_limit", message: { ...body, content: [{ type: "text", text: limit }] } } };
            }

            return entry.msg.type === "result" ? { ...entry, msg: { ...entry.msg, result: limit } } : entry;
        });
        const host = fakeHost(flow, { models: { opus: "claude-opus-5-5" } });
        const { chat, events, until } = chatOn("claudeCode", host, { model: "opus" });
        chat.send(playerWords(flow)[0]!);
        await until((all) => turnEnds(all).length === 1);

        expect(events.filter((event) => event.type !== "session")).toEqual([{ type: "turnEnd", reason: "failed", why: limit }]);
        expect(host.stopped).toBe(false);
    });

    // Never seen from the hosts themselves: flows in the protocol's shapes, with the fake agent.
    const refusedTurn = (error: Message): FlowEntry[] => [
        { dir: "in", msg: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} } },
        { dir: "out", msg: { jsonrpc: "2.0", id: 1, result: { protocolVersion: 1, agentCapabilities: {} } } },
        { dir: "in", msg: { jsonrpc: "2.0", id: 2, method: "session/new", params: {} } },
        { dir: "out", msg: { jsonrpc: "2.0", id: 2, result: { sessionId: "ses_1", configOptions: [{ id: "model", category: "model", currentValue: "anthropic/x", options: [] }] } } },
        { dir: "in", msg: { jsonrpc: "2.0", id: 3, method: "session/prompt", params: { prompt: [{ type: "text", text: "Hello" }] } } },
        { dir: "out", msg: { jsonrpc: "2.0", id: 3, error } },
    ];

    it("in OpenCode, by the protocol's own error alone: the chat ends with the code, and the host's words say to sign in from OpenCode itself", async () => {
        const { chat, events, until } = chatOn("openCode", fakeAgent(refusedTurn({ code: -32000, message: "Authentication required" })), { model: "anthropic/x" });
        chat.send("Hello");
        await until((all) => all.some((event) => event.type === "ended"));

        const why = "Authentication required: sign in from OpenCode itself, then try again";
        expect(events.filter((event) => event.type !== "session")).toEqual([{ type: "turnEnd", reason: "failed", why, code: "signin" }, { type: "ended", why, code: "signin" }]);
    });

    it("in OpenCode, a provider's key refused is a failed turn, never a sign-in to OpenCode; in Antigravity, whose own error is not known, the same words are", async () => {
        const revoked = { code: -32603, message: "authentication failed: the API key of anthropic was revoked" };
        const openCode = chatOn("openCode", fakeAgent(refusedTurn(revoked)), { model: "anthropic/x" });
        openCode.chat.send("Hello");
        await openCode.until((all) => turnEnds(all).length === 1);
        expect(openCode.events.filter((event) => event.type !== "session")).toEqual([{ type: "turnEnd", reason: "failed", why: revoked.message }]);

        const antigravity = openHostChat("antigravity", { folder, program: { command: "agy", args: [] }, model: "anthropic/x", allowed: ["chesspal"], environment: {}, start: fakeAgent(refusedTurn(revoked)).start });
        const heard = listen(antigravity!);
        antigravity!.send("Hello");
        await heard.until((all) => all.some((event) => event.type === "ended"));
        expect(heard.events.at(-1)).toMatchObject({ type: "ended", code: "signin" });
    });
});

describe("a chat's end in the table's log", () => {
    it("says how the host's program went once its chat was closed gently: by itself, or stopped after the wait", async () => {
        const flow = loadFlow("claude-code/model-change");

        for (const ends of [true, false]) {
            const logged: string[] = [];
            const host = fakeHost(flow);
            const { chat, clock, until } = chatOn("claudeCode", host, { model: "haiku", log: (line) => logged.push(line) });
            chat.send(playerWords(flow)[0]!);
            await until((all) => turnEnds(all).length === 1);

            chat.close(true);
            expect(host.inputClosed).toBe(true);
            expect(logged).toEqual([]);

            if (ends) {
                host.end("exit code 0");
                clock.advance(10_000);
                expect(host.stops).toBe(0);
                expect(logged).toEqual(["Claude Code ended by itself once its chat was closed."]);
            } else {
                clock.advance(10_000);
                expect(host.stops).toBe(1);
                expect(logged).toEqual(["Claude Code was stopped 10 s after its chat was closed."]);
            }
        }
    });

    it("says it of a chat that ended as the host cannot play, and never of one stopped at once", async () => {
        const flow = loadFlow("claude-code/not-signed-in");
        const logged: string[] = [];
        const host = fakeHost(flow, { models: { opus: "claude-opus-5-5" } });
        const { chat, until } = chatOn("claudeCode", host, { model: "opus", log: (line) => logged.push(line) });
        chat.send(playerWords(flow)[0]!);
        await until((all) => all.some((event) => event.type === "ended"));
        host.end("exit code 1");
        expect(logged).toEqual(["Claude Code ended by itself once its chat was closed."]);

        const other: string[] = [];
        const again = fakeHost(loadFlow("claude-code/model-change"));
        const opened = chatOn("claudeCode", again, { model: "haiku", log: (line) => other.push(line) });
        opened.chat.close();
        opened.clock.advance(10_000);
        expect(again.stops).toBe(1);
        expect(other).toEqual([]);
    });
});

describe("the models a host advises", () => {
    it("in OpenCode: the one in play, unless it is paid apart for each answer; each with its provider, those of a provider's key paid apart", async () => {
        const options = (current: string): Message[] => [{ id: "model", category: "model", currentValue: current, options: ["opencode/big-pickle", "openai/gpt-x", "ollama/qwen", "lonely"].map((value) => ({ value })) }];

        const asked = async (current: string): Promise<unknown> => {
            const host = fakeAgent([
                { dir: "in", msg: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} } },
                { dir: "out", msg: { jsonrpc: "2.0", id: 1, result: { protocolVersion: 1, agentCapabilities: {} } } },
                { dir: "in", msg: { jsonrpc: "2.0", id: 2, method: "session/new", params: {} } },
                { dir: "out", msg: { jsonrpc: "2.0", id: 2, result: { sessionId: "ses_1", configOptions: options(current) } } },
            ]);
            const models = await hostDriver("openCode")?.models({ folder, program: { command: "opencode-program", args: [] }, environment: {}, start: host.start });
            return models?.map(({ id, advised, metered, group }) => ({ id, advised, metered, group }));
        };

        expect(await asked("openai/gpt-x")).toEqual([
            { id: "openai/gpt-x", advised: undefined, metered: true, group: "openai" },
            { id: "opencode/big-pickle", advised: undefined, metered: undefined, group: "opencode" },
            { id: "ollama/qwen", advised: undefined, metered: undefined, group: "ollama" },
            { id: "lonely", advised: undefined, metered: undefined, group: undefined },
        ]);
        expect((await asked("opencode/big-pickle") as { advised?: true; }[])[0]!.advised).toBe(true);
    });

    it("in OpenCode, keeps before the cut those not paid apart, its own first, then those run on this computer; and proposes its own first", async () => {
        // The shape of a real list, seen on a player's computer: 209 models, the one in play paid apart, OpenCode's own last, three of ollama at 121.
        const values = Array.from({ length: 209 }, (_, index) => {
            if (index >= 199) {
                return `opencode/free-${String(index - 199)}`;
            }

            return index >= 121 && index <= 123 ? `ollama/local-${String(index - 121)}` : `cloud-${String(index % 3)}/model-${String(index)}`;
        });
        const host = fakeAgent([
            { dir: "in", msg: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} } },
            { dir: "out", msg: { jsonrpc: "2.0", id: 1, result: { protocolVersion: 1, agentCapabilities: {} } } },
            { dir: "in", msg: { jsonrpc: "2.0", id: 2, method: "session/new", params: {} } },
            { dir: "out", msg: { jsonrpc: "2.0", id: 2, result: { sessionId: "ses_1", configOptions: [{ id: "model", category: "model", currentValue: values[0], options: values.map((value) => ({ value })) }] } } },
        ]);
        const driver = hostDriver("openCode")!;
        const models = await driver.models({ folder, program: { command: "opencode-program", args: [] }, environment: {}, start: host.start });

        expect(models).toHaveLength(200);
        expect(models[0]!.id).toBe(values[0]);
        expect(models.slice(1, 14).map((one) => one.id)).toEqual([...values.slice(199), "ollama/local-0", "ollama/local-1", "ollama/local-2"]);
        expect(proposedModel(driver, models)).toBe("opencode/free-0");
    });

    it("proposes, where the player named none, the one advised, else the first, never one paid apart; else the driver's own", () => {
        const driver = hostDriver("openCode");

        if (driver === undefined) {
            throw new Error("OpenCode has no driver");
        }

        const paid = { id: "openai/gpt-x", name: "x", efforts: [], metered: true as const, advised: true as const };
        const free = { id: "opencode/a", name: "a", efforts: [] };
        expect(proposedModel(driver, [paid, free, { ...free, id: "opencode/b", advised: true }])).toBe("opencode/b");
        expect(proposedModel(driver, [paid, free])).toBe("opencode/a");
        expect(proposedModel(driver, [paid])).toBe(driver.model);
        expect(proposedModel(driver, [])).toBe(driver.model);
    });
});

describe("a trace of the host's lines", () => {
    it("adds every line written and read to the file the table names, after a warning in a new one; the host's process never gets its variable", async () => {
        const trace = join(makeTempFolder(), "trace.jsonl");
        const flow = loadFlow("claude-code/model-change");
        const host = fakeHost(flow);
        const { chat, until } = chatOn("claudeCode", host, { model: "haiku", trace, environment: { PATH: "/bin", CHESSPAL_HOST_TRACE: trace } });
        chat.send(playerWords(flow)[0]!);
        await until((all) => turnEnds(all).length === 1);
        host.complain("a line on stderr");

        const lines = readFileSync(trace, "utf8").trim().split("\n").map((line) => JSON.parse(line) as Message);
        expect(lines[0]).toEqual({ warning: expect.stringMatching(/name of your account and the whole chat/) as unknown });
        const ways = lines.slice(1).map((line) => line.dir);
        expect(ways.slice(0, 3)).toEqual(["in", "out", "in"]);
        expect(ways.at(-1)).toBe("err");
        expect(ways.filter((way) => way === "in")).toHaveLength(host.written.length);
        expect(lines.slice(1).every((line) => typeof line.t === "string" && typeof line.line === "string")).toBe(true);
        expect(JSON.parse(String(lines[1]!.line))).toEqual(host.written[0]);
        expect(host.started?.options.env).toEqual({ PATH: "/bin" });

        // Taken up in the same file: no warning again.
        const again = fakeHost(flow);
        const second = chatOn("claudeCode", again, { model: "haiku", trace });
        second.chat.send(playerWords(flow)[0]!);
        await second.until((all) => turnEnds(all).length === 1);
        expect(readFileSync(trace, "utf8").split("\n").filter((line) => line.includes('"warning"'))).toHaveLength(1);
    });

    it("never stops the chat where its file cannot be written", async () => {
        const flow = loadFlow("claude-code/model-change");
        const { chat, events, until } = chatOn("claudeCode", fakeHost(flow), { model: "haiku", trace: join(makeTempFolder(), "no-such-folder", "trace.jsonl") });
        chat.send(playerWords(flow)[0]!);
        await until((all) => turnEnds(all).length === 1);
        expect(turnEnds(events)).toEqual([{ type: "turnEnd", reason: "done" }]);
    });
});
