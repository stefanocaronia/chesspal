// The chat the table drives, kept in the data folder across the table's restarts: a table that starts again opens it again with its session, while its
// game goes on.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { makeFolder, writeAtomically } from "../../games/index.ts";

/**
 * The chat the table drove last: its host, its session to take up again, none for a clean one, the start of the game it played last, and whether it was
 * let go for good.
 */
export interface KeptChat
{
    readonly host: string;
    readonly session?: string | undefined;
    /** When the game the chat played last started, as the game names it: it is taken up again only while that game goes on. */
    readonly game?: string | undefined;
    /** Ended by itself, or put aside for a chat in a terminal: a table that starts again opens none. */
    readonly closed: boolean;
}

/** Writes the chat the table drives in `chats`, the folder of the chats the table drives. */
export function keepChat(chats: string, chat: KeptChat): void
{
    makeFolder(chats);
    writeAtomically(keptPath(chats), `${JSON.stringify(chat, null, 2)}\n`);
}

/** The chat the table drove last, in `chats`; none when there is none, or it cannot be read. */
export function keptChat(chats: string): KeptChat | undefined
{
    try {
        const kept = JSON.parse(readFileSync(keptPath(chats), "utf8")) as Partial<Record<keyof KeptChat, unknown>>;
        const text = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);

        if (typeof kept.host !== "string" || typeof kept.closed !== "boolean") {
            return undefined;
        }

        return { host: kept.host, session: text(kept.session), game: text(kept.game), closed: kept.closed };
    } catch {
        return undefined;
    }
}

function keptPath(chats: string): string
{
    return join(chats, "driven.json");
}
