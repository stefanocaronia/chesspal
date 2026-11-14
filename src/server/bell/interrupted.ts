// A chat stopped with Esc: Claude Code and Codex run no Stop hook then, so no hook waits for the bell, and the doorbell would think the chat still at work.
// The host says it: Claude Code in the transcript once the AI had begun its answer, the last line of the conversation being the player's interruption, and
// before that in the record it keeps of its running chat, which says it is idle; Codex in the transcript, the turn's last event being its abort.
import { closeSync, openSync, readdirSync, readFileSync, readSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { lastChatStart } from "../../games/index.ts";

/**
 * Whether the chat last started in this folder was stopped in the middle of its turn, as Claude Code or Codex writes it in the chat's transcript, or Claude
 * Code in its record of the chat; false when it cannot be told. Asked only while the doorbell holds a ring for a chat it takes as in a turn.
 */
export function chatInterrupted(folder: string): boolean
{
    const { transcript, session } = lastChatStart(folder) ?? {};
    return transcript !== undefined && (endsInterrupted(tailOf(transcript)) || (session !== undefined && chatIdle(transcript, session)));
}

/**
 * Whether these last lines of a transcript end with the chat stopped: in Claude Code's the last line of the conversation is the player's interruption, the
 * lines of agents and of the host's own notes skipped; in Codex's the last event of a turn is its abort, not its start or its end.
 */
function endsInterrupted(lines: string): boolean
{
    for (const line of lines.split("\n").reverse()) {
        const entry = objectOf(line);
        const event = entry?.type === "event_msg" ? entry.payload as { type?: unknown; reason?: unknown; } | undefined : undefined;

        if (event !== undefined && codexTurnEvents.has(event.type)) {
            return event.type === "turn_aborted" && event.reason === "interrupted";
        }

        if (entry === undefined || entry.isSidechain === true || (entry.type !== "user" && entry.type !== "assistant")) {
            continue;
        }

        const content = (entry.message as { content?: unknown; } | undefined)?.content;
        const parts = typeof content === "string" ? [{ type: "text", text: content }] : Array.isArray(content) ? content as unknown[] : [];
        return entry.type === "user" && parts.some((part) => {
            const { type, text } = (part ?? {}) as { type?: unknown; text?: unknown; };
            return type === "text" && typeof text === "string" && text.startsWith(interruption);
        });
    }

    return false;
}

/**
 * Whether Claude Code says the chat of this session is idle, in the record it keeps of each chat it runs: `sessions/<pid>.json` in its folder, the one
 * that holds `projects/` and the transcript. It is idle from the end of a turn, or an Esc, to the next message; at work with a background agent too.
 */
function chatIdle(transcript: string, session: string): boolean
{
    const projects = dirname(dirname(transcript));

    if (basename(projects) !== "projects") {
        return false;
    }

    const sessions = join(dirname(projects), "sessions");

    try {
        return readdirSync(sessions).filter((name) => name.endsWith(".json")).some((name) => {
            const record = objectOf(readFileSync(join(sessions, name), "utf8"));
            return record?.sessionId === session && record.status === "idle";
        });
    } catch {
        return false;
    }
}

// The events of a turn in Codex's transcript: it starts, ends, or is aborted.
const codexTurnEvents = new Set<unknown>(["task_started", "task_complete", "turn_aborted"]);

// What Claude Code writes as the player's line when Esc stops the chat, with " for tool use]" or "]" after it.
const interruption = "[Request interrupted by user";

// The conversation's last line is near the end of the file.
const tailBytes = 64 * 1024;

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

function objectOf(line: string): Record<string, unknown> | undefined
{
    try {
        const value: unknown = JSON.parse(line);
        return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
    } catch {
        return undefined;
    }
}
