// The Agent Client Protocol as the table speaks it: JSON-RPC 2.0, one JSON object a line each way; the session's options of configuration.
import { version } from "../../version.ts";

export type Message = Record<string, unknown>;

/** The version of the protocol the table speaks. */
export const protocolVersion = 1;

/** The table's first request: it reads no file and runs no terminal for the agent. */
export function initializeParams(): Message
{
    return {
        protocolVersion,
        clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
        clientInfo: { name: "chesspal", title: "Chesspal", version },
    };
}

export function request(id: number, method: string, params: Message): Message
{
    return { jsonrpc: "2.0", id, method, params };
}

export function notification(method: string, params: Message): Message
{
    return { jsonrpc: "2.0", method, params };
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

    const message = isObject(answer.error) ? answer.error.message : undefined;
    return typeof message === "string" && message.trim() !== "" ? message.trim() : "it gave no reason";
}

/** The option of the session's configuration of a category, or with that id where none says its category. */
export function configOption(options: unknown, category: string, id: string): Message | undefined
{
    const all = Array.isArray(options) ? options.filter(isObject) : [];
    return all.find((option) => option.category === category) ?? all.find((option) => option.id === id);
}

/** The values a select option offers, each with its name and words: flat, or in groups. */
export function optionValues(option: Message | undefined): { value: string; name?: string; about?: string; }[]
{
    const entries = Array.isArray(option?.options) ? option.options.filter(isObject) : [];
    const flat = entries.flatMap((entry) => (Array.isArray(entry.options) ? entry.options.filter(isObject) : [entry]));
    return flat.flatMap((entry) => {
        const value = entry.value ?? entry.id;

        if (typeof value !== "string") {
            return [];
        }

        return [{ value, ...(typeof entry.name === "string" ? { name: entry.name } : {}), ...(typeof entry.description === "string" ? { about: entry.description } : {}) }];
    });
}

export function isObject(value: unknown): value is Message
{
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
