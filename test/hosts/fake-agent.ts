// A fake agent of the Agent Client Protocol for a chat's driver: it plays a recorded flow, stopping at each line the client wrote until the driver
// writes its own. The driver's request ids take the place of the recorded ones; the model and effort it sets are answered as asked, or as the options say.
import type { LineProcess } from "../../src/hosts/process.ts";
import type { FakeHost, FlowEntry } from "./fake-host.ts";

type Message = Record<string, unknown>;

export interface FakeAgentOptions
{
    /** The model the agent says it runs for each asked; by default the one asked. */
    models?: Record<string, string>;
    /** Methods the agent never answers, and those it answers with an error. */
    ignore?: string[];
    failing?: string[];
}

// How many of the agent's lines it writes in a tick, so that the driver reads them as a stream.
const linesPerTick = 3;
// The methods whose answers the fake makes itself, from the recorded ones where the flow has them.
const settings = ["session/set_config_option", "session/set_model"];

/** The fake agent's process: lines it writes after the prompt's answer are played too, with no line of the driver's before them. */
export interface FakeAgent extends FakeHost
{
    /** A line the agent writes by itself now, after the flow played so far, as after a pause. */
    says(message: Message): void;
}

/** Plays a flow as the agent's process. */
export function fakeAgent(flow: FlowEntry[], options: FakeAgentOptions = {}): FakeAgent
{
    const entries = [...flow];
    const recordedSettings = takeSettings(entries);
    let position = 0;
    let scheduled = false;
    // A model asked and not answered yet: the player's words must wait for its answer.
    let modelPending = false;
    let lineListener: ((line: string) => void) | undefined;
    let endListener: ((reason: string) => void) | undefined;

    const play = (): void => {
        scheduled = false;

        for (let count = 0; count < linesPerTick && !fake.stopped && entries[position]?.dir === "out"; count++) {
            const entry = entries[position++]!;

            if (entry.msg.modelAnswer === true) {
                modelPending = false;
                const { modelAnswer: _, ...message } = entry.msg;
                lineListener?.(JSON.stringify(message));
            } else {
                lineListener?.(JSON.stringify(entry.msg));
            }
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

    const say = (message: Message): void => {
        entries.splice(position, 0, { dir: "out", msg: message });
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
        const method = message.method;

        if (typeof method === "string" && options.ignore?.includes(method) === true) {
            return;
        }

        if (typeof method === "string" && message.id !== undefined && options.failing?.includes(method) === true) {
            skipRecorded(method);
            say({ jsonrpc: "2.0", id: message.id, error: { code: -32603, message: `${method} failed` } });
        } else if (typeof method === "string" && settings.includes(method)) {
            answerSetting(message);
        } else if (method === "session/cancel") {
            cancelled();
        } else {
            matchClientLine(message);
        }
    };

    /** A model or an effort set: answered with the recorded answer where there is one, its option's value as the options say. */
    const answerSetting = (message: Message): void => {
        const params = message.params as Message;
        const model = params.configId === "model" || message.method === "session/set_model";
        const value = String(params.value ?? params.modelId);
        const current = model ? options.models?.[value] ?? value : value;
        const recorded = recordedSettings.shift();
        const listed = ((recorded?.result as Message | undefined)?.configOptions as Message[] | undefined) ?? [{ id: params.configId, category: model ? "model" : "thought_level", currentValue: value }];
        const configOptions = listed.map((option) => (option.id === params.configId ? { ...option, currentValue: current } : option));
        modelPending ||= model;
        say({ jsonrpc: "2.0", id: message.id, result: message.method === "session/set_model" ? {} : { configOptions }, modelAnswer: model });
    };

    /** A cancel: what the agent had left to say of the turn is dropped, and the prompt's answer says it was cancelled. */
    const cancelled = (): void => {
        const answer = entries.findIndex((entry, index) => index >= position && entry.dir === "out" && isObject(entry.msg.result) && entry.msg.result.stopReason !== undefined);

        if (answer < 0) {
            fake.problems.push("a cancel with no turn running");
            return;
        }

        const kept = entries[answer]!;
        entries.splice(position, answer + 1 - position, { dir: "out", msg: { ...kept.msg, result: { stopReason: "cancelled" } } });
        schedule();
    };

    /** A request or an answer of the client: the next line the client wrote in the flow must be the same; a request's id takes the recorded one's place. */
    const matchClientLine = (message: Message): void => {
        const next = entries.findIndex((entry, index) => index >= position && entry.dir === "in");
        const expected = next < 0 ? undefined : entries[next]!.msg;

        if (message.method === "session/prompt" && modelPending) {
            fake.problems.push("the player's words were written before the agent confirmed the model");
        }

        if (expected === undefined || expected.method !== message.method) {
            fake.problems.push(`unexpected line: ${JSON.stringify(message).slice(0, 300)}`);
            return;
        }

        if (message.method === "session/prompt" && wordsOf(message) !== wordsOf(expected)) {
            fake.problems.push(`other words: ${JSON.stringify(wordsOf(message))} instead of ${JSON.stringify(wordsOf(expected))}`);
        }

        if (message.method === undefined && JSON.stringify(message) !== JSON.stringify(expected)) {
            fake.problems.push(`another answer: ${JSON.stringify(message)} instead of ${JSON.stringify(expected)}`);
        }

        entries.splice(next, 1);

        if (message.method !== undefined) {
            renumber(expected.id, message.id, next);
        }

        schedule();
    };

    /** The agent's answer to a recorded request gets the id the driver gave it. */
    const renumber = (recorded: unknown, actual: unknown, from: number): void => {
        const answer = entries.findIndex((entry, index) => index >= from && entry.dir === "out" && entry.msg.method === undefined && entry.msg.id === recorded);

        if (answer >= 0) {
            entries[answer] = { ...entries[answer]!, msg: { ...entries[answer]!.msg, id: actual } };
        }
    };

    /** Drops a recorded request of that method and its answer, for one the fake answers itself. */
    const skipRecorded = (method: string): void => {
        const request = entries.findIndex((entry, index) => index >= position && entry.dir === "in" && entry.msg.method === method);

        if (request >= 0) {
            const id = entries[request]!.msg.id;
            entries.splice(request, 1);
            const answer = entries.findIndex((entry, index) => index >= request && entry.dir === "out" && entry.msg.method === undefined && entry.msg.id === id);

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
        stop: () => {
            fake.stops += 1;
            fake.stopped = true;
        },
    };
    const fake: FakeAgent = {
        says: say,
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

/** The player's words of a flow, turn by turn. */
export function promptWords(flow: FlowEntry[]): string[]
{
    return flow.filter((entry) => entry.dir === "in" && entry.msg.method === "session/prompt").map((entry) => wordsOf(entry.msg));
}

/** The AI's whole texts of a flow, turn by turn: the pieces of each message joined, from the turn's prompt on. */
export function joinedTexts(flow: FlowEntry[]): string[][]
{
    const turns: { ids: string[]; texts: Map<string, string>; }[] = [];

    for (const entry of flow) {
        const update = (entry.msg.params as Message | undefined)?.update as Message | undefined;

        if (entry.dir === "in" && entry.msg.method === "session/prompt") {
            turns.push({ ids: [], texts: new Map() });
        } else if (entry.dir === "out" && update?.sessionUpdate === "agent_message_chunk" && turns.length > 0) {
            const turn = turns[turns.length - 1]!;
            const id = String(update.messageId);

            if (!turn.texts.has(id)) {
                turn.ids.push(id);
            }

            turn.texts.set(id, (turn.texts.get(id) ?? "") + String((update.content as Message).text));
        }
    }

    return turns.map((turn) => turn.ids.map((id) => turn.texts.get(id) ?? ""));
}

/** The session a flow's agent opened or loaded. */
export function sessionOfFlow(flow: FlowEntry[]): string | undefined
{
    const loaded = flow.find((entry) => entry.msg.method === "session/load")?.msg.params as Message | undefined;
    return (loaded?.sessionId as string | undefined) ?? flow.map((entry) => entry.msg.result as Message | undefined).find((result) => typeof result?.sessionId === "string")?.sessionId as string | undefined;
}

export function isModelSetting(message: unknown): boolean
{
    const params = (message as Message).params as Message | undefined;
    return ((message as Message).method === "session/set_config_option" && params?.configId === "model") || (message as Message).method === "session/set_model";
}

export function isPrompt(message: unknown): boolean
{
    return (message as Message).method === "session/prompt";
}

/** Takes the recorded settings and their answers out of the flow: the fake answers each as the driver asks. */
function takeSettings(entries: FlowEntry[]): Message[]
{
    const answers: Message[] = [];

    for (const request of entries.filter((entry) => entry.dir === "in" && settings.includes(String(entry.msg.method)))) {
        const reply = entries.find((entry) => entry.dir === "out" && entry.msg.method === undefined && entry.msg.id === request.msg.id && entries.indexOf(entry) > entries.indexOf(request));
        entries.splice(entries.indexOf(request), 1);

        if (reply !== undefined) {
            answers.push(reply.msg);
            entries.splice(entries.indexOf(reply), 1);
        }
    }

    return answers;
}

function wordsOf(message: Message): string
{
    const prompt = (message.params as Message | undefined)?.prompt;
    return Array.isArray(prompt) ? prompt.map((part: Message) => String(part.text)).join("") : "";
}

function isObject(value: unknown): value is Message
{
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
