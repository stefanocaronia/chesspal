// The table (D-104): the board page served in a process of its own, with no chat, on a folder of the data folder that is one for every profile; it
// closes by itself once no browser has had the page open for a while.
import { join } from "node:path";
import type { Context } from "../../commands/index.ts";
import { setUpHosts } from "../../host-files/index.ts";
import { pageAt, pagePorts, samePath } from "../bell.ts";
import { type Page, startPage } from "../page/page.ts";

/** A table served: its address, and how to close it. */
export interface Table
{
    readonly url: string;
    /** Settled once the table has closed: by itself, asked by a newer Chesspal, or by close. */
    readonly closed: Promise<void>;
    close(): Promise<void>;
}

/** How long the table stays with no page open before it closes, and how often it looks, in milliseconds. */
export interface TableTimes
{
    readonly idle: number;
    readonly every: number;
}

/** Five minutes with no browser, looked at every fifteen seconds (D-104). */
export const tableTimes: TableTimes = { idle: 5 * 60_000, every: 15_000 };

/** The table's folder, inside the data folder: where the chats it opens start, whoever's profile is in use (D-71, D-104). */
export function tableFolder(home: string): string
{
    return join(home, "table");
}

/**
 * Starts the table on the context's data folder, its folder set up as init does: undefined when another table started at the same time took a lower port,
 * since a table's ports are its lock. It closes once no page has been open, and no request come, for `times.idle`.
 */
export async function startTable(context: Context, times: TableTimes = tableTimes): Promise<Table | undefined>
{
    const folder = tableFolder(context.home());
    setUpHosts(folder, context.platform);
    let quit = (): void => undefined;
    const quitting = new Promise<void>((done) => {
        quit = done;
    });
    let lastUsed = context.now().getTime();

    const used = (): void => {
        lastUsed = context.now().getTime();
    };

    const page = await startPage({ ...context, folder }, { table: { used, quit } });

    if (await lostTo(page.url, folder)) {
        await page.close();
        return undefined;
    }

    const watch = closeWhenIdle(page, () => context.now().getTime() - lastUsed, used, times, quit);
    const closed = quitting.then(async () => {
        clearInterval(watch);
        await page.close();
    });
    return {
        url: page.url,
        closed,
        close: () => {
            quit();
            return closed;
        },
    };
}

/** Whether a table of the same folder answers on a lower port than this one's: the other won, and this one goes. */
async function lostTo(url: string, folder: string): Promise<boolean>
{
    const port = Number(new URL(url).port);
    const lower = pagePorts(folder).filter((other) => other < port);
    const found = await Promise.all(lower.map(pageAt));
    return found.some((said) => said?.table === true && samePath(said.folder, folder));
}

/**
 * Looks every `times.every` whether a browser has the page open, which uses the table, and quits once it has been unused for `times.idle`: the page that
 * `chesspal` opens counts from its first request. The timer keeps the process alive till then.
 */
function closeWhenIdle(page: Page, unusedFor: () => number, used: () => void, times: TableTimes, quit: () => void): NodeJS.Timeout
{
    return setInterval(() => {
        if (page.open()) {
            used();
        } else if (unusedFor() >= times.idle) {
            quit();
        }
    }, times.every);
}
