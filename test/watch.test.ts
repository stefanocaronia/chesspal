import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type EventHandlers, type Events, readTries, readTryWait, reconnectWait, type Served, watchServed } from "../src/page/app/watch.ts";

describe("the page's watch on the server's game", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("reads the game when the events connect, and again at each change", async () => {
        const page = watched([{ version: "1" }, { version: "1", error: undefined }]);
        page.stream().connected();
        await settle();
        page.stream().message("changed");
        await settle();
        expect(page.reads).toBe(2);
        expect(page.said.read).toHaveLength(2);
    });

    it("tries a read lost on the way again while the server is there, and shows no error once one answers", async () => {
        const page = watched([lost, lost, { version: "1" }]);
        page.stream().connected();
        await settle();
        await vi.advanceTimersByTimeAsync(readTryWait * 2);
        expect(page.reads).toBe(3);
        expect(page.said.problem.filter((problem) => problem !== undefined)).toEqual([]);
        expect(page.said.read).toHaveLength(1);
    });

    it("shows the error after its tries when no game is shown yet", async () => {
        const page = watched(losses(readTries + 1));
        page.stream().connected();
        await settle();
        await vi.advanceTimersByTimeAsync(readTryWait * readTries);
        expect(page.reads).toBe(readTries + 1);
        expect(page.said.problem.at(-1)).toContain("Failed to fetch");
    });

    it("leaves a game shown on the page, offline, when its reads keep failing", async () => {
        const page = watched([{ version: "1" }, ...losses(readTries + 1)]);
        page.stream().connected();
        await settle();
        page.stream().message("changed");
        await settle();
        await vi.advanceTimersByTimeAsync(readTryWait * readTries);
        expect(page.said.problem.filter((problem) => problem !== undefined)).toEqual([]);
        expect(page.said.offline.at(-1)).toBe(true);
    });

    it("starts its tries again at each new read, after a series that ran out", async () => {
        const page = watched([...losses(readTries + 1), lost, { version: "1" }]);
        page.stream().connected();
        await settle();
        await vi.advanceTimersByTimeAsync(readTryWait * readTries);
        page.stream().message("changed");
        await settle();
        await vi.advanceTimersByTimeAsync(readTryWait);
        expect(page.said.read).toHaveLength(1);
        expect(page.said.problem.at(-1)).toBeUndefined();
    });

    it("waits for the server instead of showing the error when a read fails with the events gone", async () => {
        const page = watched([lost]);
        page.stream().state = connecting;
        page.reload();
        await settle();
        expect(page.said.offline.at(-1)).toBe(true);
        expect(page.said.problem).toEqual([]);
        await vi.advanceTimersByTimeAsync(readTryWait * readTries);
        expect(page.reads).toBe(1);
    });

    it("ignores a failed read that a newer one has overtaken", async () => {
        let failLate: (error: Error) => void = () => {};

        const page = watched([
            new Promise<Served>((_resolve, reject) => {
                failLate = reject;
            }),
            { version: "1" },
        ]);
        page.stream().connected();
        page.stream().message("changed");
        await settle();
        failLate(new TypeError("Failed to fetch"));
        await settle();
        expect(page.said.problem).toEqual([undefined]);
        expect(page.reads).toBe(2);
    });

    it("connects again a little later when the browser gives the events up for good", async () => {
        const page = watched([{ version: "1" }]);
        page.stream().state = closed;
        page.stream().failed();
        expect(page.said.offline.at(-1)).toBe(true);
        await vi.advanceTimersByTimeAsync(reconnectWait);
        expect(page.streams).toHaveLength(2);
        page.stream().connected();
        await settle();
        expect(page.said.offline.at(-1)).toBe(false);
        expect(page.said.read).toHaveLength(1);
    });

    it("asks for a new game, and reloads for a server of another version", async () => {
        const page = watched([{ version: "1" }, { version: "2" }]);
        page.stream().connected();
        await settle();
        page.stream().message("new-game");
        page.stream().message("changed");
        await settle();
        expect(page.said.newGame).toBe(1);
        expect(page.said.otherVersion).toBe(1);
    });

    it("stops: closes the events and leaves no timer behind", async () => {
        const page = watched([lost]);
        page.stream().connected();
        await settle();
        page.stop();
        expect(page.stream().closedByPage).toBe(true);
        expect(vi.getTimerCount()).toBe(0);
    });
});

const connecting = 0;
const open = 1;
const closed = 2;

/** A read that fails on the way, as fetch does when the server drops the connection. */
const lost = "lost";

type Answer = Served | Promise<Served> | typeof lost;

/** Reads that all fail on the way. */
function losses(count: number): Answer[]
{
    return Array.from({ length: count }, (): Answer => lost);
}

/** A fake stream of events, which the test opens, fails and posts to. */
class FakeStream implements Events
{
    state = connecting;
    closedByPage = false;
    private readonly handlers: EventHandlers;

    constructor(handlers: EventHandlers)
    {
        this.handlers = handlers;
    }

    get readyState(): number
    {
        return this.state;
    }

    connected(): void
    {
        this.state = open;
        this.handlers.open();
    }

    message(data: string): void
    {
        this.handlers.message(data);
    }

    failed(): void
    {
        this.handlers.error();
    }

    close(): void
    {
        this.closedByPage = true;
        this.state = closed;
    }
}

/** A watch on fake reads, answered in order, and a fake stream, with all it told the page. */
function watched(answers: Answer[])
{
    const streams: FakeStream[] = [];
    const said = { read: [] as Served[], problem: [] as (string | undefined)[], offline: [] as boolean[], newGame: 0, otherVersion: 0 };
    let reads = 0;
    const watch = watchServed<Served>({
        read: () => {
            const answer = answers[reads++] ?? lost;
            return answer === lost ? Promise.reject(new TypeError("Failed to fetch")) : Promise.resolve(answer);
        },
        connect: (handlers) => {
            const stream = new FakeStream(handlers);
            streams.push(stream);
            return stream;
        },
        later: (run, wait) => setTimeout(run, wait) as unknown as number,
        cancel: (timer) => clearTimeout(timer),
    }, {
        read: (body) => said.read.push(body),
        problem: (problem) => said.problem.push(problem),
        offline: (offline) => said.offline.push(offline),
        newGame: () => said.newGame++,
        otherVersion: () => said.otherVersion++,
    });
    return {
        said,
        streams,
        get reads()
        {
            return reads;
        },
        stream: () => streams.at(-1)!,
        reload: watch.reload,
        stop: watch.stop,
    };
}

/** Lets the reads' promises answer. */
async function settle(): Promise<void>
{
    await vi.advanceTimersByTimeAsync(0);
}
