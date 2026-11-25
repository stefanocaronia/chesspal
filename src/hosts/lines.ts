// A host's lines, one JSON object each way, as every driver reads them; and JSON-RPC 2.0's messages, as Codex and the agents of the Agent Client Protocol speak it.

export type Message = Record<string, unknown>;

export function isObject(value: unknown): value is Message
{
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A line of the host as an object; undefined for one that is no JSON object. */
export function parsedLine(line: string): Message | undefined
{
    try {
        const message: unknown = JSON.parse(line);
        return isObject(message) ? message : undefined;
    } catch {
        return undefined;
    }
}

export function request(id: number, method: string, params: Message): Message
{
    return { jsonrpc: "2.0", id, method, params };
}

/** A notification: Codex's have no params, the protocol's agents' do. */
export function notification(method: string, params?: Message): Message
{
    return params === undefined ? { jsonrpc: "2.0", method } : { jsonrpc: "2.0", method, params };
}

export function result(id: unknown, value: Message): Message
{
    return { jsonrpc: "2.0", id, result: value };
}

export function error(id: unknown, code: number, message: string): Message
{
    return { jsonrpc: "2.0", id, error: { code, message } };
}

/** The words of an answer that failed, or undefined for one that did not. */
export function failureOf(answer: Message): string | undefined
{
    if (answer.error === undefined) {
        return undefined;
    }

    return wordsOf(answer.error) ?? "it gave no reason";
}

/** The message of an error the host gives, trimmed; undefined where it has none. */
export function wordsOf(error: unknown): string | undefined
{
    const message = isObject(error) ? error.message : undefined;
    return typeof message === "string" && message.trim() !== "" ? message.trim() : undefined;
}

/** The requests written to a host that wait for their answer, by id from 1, each with what reads its answer. */
export class Requests
{
    private readonly waiting = new Map<number, (answer: Message) => void>();
    private last = 0;
    private readonly writeLine: (line: string) => void;

    constructor(writeLine: (line: string) => void)
    {
        this.writeLine = writeLine;
    }

    /** Writes a request with the next id, and reads its answer with `answered`. */
    ask(method: string, params: Message, answered: (answer: Message) => void): void
    {
        this.last += 1;
        this.waiting.set(this.last, answered);
        this.writeLine(JSON.stringify(request(this.last, method, params)));
    }

    /** Hands an answer to what reads it, once; an answer to no request that waits changes nothing. */
    answer(message: Message): void
    {
        const id = message.id;
        const answered = typeof id === "number" ? this.waiting.get(id) : undefined;

        if (answered !== undefined && typeof id === "number") {
            this.waiting.delete(id);
            answered(message);
        }
    }
}
