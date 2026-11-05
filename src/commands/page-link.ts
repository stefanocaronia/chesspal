// The board page's address for the AI to give the player when no browser has the page open: the instructions alone do not get it said (T-62).
import type { Context } from "./context.ts";

/** The board page's address when the chat serves it and no browser has it open; none on the command line, or with the page open. */
export function closedPage(context: Context): string | undefined
{
    return context.page !== undefined && context.pageOpen?.() === false ? context.page : undefined;
}

/** The board page's line: its address, and when nobody has it open, that the player needs it first. */
export function pageLine(url: string, closed: boolean): string
{
    return closed ? `Board page: ${url}, open in no browser: give the player this address before anything else.` : `Board page: ${url}`;
}
