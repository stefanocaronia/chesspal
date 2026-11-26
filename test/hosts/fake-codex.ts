// A fake Codex app-server for a chat's driver: it plays a recorded flow, stopping at each line the client wrote until the driver writes its own.
// The driver's request ids take the place of the recorded ones; the thread it opens or takes up runs the model and effort asked, or as the options say.
import type { LineProcess } from "../../src/hosts/process.ts";
import type { FakeHost, FlowEntry } from "./fake-host.ts";

type Message = Record<string, unknown>;

export interface FakeCodexOptions
{
    /** The model and the effort the thread says it runs for each asked; by default the one asked. */
    models?: Record<string, string>;
    efforts?: Record<string, string>;
    /** Methods Codex never answers, and those it answers with an error. */
    ignore?: string[];
    failing?: string[];
    /** The MCP servers config/read names in the chat's folder, under config.mcp_servers; chesspal alone by default. */
    servers?: Record<string, unknown>;
}

// How many of Codex's lines it writes in a tick, so that the driver reads them as a stream.
const linesPerTick = 3;
const threadMethods = ["thread/start", "thread/resume"];

/** Plays a flow as Codex's process. */
export function fakeCodex(flow: FlowEntry[], options: FakeCodexOptions = {}): FakeHost
{
    const entries = [...flow];
    const recordedThread = takeThreadAnswer(entries);
    let position = 0;
    let scheduled = false;
    // A thread asked and not answered yet: the player's words must wait for its answer.
    let threadPending = false;
    const threadAnswers = new Set<FlowEntry>();
    let lineListener: ((line: string) => void) | undefined;
    let endListener: ((reason: string) => void) | undefined;

    const play = (): void => {
        scheduled = false;

        for (let count = 0; count < linesPerTick && !fake.stopped && entries[position]?.dir === "out"; count++) {
            const entry = entries[position++]!;
            threadPending &&= !threadAnswers.has(entry);
            lineListener?.(entry.raw ?? JSON.stringify(entry.msg));
        }

        if (!fake.stopped && entries[position]?.dir === "out") {
            schedule();
        }
    };

    const schedule = (): void => {
        if (!scheduled) {
            scheduled = true;
            setImmediate(play);
        }
    };

    const say = (message: Message): FlowEntry => {
        const entry: FlowEntry = { dir: "out", msg: message };
        entries.splice(position, 0, entry);
        schedule();
        return entry;
    };

    const write = (line: string): void => {
        let message: Message;

        try {
            message = JSON.parse(line) as Message;
        } catch {
            fake.problems.push(`not JSON: ${line}`);
            return;
        }

        fake.written.push(message);
        const method = message.method;

        if (typeof method === "string" && options.ignore?.includes(method) === true) {
            return;
        }

        if (typeof method === "string" && message.id !== undefined && options.failing?.includes(method) === true) {
            skipRecorded(method);
            say({ id: message.id, error: { code: -32603, message: `${method} failed` } });
        } else if (typeof method === "string" && threadMethods.includes(method)) {
            answerThread(message);
        } else if (method === "turn/interrupt") {
            interrupted(message);
        } else if (method === "config/read") {
            say({ id: message.id, result: { config: { mcp_servers: options.servers ?? { chesspal: { command: "chesspal", args: ["mcp"] } } } } });
        } else {
            matchClientLine(message);
        }
    };

    /** A thread opened or taken up: the recorded answer, its thread the one asked to take up, its model and effort as asked or as the options say. */
    const answerThread = (message: Message): void => {
        const params = message.params as Message;
        const model = String(params.model);
        const effort = ((params.config ?? {}) as Message).model_reasoning_effort as string | undefined;
        const template = recordedThread ?? { thread: { id: "00000000-0000-0000-0000-000000000001" }, reasoningEffort: null };
        const thread = { ...(template.thread as Message), ...(typeof params.threadId === "string" ? { id: params.threadId } : {}) };
        const reasoningEffort = effort === undefined ? template.reasoningEffort : options.efforts?.[effort] ?? effort;
        threadPending = true;
        threadAnswers.add(say({ id: message.id, result: { ...template, thread, model: options.models?.[model] ?? model, reasoningEffort } }));
    };

    /** An interrupt: what Codex had left to say of the turn is dropped, and the turn completes interrupted. */
    const interrupted = (message: Message): void => {
        const completed = entries.findIndex((entry, index) => index >= position && entry.dir === "out" && entry.msg.method === "turn/completed");

        if (completed < 0) {
            fake.problems.push("an interrupt with no turn running");
            return;
        }

        const params = entries[completed]!.msg.params as Message;
        const turn = { ...(params.turn as Message), status: "interrupted" };
        entries.splice(position, completed + 1 - position, { dir: "out", msg: { id: message.id, result: {} } }, { dir: "out", msg: { method: "turn/completed", params: { ...params, turn } } });
        schedule();
    };

    /** A request, a notification or an answer of the client: the next line the client wrote in the flow must be the same; a request's id takes the recorded one's place. */
    const matchClientLine = (message: Message): void => {
        const next = entries.findIndex((entry, index) => index >= position && entry.dir === "in");
        const expected = next < 0 ? undefined : entries[next]!.msg;

        if (message.method === "turn/start" && threadPending) {
            fake.problems.push("the player's words were written before Codex confirmed the thread's model");
        }

        if (expected === undefined || expected.method !== message.method) {
            fake.problems.push(`unexpected line: ${JSON.stringify(message).slice(0, 300)}`);
            return;
        }

        if (message.method === "turn/start" && wordsOf(message) !== wordsOf(expected)) {
            fake.problems.push(`other words: ${JSON.stringify(wordsOf(message))} instead of ${JSON.stringify(wordsOf(expected))}`);
        }

        if (message.method === undefined && JSON.stringify(message) !== JSON.stringify(expected)) {
            fake.problems.push(`another answer: ${JSON.stringify(message)} instead of ${JSON.stringify(expected)}`);
        }

        entries.splice(next, 1);

        if (message.method !== undefined && message.id !== undefined) {
            renumber(expected.id, message.id, next);
        }

        schedule();
    };

    /** Codex's answer to a recorded request gets the id the driver gave it. */
    const renumber = (recorded: unknown, actual: unknown, from: number): void => {
        const answer = entries.findIndex((entry, index) => index >= from && entry.dir === "out" && entry.msg.method === undefined && entry.msg.id === recorded);

        if (answer >= 0) {
            entries[answer] = { ...entries[answer]!, msg: { ...entries[answer]!.msg, id: actual } };
        }
    };

    /** Drops a recorded request of that method and its answer, for one the fake answers itself. */
    const skipRecorded = (method: string): void => {
        const asked = entries.findIndex((entry, index) => index >= position && entry.dir === "in" && entry.msg.method === method);

        if (asked >= 0) {
            const id = entries[asked]!.msg.id;
            entries.splice(asked, 1);
            const answer = entries.findIndex((entry, index) => index >= asked && entry.dir === "out" && entry.msg.method === undefined && entry.msg.id === id);

            if (answer >= 0) {
                entries.splice(answer, 1);
            }
        }
    };

    const process: LineProcess = {
        pid: undefined,
        write: (line) => {
            if (!fake.stopped) {
                write(line);
            }
        },
        onLine: (listener) => {
            lineListener = listener;
            schedule();
        },
        onEnd: (listener) => {
            endListener = listener;
        },
        closeInput: () => {
            fake.inputClosed = true;
        },
        stop: () => {
            fake.stops += 1;
            fake.stopped = true;
        },
    };
    const fake: FakeHost = {
        start: (command, args, startOptions) => {
            fake.started = { command, args, options: startOptions };
            return process;
        },
        written: [],
        problems: [],
        stopped: false,
        stops: 0,
        inputClosed: false,
        end: (reason) => {
            if (!fake.stopped) {
                fake.stopped = true;
                endListener?.(reason);
            }
        },
        complain: (line) => fake.started?.options.errors?.(line),
        done: () => position >= entries.length,
    };
    return fake;
}

/** The player's words of a flow, turn by turn. */
export function turnWords(flow: FlowEntry[]): string[]
{
    return flow.filter((entry) => entry.dir === "in" && entry.msg.method === "turn/start").map((entry) => wordsOf(entry.msg));
}

/** The AI's whole texts of a flow, turn by turn: the pieces of each message joined, from the turn's words on. */
export function deltaTexts(flow: FlowEntry[]): string[][]
{
    const turns: Map<string, string>[] = [];

    for (const entry of flow) {
        const params = entry.msg.params as Message | undefined;

        if (entry.dir === "in" && entry.msg.method === "turn/start") {
            turns.push(new Map());
        } else if (entry.dir === "out" && entry.msg.method === "item/agentMessage/delta" && params !== undefined) {
            const texts = turns.at(-1);
            texts?.set(String(params.itemId), (texts.get(String(params.itemId)) ?? "") + String(params.delta));
        }
    }

    return turns.map((texts) => [...texts.values()]);
}

/** The thread a flow's Codex opened or took up. */
export function threadOfFlow(flow: FlowEntry[]): string | undefined
{
    const result = flow.map((entry) => entry.msg.result as Message | undefined).find((one) => typeof (one?.thread as Message | undefined)?.id === "string");
    return (result?.thread as Message | undefined)?.id as string | undefined;
}

export function isThreadRequest(message: unknown): boolean
{
    return threadMethods.includes(String((message as Message).method));
}

export function isTurnStart(message: unknown): boolean
{
    return (message as Message).method === "turn/start";
}

/** Takes the recorded thread request and its answer out of the flow: the fake answers the driver's own from it. */
function takeThreadAnswer(entries: FlowEntry[]): Message | undefined
{
    const asked = entries.find((entry) => entry.dir === "in" && threadMethods.includes(String(entry.msg.method)));

    if (asked === undefined) {
        return undefined;
    }

    const reply = entries.find((entry, index) => index > entries.indexOf(asked) && entry.dir === "out" && entry.msg.method === undefined && entry.msg.id === asked.msg.id);
    entries.splice(entries.indexOf(asked), 1);

    if (reply === undefined) {
        return undefined;
    }

    entries.splice(entries.indexOf(reply), 1);
    return reply.msg.result as Message;
}

function wordsOf(message: Message): string
{
    const input = (message.params as Message | undefined)?.input;
    return Array.isArray(input) ? input.map((part: Message) => String(part.text)).join("") : "";
}
