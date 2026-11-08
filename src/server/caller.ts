// Who makes a tool call (D-81): only what the host ties to that call, never what the AI says of itself nor a setting the chat may have changed (T-113).
// Codex sends the model and the effort with each call; Claude Code writes them into the chat's transcript, on the line of the call.
import { closeSync, openSync, readdirSync, readFileSync, readSync, statSync } from "node:fs";
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
    return (await foundCall(transcript, call, wait))?.caller;
}

/** Who in Claude Code made a tool call: the chat itself, or one of its agents by its type. */
export type CallingAgent = { chat: true; } | { agent: string; };

/**
 * Who in Claude Code made a tool call: the chat, when its line is in the chat's transcript, or the agent whose file has it, by the type Claude Code notes
 * beside that file (Priya, review of T-112). Undefined when it cannot be told: another host, no chat noted, no line, or no type.
 */
export async function callingAgent(meta: Record<string, unknown> | undefined, folder: string, wait = 50): Promise<CallingAgent | undefined>
{
    const call = meta?.["claudecode/toolUseId"];
    const transcript = lastChatStart(folder)?.transcript;
    const found = typeof call === "string" && transcript !== undefined ? await foundCall(transcript, call, wait) : undefined;

    if (found === undefined) {
        return undefined;
    }

    if (found.file === transcript) {
        return { chat: true };
    }

    const type = objectOf(textOf(found.file.replace(/\.jsonl$/, ".meta.json")))?.agentType;
    return typeof type === "string" ? { agent: type } : undefined;
}

/** Whether an agent's tool may answer this caller: one of its agents, or a caller that cannot be told, since the tool's description is the first guard. */
export function allowedCaller(caller: CallingAgent | undefined, agents: readonly string[]): boolean
{
    return caller === undefined || ("agent" in caller && agents.includes(caller.agent));
}

// Three seconds at most: the line comes 30 or 40 milliseconds after a short call, but over 300 after annotate_game's long one. Nobody waits for it on the
// AI's clock: annotate_game runs with no game going on, and the AI's move is read after its answer.
const attempts = 60;
// The line of a call just made is near the end of its file.
const tailBytes = 512 * 1024;
// A subagent's file is one written in the last minute.
const recentFiles = 60_000;

/** Who made a tool call, and the file its line is in, the chat's own or a subagent's; none when no line has it. */
async function foundCall(transcript: string, call: string, wait: number): Promise<{ caller: Caller; file: string; } | undefined>
{
    for (let attempt = 0; attempt < attempts; attempt++) {
        for (const file of [transcript, ...subagentFiles(transcript)]) {
            const found = callerIn(tailOf(file), call);

            if (found !== undefined) {
                return { caller: found, file };
            }
        }

        if (attempt < attempts - 1) {
            await new Promise((done) => setTimeout(done, wait));
        }
    }

    return undefined;
}

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

function textOf(file: string): string
{
    try {
        return readFileSync(file, "utf8");
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
