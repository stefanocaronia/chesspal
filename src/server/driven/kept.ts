// The chat the table drives, kept in the table's folder across its restarts: a table that starts again opens it again with its session.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { makeFolder, writeAtomically } from "../../games/index.ts";

/** The chat the table drove last: its host, model and effort, its session to take up again, none for a clean one, and whether it was let go for good. */
export interface KeptChat
{
    readonly host: string;
    readonly model?: string | undefined;
    readonly effort?: string | undefined;
    readonly session?: string | undefined;
    /** Ended by itself, or put aside for a chat in a terminal: a table that starts again opens none. */
    readonly closed: boolean;
}

/** Writes the chat the table drives in the table's `folder`. */
export function keepChat(folder: string, chat: KeptChat): void
{
    makeFolder(join(folder, "chats"));
    writeAtomically(keptPath(folder), `${JSON.stringify(chat, null, 2)}\n`);
}

/** The chat the table drove last, in the table's `folder`; none when there is none, or it cannot be read. */
export function keptChat(folder: string): KeptChat | undefined
{
    try {
        const kept = JSON.parse(readFileSync(keptPath(folder), "utf8")) as Partial<Record<keyof KeptChat, unknown>>;
        const text = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);

        if (typeof kept.host !== "string" || typeof kept.closed !== "boolean") {
            return undefined;
        }

        return { host: kept.host, model: text(kept.model), effort: text(kept.effort), session: text(kept.session), closed: kept.closed };
    } catch {
        return undefined;
    }
}

function keptPath(folder: string): string
{
    return join(folder, "chats", "driven.json");
}
