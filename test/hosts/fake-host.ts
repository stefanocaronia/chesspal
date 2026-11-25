// A fake Claude Code for a chat's driver: it plays a recorded flow, stopping at each line the client wrote until the driver writes its own.
import { readFileSync } from "node:fs";
import type { HostChat, HostEvent } from "../../src/hosts/index.ts";
import type { LineProcess, startLineProcess } from "../../src/hosts/process.ts";

type Message = Record<string, unknown>;

/** A line of a flow: what the client wrote (`in`) or the host wrote (`out`); `raw` is a line written as it is, JSON or not. */
export interface FlowEntry
{
    t?: number;
    dir: "in" | "out";
    msg: Message;
    raw?: string;
}

export interface FakeHost
{
    start: typeof startLineProcess;
    /** Every line the driver wrote, parsed. */
    written: Message[];
    /** What the driver did that the flow does not hold. */
    problems: string[];
    started?: { command: string; args: string[]; options: Parameters<typeof startLineProcess>[2]; };
    stopped: boolean;
    /** How many times the driver stopped the process. */
    stops: number;
    /** Ends the process, as its exit would. */
    end(reason: string): void;
    /** A line on the process's stderr, for a driver that reads them. */
    complain(line: string): void;
    /** Whether every line of the flow was played. */
    done(): boolean;
}

export interface FakeOptions
{
    /** The model the host names for each asked; by default haiku's. */
    models?: Record<string, string>;
    /** Requests the host never answers. */
    ignore?: ("set_model" | "interrupt")[];
}

// How many of the host's lines it writes in a tick, so that the driver reads them as a stream.
const linesPerTick = 3;

/** Plays a flow as the host's process. */
export function fakeHost(flow: FlowEntry[], options: FakeOptions = {}): FakeHost
{
    const entries = [...flow];
    const modelAnswers = takeModelAnswers(entries);
    const models = options.models ?? { haiku: "claude-haiku-5-5" };
    let position = 0;
    let scheduled = false;
    // A model asked and not answered yet: the player's words must wait for its answer.
    let modelPending = false;
    const modelAnswer = new Set<FlowEntry>();
    let lineListener: ((line: string) => void) | undefined;
    let endListener: ((reason: string) => void) | undefined;

    const play = (): void => {
        scheduled = false;

        for (let count = 0; count < linesPerTick && !fake.stopped && entries[position]?.dir === "out"; count++) {
            const entry = entries[position++]!;

            if (modelAnswer.has(entry)) {
                modelPending = false;
            }

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

    const answerModel = (message: Message): void => {
        const entry: FlowEntry = { dir: "out", msg: message };
        modelAnswer.add(entry);
        entries.splice(position, 0, entry);
        schedule();
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
        const request = message.request as Message | undefined;

        if (isModelRequest(message)) {
            modelPending = true;
        }

        if (message.type === "control_request" && options.ignore?.includes(request?.subtype as "set_model") === true) {
            return;
        }

        if (message.type === "control_request" && request?.subtype === "set_model") {
            const model = String(request.model);
            const recorded = modelAnswers.shift() ?? { type: "control_response", response: { subtype: "success", request_id: "", response: { model: models[model] ?? model } } };
            answerModel(withRequest(recorded, message.request_id));
        } else if (message.type === "control_request" && request?.subtype === "interrupt") {
            interrupted(message.request_id);
        } else {
            matchClientLine(message);
        }
    };

    /** Skips the flow to the recorded interrupt and its answer; with none recorded, answers it and ends the turn as the host does. */
    const interrupted = (id: unknown): void => {
        const recorded = entries.findIndex((entry, index) => index >= position && entry.dir === "in" && entry.msg.type === "control_request" && (entry.msg.request as Message | undefined)?.subtype === "interrupt");

        if (recorded >= 0) {
            const recordedId = entries[recorded]!.msg.request_id;
            entries.splice(position, recorded + 1 - position);
            const reply = entries.findIndex((entry, index) => index >= position && entry.dir === "out" && entry.msg.type === "control_response" && (entry.msg.response as Message).request_id === recordedId);

            if (reply >= 0) {
                entries[reply] = { dir: "out", msg: withRequest(entries[reply]!.msg, id) };
            }
        } else {
            const next = entries.findIndex((entry, index) => index >= position && entry.dir === "in" && entry.msg.type === "user");
            entries.splice(position, (next < 0 ? entries.length : next) - position, { dir: "out", msg: { type: "control_response", response: { subtype: "success", request_id: id, response: {} } } }, {
                dir: "out",
                msg: { type: "result", subtype: "error_during_execution", is_error: true },
            });
        }

        schedule();
    };

    /** The player's words or an answer to the host: the next line the client wrote in the flow must be the same. */
    const matchClientLine = (message: Message): void => {
        const next = entries.findIndex((entry, index) => index >= position && entry.dir === "in");
        const expected = next < 0 ? undefined : entries[next]!.msg;

        if (message.type === "user" && modelPending) {
            fake.problems.push("the player's words were written before the host confirmed the model");
        }

        if (expected === undefined || expected.type !== message.type) {
            fake.problems.push(`unexpected line: ${JSON.stringify(message)}`);
            return;
        }

        if (message.type === "user" && wordsOf(message) !== wordsOf(expected)) {
            fake.problems.push(`other words: ${JSON.stringify(wordsOf(message))} instead of ${JSON.stringify(wordsOf(expected))}`);
        }

        if (message.type === "control_response" && (message.response as Message).request_id !== (expected.response as Message).request_id) {
            fake.problems.push(`an answer to another request: ${JSON.stringify(message)}`);
        }

        entries.splice(next, 1);
        schedule();
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

/** A recorded flow of test/hosts/flows, such as "claude-code/denied". */
export function loadFlow(name: string): FlowEntry[]
{
    const text = readFileSync(new URL(`flows/${name}.jsonl`, import.meta.url), "utf8");
    return text.split("\n").filter((line) => line.trim() !== "").map((line) => JSON.parse(line) as FlowEntry);
}

/** The player's words of a flow, turn by turn. */
export function playerWords(flow: FlowEntry[]): string[]
{
    return flow.filter((entry) => entry.dir === "in" && entry.msg.type === "user").map((entry) => wordsOf(entry.msg));
}

/** The AI's whole texts of a flow, turn by turn: its own messages' text blocks, not a subagent's. */
export function wholeTexts(flow: FlowEntry[]): string[][]
{
    const turns: string[][] = [];

    for (const entry of flow) {
        if (entry.dir === "in" && entry.msg.type === "user") {
            turns.push([]);
        } else if (entry.dir === "out" && entry.msg.type === "assistant" && entry.msg.parent_tool_use_id === null) {
            const blocks = ((entry.msg.message as Message).content as Message[]).filter((block) => block.type === "text").map((block) => String(block.text));
            turns.at(-1)?.push(...blocks);
        }
    }

    return turns;
}

/** The first session a flow's host named. */
export function sessionOf(flow: FlowEntry[]): string | undefined
{
    return flow.map((entry) => entry.msg).find((message) => message.type === "system" && message.subtype === "init")?.session_id as string | undefined;
}

export function isModelRequest(message: unknown): boolean
{
    const request = (message as Message).request as Message | undefined;
    return (message as Message).type === "control_request" && request?.subtype === "set_model";
}

export function isPlayerWords(message: unknown): boolean
{
    return (message as Message).type === "user";
}

/** A clock moved by hand, for the driver's waits. */
export function manualClock(): { later: (ms: number, run: () => void) => () => void; advance(ms: number): void; }
{
    let now = 0;
    const waits: { at: number; run: () => void; cancelled: boolean; }[] = [];
    return {
        later: (ms, run) => {
            const wait = { at: now + ms, run, cancelled: false };
            waits.push(wait);

            return () => {
                wait.cancelled = true;
            };
        },
        advance: (ms) => {
            now += ms;

            for (const wait of waits.filter((each) => !each.cancelled && each.at <= now)) {
                wait.cancelled = true;
                wait.run();
            }
        },
    };
}

/** Every event of a chat, and a wait for a condition over them, in ticks and never in time. */
export function listen(chat: HostChat): { events: HostEvent[]; until(condition: (events: HostEvent[]) => boolean): Promise<void>; }
{
    const events: HostEvent[] = [];
    chat.onEvent((event) => events.push(event));
    return { events, until: (condition) => ticksUntil(() => condition(events)) };
}

/** Waits a tick at a time until the condition holds; fails after many. */
export async function ticksUntil(condition: () => boolean): Promise<void>
{
    for (let tick = 0; tick < 10_000; tick++) {
        if (condition()) {
            return;
        }

        await new Promise((resolve) => setImmediate(resolve));
    }

    throw new Error("the condition never held");
}

/** The ends of turns among events. */
export function turnEnds(events: HostEvent[]): HostEvent[]
{
    return events.filter((event) => event.type === "turnEnd");
}

function takeModelAnswers(entries: FlowEntry[]): Message[]
{
    const answers: Message[] = [];

    for (const request of entries.filter((entry) => entry.dir === "in" && isModelRequest(entry.msg))) {
        const reply = entries.find((entry) => entry.dir === "out" && entry.msg.type === "control_response" && (entry.msg.response as Message).request_id === request.msg.request_id);
        entries.splice(entries.indexOf(request), 1);

        if (reply !== undefined) {
            answers.push(reply.msg);
            entries.splice(entries.indexOf(reply), 1);
        }
    }

    return answers;
}

function withRequest(message: Message, id: unknown): Message
{
    return { ...message, response: { ...(message.response as Message), request_id: id } };
}

function wordsOf(message: Message): string
{
    const content = (message.message as Message | undefined)?.content;
    return Array.isArray(content) ? content.map((part: Message) => String(part.text)).join("") : String(content);
}
