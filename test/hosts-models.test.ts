import { describe, expect, it } from "vitest";
import { claudeModels } from "../src/hosts/claude-code/models.ts";
import { type HostDriver, hostDriver, type HostModel, hostsOffered, modelKeeper } from "../src/hosts/index.ts";
import type { HostId } from "../src/hosts/names.ts";
import { fakeHost, type FlowEntry, manualClock } from "./hosts/fake-host.ts";

// The models a host offers: Claude Code's, asked of a fake host; kept by the keeper; and every host of the registry as the page offers it.

const efforts = ["low", "medium", "high", "xhigh", "max"];
const account = { email: "ada@example.org", organization: "Ada's Guild", subscriptionType: "guild-plan-x" };
const ask = { type: "control_request", request_id: "chesspal-models", request: { subtype: "initialize" } };

/** Claude Code's answer to the first request, as measured, with a made-up account beside the models. */
function answered(models: unknown[]): FlowEntry[]
{
    const response = { commands: [], agents: [], output_style: "default", models, account, pid: 4242 };
    return [{ dir: "in", msg: ask }, { dir: "out", msg: { type: "control_response", response: { subtype: "success", request_id: "chesspal-models", response } } }];
}

const listed = [
    { value: "default", resolvedModel: "claude-opus-5-5", displayName: "Default (recommended)", description: "Opus 5.5 · Best for everyday, complex tasks", supportsEffort: true, supportedEffortLevels: efforts },
    { value: "opus", resolvedModel: "claude-opus-5-5", displayName: "Opus 5.5", description: "For complex work and everyday tasks", supportsEffort: true, supportedEffortLevels: efforts },
    { value: "claude-fable-5-2", resolvedModel: "claude-fable-5-2", displayName: "Fable 5.2", description: "For your toughest challenges", supportsEffort: true, supportedEffortLevels: efforts },
    { value: "--dangerously-skip-permissions", displayName: "Not a model", supportedEffortLevels: efforts },
    { value: "sonnet", resolvedModel: "claude-sonnet-5-5", displayName: "Sonnet 5.5", description: "Most efficient for simpler tasks", supportsEffort: true, supportedEffortLevels: efforts },
    { value: "opus", displayName: "Opus again" },
    { value: "claude-haiku-4-5-20251001", resolvedModel: "claude-haiku-4-5-20251001", displayName: "Haiku 4.5", description: "Fastest for quick answers", supportsThinkingOff: true },
    { value: "odd", displayName: "", description: "", supportedEffortLevels: ["low", 3] },
];

function asking(flow: FlowEntry[]): { fake: ReturnType<typeof fakeHost>; clock: ReturnType<typeof manualClock>; models: Promise<HostModel[]>; }
{
    const fake = fakeHost(flow);
    const clock = manualClock();
    const models = claudeModels({ folder: "/player", program: { command: "claude-program", args: ["--first"] }, environment: { PATH: "/bin" }, start: fake.start, later: clock.later });
    return { fake, clock, models };
}

describe("the models Claude Code offers", () => {
    it("are asked by the first request of a program with no tool and no MCP server, in the folder given, and read from its answer", async () => {
        const { fake, models } = asking(answered(listed));
        const read = await models;

        expect(fake.started).toEqual({
            command: "claude-program",
            args: [
                "--first",
                "-p",
                "--input-format",
                "stream-json",
                "--output-format",
                "stream-json",
                "--verbose",
                "--setting-sources",
                "project,local",
                "--strict-mcp-config",
                "--disable-slash-commands",
                "--tools",
                "",
            ],
            options: { cwd: "/player", env: { PATH: "/bin" }, errors: expect.any(Function) as unknown },
        });
        expect(fake.written).toEqual([ask]);
        expect(fake.problems).toEqual([]);
        // The model the account's default stands for is the one advised.
        expect(read).toEqual([
            { id: "opus", name: "Opus 5.5", about: "For complex work and everyday tasks", efforts, advised: true },
            { id: "claude-fable-5-2", name: "Fable 5.2", about: "For your toughest challenges", efforts },
            { id: "sonnet", name: "Sonnet 5.5", about: "Most efficient for simpler tasks", efforts },
            { id: "claude-haiku-4-5-20251001", name: "Haiku 4.5", about: "Fastest for quick answers", efforts: [] },
            { id: "odd", name: "odd", efforts: [] },
        ]);
        expect(fake.inputClosed).toBe(true);
        expect(fake.stops).toBe(0);
    });

    it("keep nothing of the account the answer holds", async () => {
        const said = JSON.stringify(await asking(answered(listed)).models);

        for (const value of Object.values(account)) {
            expect(said).not.toContain(value);
        }

        expect(said).not.toContain("4242");
    });

    it("are at most forty", async () => {
        const many = Array.from({ length: 50 }, (_, index) => ({ value: `model-${index}`, displayName: `Model ${index}` }));
        expect((await asking(answered(many)).models).map((model) => model.id)).toEqual(many.slice(0, 40).map((model) => model.value));
    });

    it("are none where it does not answer within ten seconds, the program stopped only ten seconds later", async () => {
        const { fake, clock, models } = asking([{ dir: "in", msg: ask }]);
        let done = false;
        void models.then(() => (done = true));
        clock.advance(9999);
        await new Promise((resolve) => setImmediate(resolve));
        expect(done).toBe(false);
        expect(fake.stops).toBe(0);
        clock.advance(1);
        expect(await models).toEqual([]);
        expect(fake.stops).toBe(0);
        clock.advance(10_000);
        expect(fake.stops).toBe(1);
    });

    it("are none, the program let go, where its answer is an error or no JSON; none, nothing stopped, where it ends without one", async () => {
        const failed = asking([{ dir: "in", msg: ask }, { dir: "out", msg: { type: "control_response", response: { subtype: "error", request_id: "chesspal-models", error: "no" } } }]);
        expect(await failed.models).toEqual([]);
        expect(failed.fake.inputClosed).toBe(true);
        expect(failed.fake.stops).toBe(0);

        const garbled = asking([{ dir: "in", msg: ask }, { dir: "out", msg: {}, raw: "Not logged in" }]);
        expect(await garbled.models).toEqual([]);
        expect(garbled.fake.inputClosed).toBe(true);

        const ended = asking([{ dir: "in", msg: ask }]);
        ended.fake.end("exit code 1");
        expect(await ended.models).toEqual([]);
        expect(ended.fake.stops).toBe(0);
    });

    it("let the program end by itself once it answered: its input closed, the list given at once, stopped only ten seconds later if it is still there", async () => {
        const logged: string[] = [];

        const ends = (): { fake: ReturnType<typeof fakeHost>; clock: ReturnType<typeof manualClock>; models: Promise<HostModel[]>; } => {
            const fake = fakeHost(answered(listed));
            const clock = manualClock();
            const models = claudeModels({ folder: "/players/test", program: { command: "claude-program", args: [] }, environment: {}, start: fake.start, later: clock.later, log: (line) => logged.push(line) });
            return { fake, clock, models };
        };

        // It ends by itself within the grace: never stopped.
        const leaving = ends();
        expect(await leaving.models).toHaveLength(5);
        expect(leaving.fake.inputClosed).toBe(true);
        leaving.clock.advance(3000);
        leaving.fake.end("exit code 0");
        leaving.clock.advance(20_000);
        expect(leaving.fake.stops).toBe(0);
        expect(logged).toEqual(["started for its models.", "ended by itself once asked its models."]);

        // Still there after the grace: stopped then, not before.
        logged.length = 0;
        const staying = ends();
        expect(await staying.models).toHaveLength(5);
        staying.clock.advance(9999);
        expect(staying.fake.stops).toBe(0);
        staying.clock.advance(1);
        expect(staying.fake.stops).toBe(1);
        expect(logged).toEqual(["started for its models.", "was stopped 10 s after it gave its models."]);
    });

    it("let go a program that did not answer in time too, never stopped at once, and say in the log, without what it printed, how each one went", async () => {
        const logged: string[] = [];
        const fake = fakeHost([{ dir: "in", msg: ask }]);
        const clock = manualClock();
        const models = claudeModels({ folder: "/players/test", program: { command: "claude-program", args: [] }, environment: {}, start: fake.start, later: clock.later, log: (line) => logged.push(line) });
        clock.advance(10_000);
        expect(await models).toEqual([]);
        expect(fake.inputClosed).toBe(true);
        expect(fake.stops).toBe(0);
        clock.advance(9_999);
        expect(fake.stops).toBe(0);
        clock.advance(1);
        expect(fake.stops).toBe(1);
        clock.advance(60_000);
        expect(fake.stops).toBe(1);

        const ended = fakeHost([{ dir: "in", msg: ask }]);
        const lost = claudeModels({ folder: "/players/test", program: { command: "claude-program", args: [] }, environment: {}, start: ended.start, later: clock.later, log: (line) => logged.push(line) });
        ended.end("exit code 1");
        await lost;

        const start = (): never => {
            throw new Error("spawn ENOENT");
        };

        await claudeModels({ folder: "/players/test", program: { command: "nowhere", args: [] }, environment: {}, start, later: clock.later, log: (line) => logged.push(line) });
        expect(logged).toEqual([
            "started for its models.",
            "was stopped: it did not give its models within 10 s, nor ended in 10 s more.",
            "started for its models.",
            "ended before it gave its models (exit code 1).",
            "could not start for its models: spawn ENOENT.",
        ]);
    });

    it("are none, with no wait left, where the program cannot start", async () => {
        const clock = manualClock();

        const start = (): never => {
            throw new Error("spawn ENOENT");
        };

        expect(await claudeModels({ folder: "/player", program: { command: "nowhere", args: [] }, environment: {}, start, later: clock.later })).toEqual([]);
    });

    it("are what Claude Code's driver asks", () => {
        expect(hostDriver("claudeCode")?.models).toBe(claudeModels);
    });
});

describe("the keeper of the models", () => {
    const opus = [{ id: "opus", name: "Opus 5.5", efforts }];
    const sonnet = [{ id: "sonnet", name: "Sonnet 5.5", efforts: [] }];

    /** A keeper whose asks the test answers by hand, on a clock it moves. */
    function keeping(): { keeper: ReturnType<typeof modelKeeper>; asks: { host: HostId; answer(models: HostModel[] | Error): Promise<void>; }[]; changes: () => number; move(ms: number): void; }
    {
        let time = 0;
        let changes = 0;
        const asks: { host: HostId; answer(models: HostModel[] | Error): Promise<void>; }[] = [];
        const keeper = modelKeeper({
            ask: (host) =>
                new Promise((resolve, reject) => {
                    asks.push({
                        host,
                        answer: async (models) => {
                            if (models instanceof Error) {
                                reject(models);
                            } else {
                                resolve(models);
                            }

                            await new Promise((done) => setImmediate(done));
                        },
                    });
                }),
            changed: () => changes++,
            now: () => time,
        });
        return { keeper, asks, changes: () => changes, move: (ms) => (time += ms) };
    }

    it("asks a host once at a time, and tells when its list arrives", async () => {
        const { keeper, asks, changes } = keeping();
        expect(keeper.models("claudeCode")).toEqual([]);
        expect(keeper.models("claudeCode")).toEqual([]);
        expect(asks.map((one) => one.host)).toEqual(["claudeCode"]);
        await asks[0]!.answer(opus);
        expect(changes()).toBe(1);
        expect(keeper.models("claudeCode")).toEqual(opus);
        expect(keeper.known("codex")).toEqual([]);
        expect(asks).toHaveLength(1);
    });

    it("keeps a list ten minutes, then asks again when shown, and tells only when it changed", async () => {
        const { keeper, asks, changes, move } = keeping();
        keeper.models("claudeCode");
        await asks[0]!.answer(opus);
        move(10 * 60_000 - 1);
        keeper.models("claudeCode");
        expect(asks).toHaveLength(1);
        move(1);
        expect(keeper.known("claudeCode")).toEqual(opus);
        expect(asks).toHaveLength(1);
        expect(keeper.models("claudeCode")).toEqual(opus);
        expect(asks).toHaveLength(2);
        await asks[1]!.answer(opus);
        expect(changes()).toBe(1);
        move(10 * 60_000);
        keeper.models("claudeCode");
        await asks[2]!.answer(sonnet);
        expect(changes()).toBe(2);
        expect(keeper.known("claudeCode")).toEqual(sonnet);
    });

    it("keeps the last list known when an ask fails or lists nothing, and asks again a minute later, never ten", async () => {
        const { keeper, asks, changes, move } = keeping();
        keeper.models("claudeCode");
        await asks[0]!.answer(opus);
        move(10 * 60_000);
        keeper.models("claudeCode");
        await asks[1]!.answer(new Error("the host failed"));
        expect(keeper.models("claudeCode")).toEqual(opus);
        expect(asks).toHaveLength(2);
        move(60_000 - 1);
        keeper.models("claudeCode");
        expect(asks).toHaveLength(2);
        move(1);
        keeper.models("claudeCode");
        await asks[2]!.answer([]);
        expect(keeper.known("claudeCode")).toEqual(opus);
        expect(changes()).toBe(1);
        move(60_000);
        keeper.models("claudeCode");
        expect(asks).toHaveLength(4);
    });

    it("asks a host again at once once its account changed, as after the player signed in; an answer from before the change does not stand", async () => {
        const { keeper, asks, move } = keeping();
        keeper.models("claudeCode");
        await asks[0]!.answer([]);
        keeper.forget("claudeCode");
        expect(keeper.models("claudeCode")).toEqual([]);
        expect(asks).toHaveLength(2);
        await asks[1]!.answer(opus);
        expect(keeper.models("claudeCode")).toEqual(opus);
        expect(asks).toHaveLength(2);

        // Forgotten while asked: the answer is kept, and the next look asks again.
        move(10 * 60_000);
        keeper.models("claudeCode");
        keeper.forget("claudeCode");
        keeper.models("claudeCode");
        expect(asks).toHaveLength(3);
        await asks[2]!.answer(opus);
        keeper.models("claudeCode");
        expect(asks).toHaveLength(4);
    });

    it("takes an ask that throws at once for one that failed", async () => {
        let asked = 0;
        const keeper = modelKeeper({
            ask: () => {
                asked++;
                throw new Error("no driver");
            },
            changed: () => expect.fail("nothing arrived"),
            now: () => 0,
        });
        expect(keeper.models("claudeCode")).toEqual([]);
        await new Promise((resolve) => setImmediate(resolve));
        expect(keeper.models("claudeCode")).toEqual([]);
        expect(asked).toBe(1);
    });
});

describe("the hosts the page offers", () => {
    const driver: HostDriver = {
        open: () => expect.fail("no chat opens"),
        missing: () => undefined,
        program: () => undefined,
        environment: (given) => given,
        models: () => expect.fail("hostsOffered asks no host itself"),
        model: "sonnet",
        efforts: ["low", "high"],
    };
    const models = [{ id: "opus", name: "Opus 5.5", efforts: ["low"] }];

    it("are every host of the registry in its order, ready where a driver is, found where its program is too, with the models known of a host found", () => {
        const looked: HostId[] = [];
        const shown: HostId[] = [];
        const offered = hostsOffered(
            (host) => {
                looked.push(host);
                return true;
            },
            (host) => (host === "claudeCode" || host === "antigravity" ? driver : undefined),
            (host) => {
                shown.push(host);
                return models;
            },
        );
        const none = { ready: false, found: false, model: "", efforts: [], models: [] };

        expect(offered).toEqual([
            { id: "claudeCode", name: "Claude Code", ready: true, found: true, model: "sonnet", efforts: ["low", "high"], models },
            { id: "codex", name: "Codex", ...none },
            { id: "antigravity", name: "Antigravity", ready: true, found: true, model: "sonnet", efforts: ["low", "high"], models },
            { id: "openCode", name: "OpenCode", ...none },
        ]);
        expect(looked).toEqual(["claudeCode", "antigravity"]);
        expect(shown).toEqual(["claudeCode", "antigravity"]);
    });

    it("ask no models of a host whose program is not found, and offer every host with today's drivers", () => {
        const offered = hostsOffered(() => false, undefined, () => expect.fail("no models of a host not found"));
        expect(offered.map((host) => [host.id, host.ready, host.found, host.models])).toEqual([
            ["claudeCode", true, false, []],
            ["codex", true, false, []],
            ["antigravity", true, false, []],
            ["openCode", true, false, []],
        ]);
    });
});
