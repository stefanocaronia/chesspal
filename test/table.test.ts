import { existsSync, mkdtempSync } from "node:fs";
import { type ClientRequest, createServer, get, request, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Context } from "../src/commands/index.ts";
import { tableFolder } from "../src/home/index.ts";
import { pageAt, pagePorts } from "../src/server/bell/bell.ts";
import { startPage } from "../src/server/page/page.ts";
import { type Opened, openTable, processLauncher, startTable, type Table, type TableLauncher, type TableTimes } from "../src/server/table/index.ts";
import { version } from "../src/version.ts";
import { testContext } from "./commands.ts";
import { removeFolder } from "./folders.ts";
import { onFreePorts } from "./ports.ts";

const folders: string[] = [];
const tables: Table[] = [];
// A table that never closes by itself while a test runs, and one that closes soon with no page open.
const patient: TableTimes = { idle: 60_000, every: 10 };
const hasty: TableTimes = { idle: 200, every: 10 };

afterEach(async () => {
    await Promise.all(tables.splice(0).map((table) => table.close()));
    await Promise.all(folders.splice(0).map(removeFolder));
});

describe("the table", () => {
    it("serves the page on the table's folder, set up as init does, and says so to the probe, with its version and no chat's session", async () => {
        const { context, table } = await freshTable();
        const said = await pageAt(portOf(table.url));

        expect(pagePorts(tableFolder(context.home()))).toContain(portOf(table.url));
        expect(said).toMatchObject({ table: true, version, session: null, open: false });
        expect(existsSync(join(tableFolder(context.home()), "AGENTS.md"))).toBe(true);
        expect(await status(table.url)).toBe(200);
    });

    it("closes when another table of the same folder started at the same time has a lower port: the ports are the lock", async () => {
        // On another data folder while pages of other tests hold the ports left to the second table.
        const { table, second } = await onFreePorts(async () => {
            const { context, table } = await freshTable();
            return { table, second: await startTable(context, patient) };
        });

        if (second !== undefined) {
            tables.push(second);
        }

        // Unless another test's page left a port below the first one's meanwhile, where the second one rightly stays.
        expect(second === undefined || portOf(second.url) < portOf(table.url)).toBe(true);
    });

    it("closes by itself once no browser has had the page open for a while, and stays while one has", async () => {
        const { table } = await freshTable(hasty);
        const events = await listening(table.url);
        await new Promise((done) => setTimeout(done, 400));

        expect(await pageAt(portOf(table.url))).toMatchObject({ open: true });
        events.destroy();
        await table.closed;
        expect(await pageAt(portOf(table.url))).toBeUndefined();
    });

    it("never serves on a port of no table's, where neither chesspal nor another table would find it", async () => {
        const { context, others } = await allPortsHeld();

        try {
            await expect(startTable(context, patient)).rejects.toThrow("are taken by other programs");
        } finally {
            others.forEach((other) => other.close());
        }
    });

    it("quits when another Chesspal version asks it to; a chat's page has no such route", async () => {
        const { context, table } = await freshTable();
        const page = await startPage(testContext(context.home()));

        expect(await post(page.url, "/api/table/quit")).toBe(405);
        await page.close();
        expect(await post(table.url, "/api/table/quit")).toBe(200);
        await table.closed;
    });

    it("refuses to open a window or quit when another site's page asks through the player's browser; chesspal and another table, which send no origin, are heard", async () => {
        const { table } = await freshTable();

        expect(await post(table.url, "/api/table/open", "http://example.com")).toBe(403);
        expect(await post(table.url, "/api/table/quit", "http://example.com")).toBe(403);
        expect(await post(table.url, "/api/table/open")).toBe(200);
        expect(await post(table.url, "/api/table/quit")).toBe(200);
        await table.closed;
    });
});

describe("chesspal alone", () => {
    it("starts the table when none answers and opens its page; the next time it opens the page of the table that is there", async () => {
        const context = homeContext();
        const { launcher, opened, openings, starts } = inProcess(context);

        expect(await openTable(context, launcher)).toContain(opened[0]);
        const first = await tableWindow(opened[0]!, openings[0]);
        expect(await openTable(context, launcher)).toContain(opened[1]);
        expect(starts()).toBe(1);
        expect(opened[0]).toBe(opened[1]);
        first.close();
    });

    it("keeps one window of the table: the newest opened stays, the older hear of it, and an opening while another has not reached the table opens none", async () => {
        let clock = Date.parse("2026-11-13T10:00:00Z");
        const context = { ...homeContext(), now: () => new Date(clock) };
        const { launcher, opened, openings } = inProcess(context);

        await openTable(context, launcher);
        // Two clicks on the icon while the first window is opening: no second window.
        await Promise.all([openTable(context, launcher), openTable(context, launcher)]);
        expect(openings).toHaveLength(1);

        const first = await tableWindow(opened[0]!, openings[0]);
        clock += 1;
        await Promise.all([openTable(context, launcher), openTable(context, launcher)]);
        expect(openings).toHaveLength(2);
        expect(openings[1]).toBeGreaterThan(openings[0]!);

        const second = await tableWindow(opened[1]!, openings[1]);
        expect(await first.heard(`window ${openings[1]}`)).toBe(true);

        // An opening whose window never came lets the next one open after a while.
        await openTable(context, launcher);
        await openTable(context, launcher);
        expect(openings).toHaveLength(3);
        clock += 10_000;
        await openTable(context, launcher);
        expect(openings).toHaveLength(4);

        // A window that connects again after a newer one hears it is older.
        first.close();
        const again = await tableWindow(opened[0]!, openings[0]);
        expect(await again.heard(`window ${openings[1]}`)).toBe(true);
        again.close();
        second.close();
    });

    it("lets go at once of an opening whose window will never reach the table, as no browser started or only a tab did: the next chesspal opens its own", async () => {
        for (const how of ["tab", "none"] as const) {
            const context = homeContext();
            const { launcher, openings } = inProcess(context, how);

            await openTable(context, launcher);
            await openTable(context, launcher);
            expect(openings, how).toHaveLength(2);
        }
    });

    it("asks a table of another version to quit, and starts its own in its place", async () => {
        const context = homeContext();
        const folder = tableFolder(context.home());
        let quitAsked = false;
        const older = createServer((asked, answer) => {
            // It quits only when asked as chesspal asks: a POST of JSON to its quit route.
            const quit = asked.method === "POST" && asked.url === "/api/table/quit" && asked.headers["content-type"] === "application/json";
            answer.end(quit ? "{}" : JSON.stringify({ session: null, folder, open: false, version: "0.0.1", table: true }));

            if (quit) {
                quitAsked = true;
                older.close();
                older.closeAllConnections();
            }
        });
        // The first of the table's ports that no other page of this computer holds.
        let free = false;

        for (const port of pagePorts(folder)) {
            if (!free) {
                free = await listenedOn(older, port);
            }
        }

        const { launcher, opened, starts } = inProcess(context);

        await openTable(context, launcher);
        expect(quitAsked).toBe(true);
        expect(starts()).toBe(1);
        expect(await pageAt(portOf(opened[0]!))).toMatchObject({ version, table: true });
    });

    it("starts the table with chesspal's own command line, in a process of its own, until it is asked to quit", async () => {
        const context = homeContext();
        const before = process.env.CHESSPAL_HOME;
        process.env.CHESSPAL_HOME = context.home();
        const cli = join(import.meta.dirname, "..", "src", "cli", "cli.ts");
        const opened: string[] = [];
        const launcher = { ...processLauncher("linux", ["--experimental-strip-types", "--no-warnings", cli]), open: (url: string) => Promise.resolve(opened.push(url) > 0 ? "window" : "none") } satisfies TableLauncher;

        try {
            await openTable(context, launcher);
            expect(await pageAt(portOf(opened[0]!))).toMatchObject({ table: true, version });
        } finally {
            if (before === undefined) {
                delete process.env.CHESSPAL_HOME;
            } else {
                process.env.CHESSPAL_HOME = before;
            }

            // The table started, even when chesspal failed after it: none stays behind for five minutes.
            for (const port of pagePorts(tableFolder(context.home()))) {
                const url = `http://127.0.0.1:${port}/`;
                await post(url, "/api/table/quit");
                await gone(url);
            }
        }
    }, 20_000);
});

/** A context on a temporary data folder, with the real time: the table's idle time is measured with it. */
function homeContext(): Context
{
    const folder = mkdtempSync(join(tmpdir(), "chesspal-table-"));
    folders.push(folder);
    return { ...testContext(folder), now: () => new Date() };
}

async function started(context: Context, times = patient): Promise<Table>
{
    const table = await startTable(context, times);

    if (table === undefined) {
        throw new Error("The table did not start: another one holds its ports.");
    }

    tables.push(table);
    return table;
}

/** A table on a data folder of its own, with a port free. */
function freshTable(times = patient): Promise<{ context: Context; table: Table; }>
{
    return onFreePorts(async () => {
        const context = homeContext();
        return { context, table: await started(context, times) };
    });
}

/**
 * A launcher that starts the table in this process, and opens no browser, though it says it opened as `how` says: the addresses it was asked to open with
 * their openings, and how many tables it started.
 */
function inProcess(context: Context, how: Opened = "window"): { launcher: TableLauncher; opened: string[]; openings: (number | undefined)[]; starts: () => number; }
{
    const opened: string[] = [];
    const openings: (number | undefined)[] = [];
    let starts = 0;
    const launcher: TableLauncher = {
        start: () => {
            starts++;
            void started(context);
        },
        open: (url, opening) => {
            openings.push(opening);
            opened.push(url);
            return Promise.resolve(how);
        },
        wait: (milliseconds) => new Promise((done) => setTimeout(done, milliseconds)),
    };
    return { launcher, opened, openings, starts: () => starts };
}

/** A window the table opened, listening to its events with its opening: whether it hears an event within five seconds, as `until` waits elsewhere, and closing it. */
function tableWindow(url: string, opening: number | undefined): Promise<{ heard: (data: string) => Promise<boolean>; close: () => void; }>
{
    return new Promise((done) => {
        const said: string[] = [];
        const events = get(new URL(`/api/events?window=${opening}`, url), (response) => {
            response.setEncoding("utf8");
            response.on("data", (chunk: string) => said.push(chunk));
            done({
                heard: async (data) => {
                    for (let waited = 0; waited < 5_000; waited += 20) {
                        if (
                            said.join("").includes(`data: ${data}
`)
                        ) {
                            return true;
                        }

                        await new Promise((later) => setTimeout(later, 20));
                    }

                    return false;
                },
                close: () => events.destroy(),
            });
        });
    });
}

function portOf(url: string): number
{
    return Number(new URL(url).port);
}

function status(url: string): Promise<number | undefined>
{
    return new Promise((done) =>
        get(url, (response) => {
            response.resume();
            done(response.statusCode);
        }).on("error", () => done(undefined))
    );
}

/** A POST of JSON to a route of the page, with the origin of the page that sends it, none as from chesspal: the answer's status. */
function post(url: string, path: string, origin?: string): Promise<number | undefined>
{
    return new Promise((done) => {
        const headers = { "Content-Type": "application/json", ...(origin === undefined ? {} : { Origin: origin }) };
        const asked = request(new URL(path, url), { method: "POST", headers }, (response) => {
            response.resume();
            done(response.statusCode);
        });
        asked.on("error", () => done(undefined));
        asked.end("{}");
    });
}

/** A browser's page that listens to the game's changes: the table counts it as open while it does. */
function listening(url: string): Promise<ClientRequest>
{
    return new Promise((done) => {
        const events = get(new URL("/api/events", url), () => done(events));
    });
}

/**
 * A data folder whose table's ports are all held by servers of this test, another program's to the table: a port a page of another test holds might be
 * freed before the table starts, so a new folder is taken until this test holds the three.
 */
async function allPortsHeld(tries = 20): Promise<{ context: Context; others: Server[]; }>
{
    for (let tried = 1;; tried++) {
        const context = homeContext();
        const ports = pagePorts(tableFolder(context.home()));
        const others = ports.map(() => createServer((_, answer) => answer.end()));
        const held = await Promise.all(others.map((other, index) => listenedOn(other, ports[index]!)));

        if (held.every(Boolean)) {
            return { context, others };
        }

        others.forEach((other) => other.close());

        if (tried === tries) {
            throw new Error("Pages of other tests hold a port of every data folder tried: run this test alone.");
        }
    }
}

/** Whether a server could listen on a port of this computer: false when another holds it. */
function listenedOn(server: Server, port: number): Promise<boolean>
{
    return new Promise((done) => {
        server.once("error", () => done(false));
        server.listen(port, "127.0.0.1", () => done(true));
    });
}

async function gone(url: string): Promise<void>
{
    for (let tried = 0; tried < 50 && await pageAt(portOf(url)) !== undefined; tried++) {
        await new Promise((done) => setTimeout(done, 100));
    }
}
