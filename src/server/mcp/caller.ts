// Who makes a tool call (D-81): only what the host ties to that call, never what the AI says of itself nor a setting the chat may have changed.
// Codex sends the model and the effort with each call; Claude Code writes them into the chat's transcript, on the line of the call.
import { closeSync, openSync, readdirSync, readFileSync, readSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { Caller } from "../../commands/index.ts";
import { lastChatStart } from "../../games/index.ts";

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

/** Who in Claude Code or Codex made a tool call: the chat itself, or one of its agents by its type, with the run it is, when the host tells it. */
export type CallingAgent = { chat: true; } | { agent: string; run?: string; };

/**
 * Who in Claude Code or Codex made a tool call: the chat, when its line is in the chat's transcript, or the agent whose file has it, by the type Claude Code
 * notes beside that file (Priya); in Codex, as the call's metadata and the agent's own session say (D-98). Undefined when it cannot be told: another host,
 * no chat noted, no line, or no type.
 */
export async function callingAgent(meta: Record<string, unknown> | undefined, folder: string, wait = 50): Promise<CallingAgent | undefined>
{
    const turn = objectOf(meta?.["x-codex-turn-metadata"]);

    if (turn !== undefined) {
        return await codexCaller(turn, wait);
    }

    const call = meta?.["claudecode/toolUseId"];
    const transcript = lastChatStart(folder)?.transcript;
    const found = typeof call === "string" && transcript !== undefined ? await foundCall(transcript, call, wait) : undefined;

    if (found === undefined) {
        return undefined;
    }

    if (found.file === transcript) {
        return { chat: true };
    }

    // Each agent Claude Code starts writes a file of its own: its name tells two runs of the same agent apart.
    const type = objectOf(textOf(found.file.replace(/\.jsonl$/, ".meta.json")))?.agentType;
    return typeof type === "string" ? { agent: type, run: basename(found.file, ".jsonl") } : undefined;
}

/** Whether a call comes from one of Codex's agents, as its metadata say: its own process starts no board page (D-98). */
export function fromCodexAgent(meta: Record<string, unknown> | undefined): boolean
{
    return objectOf(meta?.["x-codex-turn-metadata"])?.thread_source === "subagent";
}

/** Whether an agent's tool may answer this caller: one of its agents, or a caller that cannot be told, since the tool's description is the first guard. */
export function allowedCaller(caller: CallingAgent | undefined, agents: readonly string[]): boolean
{
    return caller === undefined || ("agent" in caller && agents.includes(caller.agent));
}

/** The model and effort on the transcript's line of a tool call, in the chat's file or its subagents'; Claude Code writes it a few milliseconds late. */
async function lineOfCall(transcript: string, call: string, wait = 50): Promise<Caller | undefined>
{
    return (await foundCall(transcript, call, wait))?.caller;
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

/**
 * Who in Codex made a call: the chat, or an agent by the role its session notes first, before its first call (Priya). An agent started with the chat's
 * own turns sees the opponent's plan, so it counts as the chat (D-88).
 */
async function codexCaller(turn: Record<string, unknown>, wait: number): Promise<CallingAgent | undefined>
{
    if (turn.thread_source !== "subagent") {
        return turn.thread_source === "user" ? { chat: true } : undefined;
    }

    const thread = turn.thread_id;

    if (typeof thread !== "string" || !/^[0-9a-f-]{36}$/i.test(thread)) {
        return undefined;
    }

    const known = codexThreads.get(thread);

    if (known !== undefined) {
        return known;
    }

    for (let attempt = 0; attempt < codexAttempts; attempt++) {
        const start = headOf(codexSession(thread));
        const role = /"agent_role":"([^"]+)"/.exec(start)?.[1];

        if (role !== undefined) {
            const caller: CallingAgent = start.includes('"forked_from_id":"') ? { chat: true } : { agent: role, run: thread };
            codexThreads.set(thread, caller);
            return caller;
        }

        await new Promise((done) => setTimeout(done, wait));
    }

    return undefined;
}

// Who each agent's thread is, read once: it never changes, and an agent calls a tool many times (Federico).
const codexThreads = new Map<string, CallingAgent>();

// The agent's session is written as it starts: a few tries are enough.
const codexAttempts = 10;
// Its first line holds Codex's long prompt, but the role comes in its first two kilobytes (Priya).
const headBytes = 16 * 1024;

/**
 * The file of a Codex session by its thread: in the day's folder of its start, which its UUIDv7 holds, or the days beside it around midnight; none when
 * it is not there.
 */
function codexSession(thread: string): string
{
    const started = Number.parseInt(thread.replaceAll("-", "").slice(0, 12), 16);
    const sessions = join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "sessions");

    for (const day of [0, -1, 1]) {
        const date = new Date(started + day * 86_400_000);
        const folder = join(sessions, String(date.getFullYear()), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0"));

        try {
            const name = readdirSync(folder).find((each) => each.endsWith(`-${thread}.jsonl`));

            if (name !== undefined) {
                return join(folder, name);
            }
        } catch {
            // No session that day.
        }
    }

    return "";
}

function headOf(file: string): string
{
    if (file === "") {
        return "";
    }

    try {
        const descriptor = openSync(file, "r");

        try {
            const buffer = Buffer.alloc(headBytes);
            const read = readSync(descriptor, buffer, 0, headBytes, 0);
            return buffer.subarray(0, read).toString("utf8");
        } finally {
            closeSync(descriptor);
        }
    } catch {
        return "";
    }
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
