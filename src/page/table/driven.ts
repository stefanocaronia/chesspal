// What the page decides of a chat the table drives itself, with no terminal: which host opens one, when its answer can be stopped, the failure the page
// says once, and the chat that does not listen, which has no window of its own to write in.
import type { Settings } from "../profile/settings.ts";

/** Why a chat the table drove failed or ended by itself, in the host's words, and its number, larger for each. */
export interface ChatFailure
{
    readonly why: string;
    readonly number: number;
}

/** What these read of the table (`TableShown` of the page), kept apart so that they are tested without the page around them. */
export interface DrivenTable
{
    readonly chat: boolean;
    readonly opening?: string;
    readonly driven?: true;
    readonly failed?: ChatFailure;
}

/** A failure the page says: the chat left the table, or a turn of the chat still at it failed; with the host's words. */
export interface FailureSaid
{
    readonly kind: "closed" | "turn";
    readonly why: string;
}

/**
 * Whether the window's button opens the chat in the page, with no terminal: in Claude Code alone for now, with the switch on, and never in place of a chat
 * in a terminal, which starts again where it is.
 */
export function opensInPage(table: DrivenTable, settings: Pick<Settings, "chatInPage">, host: string | undefined): boolean
{
    return settings.chatInPage && host === "claude" && (!table.chat || table.driven === true);
}

/**
 * Whether the chat opening is one the table drives: the table says so only once the chat is at it, so until then the page goes by the switch and the host
 * its window last opened.
 */
export function opensDriven(table: DrivenTable, settings: Pick<Settings, "chatInPage" | "chatHost">): boolean
{
    return table.opening === "chat" && settings.chatInPage && settings.chatHost === "claude";
}

/** Whether the page shows the mark that stops the AI: the chat is one the table drives, and the AI thinks on its move, the only work the table tells of. */
export function canStop(table: DrivenTable | undefined, thinking: string | undefined): boolean
{
    return table?.driven === true && thinking === "move";
}

/** Whether the chat the table drives does not hear the player: it has no window to write in, so the page offers to start it again. */
export function drivenAsleep(table: DrivenTable, listening: boolean | undefined): boolean
{
    return table.driven === true && listening === false;
}

/**
 * The failure the page says, none once it has `said` it or the player closed it, nor while a chat opens: of the chat that left the table, or of a turn of
 * the chat the table still drives. One that stands with another chat at the table is not that chat's.
 */
export function failureToSay(table: DrivenTable, said: number): FailureSaid | undefined
{
    const { failed } = table;

    if (failed === undefined || failed.number <= said || table.opening !== undefined) {
        return undefined;
    }

    if (!table.chat) {
        return { kind: "closed", why: failed.why };
    }

    return table.driven === true ? { kind: "turn", why: failed.why } : undefined;
}

/**
 * The failures a page takes as said when it loads: a turn that failed while the chat stayed at the table is old news by then; with no chat at the table
 * the failure is why, and is still to say.
 */
export function failuresSaidAtLoad(table: DrivenTable | undefined): number
{
    return table?.failed !== undefined && table.chat ? table.failed.number : 0;
}

/**
 * The failures said, as the table's news come: the table forgets the failure when a chat opens, and one started again counts from one, so with none the
 * next is new whatever its number.
 */
export function failuresSaid(table: DrivenTable | undefined, said: number): number
{
    return table?.failed === undefined ? 0 : said;
}

/**
 * Whether the page says the player stopped the AI on its move: they did at the position `stoppedAt`, the one on the board, the AI is still to move there
 * and thinks no more. Its next word comes when the player writes to it.
 */
export function stoppedOnMove(stoppedAt: string | undefined, position: string, aiToMove: boolean, thinking: string | undefined): boolean
{
    return stoppedAt === position && aiToMove && thinking === undefined;
}
