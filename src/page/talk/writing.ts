// Whether the AI's bubble that writes, three dots at the thread's foot as in a chat app, shows: the AI read the player's last line and is at work on its answer.
import type { ThreadItem } from "../game/plies.ts";

/** What the page knows of the chat: whether nobody hears the player, and whether a turn of it runs, as the doorbell says or the table that drives it. */
export interface ChatAtWork
{
    readonly asleep: boolean;
    readonly inTurn?: boolean;
    readonly atWork?: boolean;
}

/** Whether the AI writes: the player's last line is read and not yet answered, and a chat that hears the player is in a turn. */
export function aiWrites(items: readonly ThreadItem[], chat: ChatAtWork): boolean
{
    const written = items.findLast((item) => item.who === "player");
    return written?.line?.heard === "read" && !chat.asleep && (chat.inTurn === true || chat.atWork === true);
}
