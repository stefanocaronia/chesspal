// The table (D-104): the board page served in a process of its own, on a folder of the data folder that is one for every profile, which a chat attaches
// to; it closes by itself once no browser has had the page open, and no chat been attached, for a while.
import { request } from "node:http";
import type { Context } from "../../commands/index.ts";
import { samePath, tableFolder } from "../../home/index.ts";
import { pageAt, pagePorts } from "../bell/index.ts";
import { type Page, startPage, type TableChats } from "../page/index.ts";
import { setUpTable } from "./hosts/index.ts";
import type { TableUpdater } from "./update.ts";

/** A table served: its address, and how to close it. */
export interface Table
{
    readonly url: string;
    /** Settled once the table has closed: by itself, asked by another Chesspal version, or by close. */
    readonly closed: Promise<void>;
    close(): Promise<void>;
}

/** How long the table stays unused before it closes, and how often it looks, in milliseconds. */
export interface TableTimes
{
    readonly idle: number;
    readonly every: number;
}

/** Five minutes with no browser and no chat, looked at every fifteen seconds (D-104). */
export const tableTimes: TableTimes = { idle: 5 * 60_000, every: 15_000 };

/** A table that answers on its ports: its address, port and version, and the folder of the chat attached to it, when one is. */
export interface TableFound
{
    readonly url: string;
    readonly port: number;
    readonly version: string | undefined;
    readonly chat: string | undefined;
}

/**
 * Starts the table on the context's data folder, its folder set up as init does, its page opening chats through `chats`: undefined when another table
 * started at the same time took a lower port, since a table's ports are its lock. It closes once no page has been open, no chat attached and no request
 * come, for `times.idle`; with `updater`, its page updates Chesspal, and a new table starts from it once this one has closed (D-108).
 */
export async function startTable(context: Context, times: TableTimes = tableTimes, chats?: TableChats, updater?: TableUpdater): Promise<Table | undefined>
{
    const folder = tableFolder(context.home());
    setUpTable(folder, context.platform);
    let quit = (): void => undefined;
    const quitting = new Promise<void>((done) => {
        quit = done;
    });
    let lastUsed = context.now().getTime();
    let startAgain = false;

    const used = (): void => {
        lastUsed = context.now().getTime();
    };

    const restart = (): void => {
        startAgain = true;
        quit();
    };

    const update = updater === undefined ? undefined : { install: (version: string) => updater.install(version), restart };
    const page = await startPage({ ...context, folder }, { table: { used, quit, chats, update } });

    if (await lostTo(page.url, folder)) {
        await page.close();
        return undefined;
    }

    const watch = closeWhenIdle(page, () => context.now().getTime() - lastUsed, used, times, quit);
    const closed = quitting.then(async () => {
        clearInterval(watch);
        // Its ports free, the new table takes the first of them, where the pages open look for it.
        await page.close();

        if (startAgain) {
            updater?.startAgain();
        }
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

/** The table of a folder that answers on its ports, the lowest of them; its ports are asked together. */
export async function tableAt(folder: string): Promise<TableFound | undefined>
{
    const ports = pagePorts(folder);
    const said = await Promise.all(ports.map(pageAt));
    const index = said.findIndex((one) => one?.table === true && samePath(one.folder, folder));
    const port = ports[index];
    return port === undefined ? undefined : { url: `http://127.0.0.1:${port}/`, port, version: said[index]?.version, chat: said[index]?.chat };
}

/** Asks the table at a port to quit; it answers before it goes, and a table that cannot be reached, or does not answer within a second or so, is let be. */
export async function askToQuit(port: number): Promise<void>
{
    await askTable(port, "/api/table/quit");
}

/**
 * Asks the table at a port for an opening of its window: its number, which the window carries, null while another opening has not reached the table
 * yet, so that no second window opens; undefined when the table did not answer.
 */
export async function askToOpen(port: number): Promise<number | null | undefined>
{
    const answer = await askTable(port, "/api/table/open");
    const opening = (answer as { opening?: unknown; } | undefined)?.opening;
    return typeof opening === "number" || opening === null ? opening : undefined;
}

/** Lets go of the opening the table at a port gave, whose window will never reach it: the next `chesspal` opens its own at once. */
export async function askToRelease(port: number, opening: number): Promise<void>
{
    await askTable(port, "/api/table/open", { release: opening });
}

// A POST of JSON to a route of the table: its answer read as JSON, undefined when it could not be reached or read in time.
function askTable(port: number, path: string, body: object = {}): Promise<unknown>
{
    return new Promise((done) => {
        const asked = request({ host: "127.0.0.1", port, path, method: "POST", headers: { "Content-Type": "application/json" }, agent: false }, (response) => {
            let body = "";
            response.setEncoding("utf8");
            response.on("data", (chunk: string) => {
                body += chunk;
            });
            response.on("end", () => {
                try {
                    done(JSON.parse(body));
                } catch {
                    done(undefined);
                }
            });
        });
        asked.setTimeout(tableWait, () => asked.destroy());
        asked.on("error", () => done(undefined));
        asked.end(JSON.stringify(body));
    });
}

// A table answers at once: one stuck must not hold the chat's first tool, nor `chesspal`.
const tableWait = 1_500;

/** Whether a table of the same folder answers on a lower port than this one's: the other won, and this one goes. */
async function lostTo(url: string, folder: string): Promise<boolean>
{
    const port = Number(new URL(url).port);
    const lower = pagePorts(folder).filter((other) => other < port);
    const found = await Promise.all(lower.map(pageAt));
    return found.some((said) => said?.table === true && samePath(said.folder, folder));
}

/**
 * Looks every `times.every` whether a browser has the page open or a chat is attached, which uses the table, and quits once it has been unused for
 * `times.idle`: the page that `chesspal` opens counts from its first request. The timer keeps the process alive till then.
 */
function closeWhenIdle(page: Page, unusedFor: () => number, used: () => void, times: TableTimes, quit: () => void): NodeJS.Timeout
{
    return setInterval(() => {
        if (page.inUse()) {
            used();
        } else if (unusedFor() >= times.idle) {
            quit();
        }
    }, times.every);
}
