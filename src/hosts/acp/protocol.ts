// The Agent Client Protocol as the table speaks it: JSON-RPC 2.0, one JSON object a line each way; the session's options of configuration.
import { version } from "../../version.ts";
import { isHostName } from "../chat.ts";
import { isObject, type Message } from "../lines.ts";

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

// The effort that leaves it to the model, which the table never names.
const defaultEffort = "default";

/** The efforts the model in play takes, as the session's options say them now: none where it has no option of effort. */
export function effortsOf(options: unknown): string[]
{
    const option = configOption(options, "thought_level", "effort");
    return optionValues(option).map((one) => one.value).filter((one) => one !== defaultEffort && isHostName(one));
}
