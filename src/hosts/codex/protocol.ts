// Codex's app-server protocol as the table speaks it: JSON-RPC, one JSON object a line each way; Codex leaves out the version on its own lines.
import { version } from "../../version.ts";

export type Message = Record<string, unknown>;

/** The table's first request: who it is, and the protocol's experimental fields, which the thread's options are among. */
export function initializeParams(): Message
{
    return { clientInfo: { name: "chesspal", title: "Chesspal", version }, capabilities: { experimentalApi: true } };
}

export function request(id: number, method: string, params: Message): Message
{
    return { jsonrpc: "2.0", id, method, params };
}

export function notification(method: string): Message
{
    return { jsonrpc: "2.0", method };
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

/** The message of an error Codex gives, trimmed; undefined where it has none. */
export function wordsOf(error: unknown): string | undefined
{
    const message = isObject(error) ? error.message : undefined;
    return typeof message === "string" && message.trim() !== "" ? message.trim() : undefined;
}

export function isObject(value: unknown): value is Message
{
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
