// Who makes a tool call (D-81): only what the host ties to that call, never what the AI says of itself nor a setting the chat may have changed (T-113).
// Codex sends the model and the effort with each call; Claude Code writes them into the chat's transcript, on the line of the call.
import { closeSync, openSync, readdirSync, readSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { Caller } from "../commands/context.ts";
import { lastChatStart } from "../games/index.ts";

/** The host as it names itself to the server. */
export interface Client
{
    name: string;
    title?: string | undefined;
}

/** Who made the call with these metadata: the model and effort the host ties to it, else the host's name; undefined without a host. */
export async function callerOf(meta: Record<string, unknown> | undefined, client: Client | undefined, folder: string, wait = 50): Promise<Caller | undefined>
{
    const turn = objectOf(meta?.["x-codex-turn-metadata"]);

    if (typeof turn?.model === "string") {
        return withEffort(turn.model, turn.reasoning_effort);
    }

    const call = meta?.["claudecode/toolUseId"];
    const transcript = lastChatStart(folder)?.transcript;

    if (typeof call === "string" && transcript !== undefined) {
        const found = await lineOfCall(transcript, call, wait);

        if (found !== undefined) {
            return found;
        }
    }

    return client === undefined ? undefined : { annotator: client.title ?? client.name, hostOnly: true };
}

/** The model and effort on the transcript's line of a tool call, in the chat's file or its subagents'; Claude Code writes it a few milliseconds late. */
export async function lineOfCall(transcript: string, call: string, wait = 50): Promise<Caller | undefined>
{
    for (let attempt = 0; attempt < attempts; attempt++) {
        for (const file of [transcript, ...subagentFiles(transcript)]) {
            const found = callerIn(tailOf(file), call);

            if (found !== undefined) {
                return found;
            }
        }

        if (attempt < attempts - 1) {
            await new Promise((done) => setTimeout(done, wait));
        }
    }

    return undefined;
}

// A third of a second at most, as the line comes 30 or 40 milliseconds after the call.
const attempts = 6;
// The line of a call just made is near the end of its file.
const tailBytes = 512 * 1024;
// A subagent's file is one written in the last minute.
const recentFiles = 60_000;

function callerIn(text: string, call: string): Caller | undefined
{
    const marker = `"id":"${call}"`;

    for (const line of text.split("\n").reverse()) {
        if (!line.includes(marker)) {
            continue;
        }

        const entry = objectOf(line);
        const message = objectOf(entry?.message);

        if (entry?.type === "assistant" && typeof message?.model === "string" && message.model !== "<synthetic>") {
            return withEffort(message.model, entry.effort);
        }
    }

    return undefined;
}

function withEffort(model: string, effort: unknown): Caller
{
    return typeof effort === "string" && effort !== "" ? { annotator: model, effort } : { annotator: model };
}

function subagentFiles(transcript: string): string[]
{
    const folder = join(dirname(transcript), basename(transcript, ".jsonl"), "subagents");

    try {
        const since = Date.now() - recentFiles;
        return readdirSync(folder).filter((name) => name.endsWith(".jsonl")).map((name) => join(folder, name)).filter((file) => statSync(file).mtimeMs >= since);
    } catch {
        return [];
    }
}

function tailOf(file: string): string
{
    try {
        const descriptor = openSync(file, "r");

        try {
            const size = statSync(file).size;
            const length = Math.min(size, tailBytes);
            const buffer = Buffer.alloc(length);
            readSync(descriptor, buffer, 0, length, size - length);
            return buffer.toString("utf8");
        } finally {
            closeSync(descriptor);
        }
    } catch {
        return "";
    }
}

function objectOf(value: unknown): Record<string, unknown> | undefined
{
    if (typeof value === "string") {
        try {
            return objectOf(JSON.parse(value));
        } catch {
            return undefined;
        }
    }

    return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
