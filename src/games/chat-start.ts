// How the player's chat last started (D-57): chat.json, written by the host's hook when a chat starts, is cleared or resumed; a new game asks for a clean one.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { writeAtomically } from "./files.ts";

/**
 * How a chat started, as the host's SessionStart hook says it: new, cleared, resumed or compacted; when, as an ISO date; its session, for the logs; and the
 * file where the host writes the chat, where Claude Code tells which model made each tool call (D-81).
 */
export interface ChatStart
{
    readonly source: string;
    readonly at: string;
    readonly session?: string;
    readonly transcript?: string;
}

/** Writes how the chat started, over the last one. */
export function saveChatStart(folder: string, start: ChatStart): void
{
    writeAtomically(join(folder, fileName), `${JSON.stringify(start, null, 2)}\n`);
}

/** How the chat last started, or undefined when no hook wrote it, or what it wrote cannot be read. */
export function lastChatStart(folder: string): ChatStart | undefined
{
    try {
        const start = JSON.parse(readFileSync(join(folder, fileName), "utf8")) as Partial<ChatStart>;

        if (typeof start.source !== "string" || typeof start.at !== "string") {
            return undefined;
        }

        return { source: start.source, at: start.at, ...(typeof start.transcript === "string" ? { transcript: start.transcript } : {}) };
    } catch {
        return undefined;
    }
}

/** Whether the chat started clean (new or cleared) after a moment: a resumed or compacted one still holds what came before. */
export function cleanSince(start: ChatStart | undefined, moment: string): boolean
{
    return start !== undefined && (start.source === "startup" || start.source === "clear") && Date.parse(start.at) > Date.parse(moment);
}

const fileName = "chat.json";
