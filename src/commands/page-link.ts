// The board page's address for the AI to give the player when no browser has the page open: the instructions alone do not get it said.
import type { Context } from "./context.ts";

/** The board page's address when the chat serves it and no browser has it open; none on the command line, or with the page open. */
export function closedPage(context: Context): string | undefined
{
    return context.page !== undefined && context.pageOpen?.() === false ? context.page : undefined;
}

/** The board page's address once a game, for a move written in the chat while no browser has the page open: the game is played there (D-85). */
export function pageInvite(context: Context, started: string | undefined): string | undefined
{
    const page = closedPage(context);

    if (page === undefined || context.told === undefined || context.told.has(inviteKey(started))) {
        return undefined;
    }

    context.told.add(inviteKey(started));
    return page;
}

/** Notes the board page's address given for a game, by status or new_game: a move in the chat does not give it again (Priya, round of D-85). */
export function pageGiven(context: Context, started: string): void
{
    context.told?.add(inviteKey(started));
}

/** The line that has the AI invite the player to the board page from the chat. */
export function inviteLine(url: string): string
{
    return `The board page is open in no browser, and the game is played there: invite the player, in a few words, to open ${url}; their moves in the chat still count.`;
}

/** The board page's line: its address, and when nobody has it open, that the player needs it first. */
export function pageLine(url: string, closed: boolean): string
{
    return closed ? `Board page: ${url}, open in no browser: give the player this address before anything else.` : `Board page: ${url}`;
}

function inviteKey(started: string | undefined): string
{
    return `page invite ${started ?? ""}`;
}
