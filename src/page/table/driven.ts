// What the page decides of a chat the table drives itself, with no terminal: which host opens one, when it can be stopped, what the page says once it is
// stopped or has not moved, the failure the page says once, and the chat that does not listen, which has no window of its own to write in.
import type { Settings } from "../profile/settings.ts";

/** What the table tells apart of a chat's failure: the host is not signed in, its program is missing, the account's limit is reached, it ended by itself, or else. */
export const failureCodes = ["not-signed-in", "program-missing", "usage-limit", "program-ended", "other"] as const;
export type FailureCode = typeof failureCodes[number];

/** Why a chat the table drove failed or ended by itself: the host's words, the table's code for them, its number, larger for each, and its host. */
export interface ChatFailure
{
    readonly why: string;
    readonly code?: string;
    readonly number: number;
    readonly host?: string;
}

/** What these read of the table (`TableShown` of the page), kept apart so that they are tested without the page around them. */
export interface DrivenTable
{
    readonly chat: boolean;
    readonly opening?: string;
    readonly driven?: true;
    readonly failed?: ChatFailure;
    readonly atWork?: true;
    readonly stopped?: true;
    readonly noMove?: true;
}

/** A failure the page says: the chat left the table, or a turn of the chat still at it failed; by its code, with the host's words and its name. */
export interface FailureSaid
{
    readonly kind: "closed" | "turn";
    readonly code: FailureCode;
    readonly why: string;
    readonly host: string;
}

/** The AI at rest on its move, which the page says with what the player can do: they stopped it, or it ended its turns without moving. */
export type Stalled = "stopped" | "noMove";

/** The hosts whose chat the table drives in the page, by the names the page gives them, each with its name for the player. */
export const drivenHosts: Readonly<Record<string, string>> = { claude: "Claude Code", codex: "Codex", antigravity: "Antigravity", opencode: "OpenCode" };

/**
 * Whether the window's button opens the chat in the page, with no terminal: in a host the table drives, with the switch on, and never in place of a chat
 * in a terminal, which starts again where it is.
 */
export function opensInPage(table: DrivenTable, settings: Pick<Settings, "chatInPage">, host: string | undefined): boolean
{
    return settings.chatInPage && host !== undefined && Object.hasOwn(drivenHosts, host) && (!table.chat || table.driven === true);
}

/** The name for the player of a host the table drives: Claude Code's where the host is not one of them, as a failure told by an older table. */
export function drivenTitle(host: string | undefined): string
{
    return host !== undefined && Object.hasOwn(drivenHosts, host) ? drivenHosts[host]! : drivenHosts.claude!;
}

/** Whether the page shows the mark that stops the AI: a turn of the chat the table drives is running, for a move, an answer or anything else. */
export function canStop(table: DrivenTable | undefined): boolean
{
    return table?.driven === true && table.atWork === true;
}

/**
 * What the AI's thought cloud shows: what the table says it thinks on; else, with a chat the table drives at work on anything but its move, that it
 * answers, so that the mark that stops it never stands alone.
 */
export function workShown<Thinking extends string>(table: DrivenTable | undefined, thinking: Thinking | undefined): Thinking | "answer" | undefined
{
    return thinking ?? (canStop(table) ? "answer" : undefined);
}

/**
 * What the page says of the AI at rest on its move, with a chat the table drives: the player stopped it, or it ended its turns without its move. Its
 * clock is held. Stopped off its move, there is nothing the player need do.
 */
export function stalledOnMove(table: DrivenTable | undefined, aiToMove: boolean): Stalled | undefined
{
    if (table?.driven !== true || !aiToMove || table.atWork === true) {
        return undefined;
    }

    return table.stopped === true ? "stopped" : table.noMove === true ? "noMove" : undefined;
}

/** Whether the chat the table drives does not hear the player: it has no window to write in, so the page offers to start it again. */
export function drivenAsleep(table: DrivenTable, listening: boolean | undefined): boolean
{
    return table.driven === true && listening === false;
}

/**
 * The failure the page says, none once it has `said` it or the player closed it, nor while a chat opens: of the chat that left the table, or of a turn of
 * the chat the table still drives. One that stands with another chat at the table is not that chat's. A code this page does not know is said as any other.
 */
export function failureToSay(table: DrivenTable, said: number): FailureSaid | undefined
{
    const { failed } = table;

    if (failed === undefined || failed.number <= said || table.opening !== undefined) {
        return undefined;
    }

    const code = failureCodes.find((known) => known === failed.code) ?? "other";

    const host = drivenTitle(failed.host);

    if (!table.chat) {
        return { kind: "closed", code, why: failed.why, host };
    }

    return table.driven === true ? { kind: "turn", code, why: failed.why, host } : undefined;
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
