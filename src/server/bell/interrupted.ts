// A chat stopped with Esc: Claude Code runs no Stop hook then, so no hook waits for the bell, and the doorbell would think the chat still at work. Its
// transcript says it: the last line of the conversation is the player's interruption.
import { closeSync, openSync, readSync, statSync } from "node:fs";
import { lastChatStart } from "../../games/index.ts";

/** Whether the chat last started in this folder was stopped in the middle of its turn, as Claude Code writes it in the chat's transcript; false when it cannot be told. */
export function chatInterrupted(folder: string): boolean
{
    const transcript = lastChatStart(folder)?.transcript;
    return transcript !== undefined && endsInterrupted(tailOf(transcript));
}

/** Whether the last line of the conversation in these lines of a transcript is the player's interruption; the lines of agents and of the host's own notes are skipped. */
function endsInterrupted(lines: string): boolean
{
    for (const line of lines.split("\n").reverse()) {
        const entry = objectOf(line);

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
