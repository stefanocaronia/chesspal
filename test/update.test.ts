import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { get, request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { commands, type Context } from "../src/commands/index.ts";
import { tableFolder } from "../src/home/index.ts";
import { type Page, startPage } from "../src/server/page/page.ts";
import { latestVersion } from "../src/server/page/update.ts";
import { npmInstall, startTable, type Table, type TableUpdater } from "../src/server/table/index.ts";
import { isOlder, version } from "../src/version.ts";
import { testContext } from "./commands.ts";
import { removeFolder } from "./folders.ts";
import { onFreePorts } from "./ports.ts";

const folders: string[] = [];
const pages: Page[] = [];
const tables: Table[] = [];

afterEach(async () => {
    await Promise.all([...pages.splice(0).map((page) => page.close()), ...tables.splice(0).map((table) => table.close())]);
    await Promise.all(folders.splice(0).map(removeFolder));
});

describe("a newer Chesspal on npm", () => {
    it("is read from npm's latest release, and none when npm answers something else or not at all", async () => {
        expect(await latestVersion(npm({ version: "9.1.0" }))).toBe("9.1.0");
        expect(await latestVersion(npm({ version: "9.1.0-beta.1" }))).toBeUndefined();
        expect(await latestVersion(npm({ version: "9.1.0 && calc" }))).toBeUndefined();
        expect(await latestVersion(npm({ error: "Not found" }, 404))).toBeUndefined();
        expect(await latestVersion(() => Promise.reject(new Error("offline")))).toBeUndefined();
    });

    it("is shown on the page when npm has one newer than this, and not when npm has this one", async () => {
        const newer = await pageWith(npm({ version: "99.0.0" }));
        const same = await pageWith(npm({ version }));

        expect(await shownWhen(newer, (shown) => shown.update !== undefined)).toMatchObject({ update: { version: "99.0.0" } });
        expect((await gameShown(same)).update).toBeUndefined();
    });

    it("compares versions part by part", () => {
        expect(isOlder("0.2.4", "0.10.0")).toBe(true);
        expect(isOlder("0.10.0", "0.2.4")).toBe(false);
        expect(isOlder("1.0.0", "1.0.0")).toBe(false);
    });

    it("is installed from the table's own page between games: the table closes and a new one starts from it", async () => {
        const { table, installs, startsAgain } = await tableWith(true);
        await shownWhen(table, (shown) => shown.update !== undefined);

        expect(await update(table.url, "http://example.com")).toMatchObject({ status: 403 });
        expect(await update(table.url)).toEqual({ status: 200, body: { installed: true } });
        await table.closed;
        expect(installs).toEqual(["99.0.0"]);
        expect(startsAgain()).toBe(1);
    });

    it("leaves the table as it is when npm did not install it, and the page gives the command to type", async () => {
        const { table, installs, startsAgain } = await tableWith(false);
        await shownWhen(table, (shown) => shown.update !== undefined);

        expect(await update(table.url)).toEqual({ status: 200, body: { installed: false } });
        expect(installs).toEqual(["99.0.0"]);
        expect(await gameShown(table)).toMatchObject({ update: { version: "99.0.0" } });
        expect(startsAgain()).toBe(0);
    });

    it("is not installed while a game goes on, nor when npm has none newer", async () => {
        const { context, table, installs } = await tableWith(true);
        await shownWhen(table, (shown) => shown.update !== undefined);
        await run(context, "new_game", { ai_colour: "black" });

        expect(await update(table.url)).toMatchObject({ status: 409, body: { refusal: "update-game" } });

        const latest = await tableWith(true, version);
        expect(await update(latest.table.url)).toMatchObject({ status: 409 });
        expect([...installs, ...latest.installs]).toEqual([]);
    });

    it("starts the table again only once the game started while npm worked has ended", async () => {
        let finish = (_installed: boolean): void => undefined;
        const { context, table, startsAgain } = await tableWith(new Promise((done) => finish = done));
        await shownWhen(table, (shown) => shown.update !== undefined);
        const asked = update(table.url);
        await shownWhen(table, (shown) => updateIn(shown)?.installing === true);
        await run(context, "new_game", { ai_colour: "black" });
        finish(true);

        expect(await asked).toEqual({ status: 200, body: { installed: true } });
        expect(updateIn(await shownWhen(table, (shown) => updateIn(shown)?.installed === true))).toEqual({ version: "99.0.0", installed: true });
        expect(startsAgain()).toBe(0);

        await run(context, "end_game", { result: "player_resigns" });
        await table.closed;
        expect(startsAgain()).toBe(1);
    });

    it("installs only a plain release with npm, without calling npm for anything else", async () => {
        const install = npmInstall(homeContext(), () => "0.0.0", fakeNpm(0));

        expect(await install("1.0.0 & calc")).toBe(false);
        expect(await install("1.0.0-beta")).toBe(false);
    });

    it("trusts npm only when the version it installed is the one on disk, and notes what npm said when it failed", async () => {
        // This machine's platform: on Windows npm goes through cmd.
        const context = { ...homeContext(), platform: process.platform };

        expect(await npmInstall(context, () => "99.0.0", fakeNpm(0))("99.0.0")).toBe(true);
        expect(await npmInstall(context, () => "98.0.0", fakeNpm(0))("99.0.0")).toBe(false);
        expect(await npmInstall(context, () => "99.0.0", fakeNpm(1))("99.0.0")).toBe(false);
        expect(readFileSync(join(tableFolder(context.home()), "update.log"), "utf8")).toMatch(/npm install --global chesspal@99\.0\.0: exit code 1\s+npm said no/);
    });
});

/** The environment of an npm of our own, the only one on the PATH, which says no on stderr and ends with `code`: never the real one. */
function fakeNpm(code: number): NodeJS.ProcessEnv
{
    const folder = mkdtempSync(join(tmpdir(), "chesspal-npm-"));
    folders.push(folder);

    if (process.platform === "win32") {
        writeFileSync(join(folder, "npm.cmd"), `@echo off\r\necho npm said no 1>&2\r\nexit /b ${code}\r\n`);
    } else {
        writeFileSync(join(folder, "npm"), `#!/bin/sh\necho "npm said no" >&2\nexit ${code}\n`, { mode: 0o755 });
    }

    const path = Object.keys(process.env).find((name) => name.toUpperCase() === "PATH") ?? "PATH";
    return { ...process.env, [path]: folder };
}

/** Runs a command as the chat would, on the table's data folder. */
async function run(context: Context, name: string, input: Record<string, unknown>): Promise<void>
{
    const command = commands.find((one) => one.name === name)!;
    await command.run(command.input.parse(input), context);
}

function updateIn(shown: Record<string, unknown>): { version?: string; installing?: boolean; installed?: boolean; } | undefined
{
    return shown.update as { version?: string; installing?: boolean; installed?: boolean; } | undefined;
}

/** npm's registry as a fetch: what it answers, with its status. */
function npm(body: object, status = 200): typeof globalThis.fetch
{
    return () => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

/** A context on a temporary data folder, with the real time. */
function homeContext(fetch?: typeof globalThis.fetch): Context
{
    const folder = mkdtempSync(join(tmpdir(), "chesspal-update-"));
    folders.push(folder);
    return { ...testContext(folder), now: () => new Date(), ...(fetch === undefined ? {} : { fetch }) };
}

/** A chat's own page, whose server asks npm with this fetch. */
async function pageWith(fetch: typeof globalThis.fetch): Promise<Page>
{
    const page = await startPage(homeContext(fetch));
    pages.push(page);
    return page;
}

/** A table whose npm has `latest` and installs it or not, once asked: the versions it was asked to install, and how many tables started after it. */
async function tableWith(installed: boolean | Promise<boolean>, latest = "99.0.0"): Promise<{ context: Context; table: Table; installs: string[]; startsAgain: () => number; }>
{
    const installs: string[] = [];
    let starts = 0;
    const updater: TableUpdater = {
        install: (asked) => {
            installs.push(asked);
            return Promise.resolve(installed);
        },
        startAgain: () => {
            starts++;
        },
    };
    return onFreePorts(async () => {
        const context = homeContext(npm({ version: latest }));
        const table = await startTable(context, { idle: 60_000, every: 10 }, undefined, updater);

        if (table === undefined) {
            throw new Error("The table did not start: another one holds its ports.");
        }

        tables.push(table);
        return { context, table, installs, startsAgain: () => starts };
    });
}

/** What /api/game says, once it says what `until` waits for, or after a second. */
async function shownWhen(page: { url: string; }, until: (shown: Record<string, unknown>) => boolean): Promise<Record<string, unknown>>
{
    let shown = await gameShown(page);

    for (let tried = 0; tried < 50 && !until(shown); tried++) {
        await new Promise((done) => setTimeout(done, 20));
        shown = await gameShown(page);
    }

    return shown;
}

function gameShown(page: { url: string; }): Promise<Record<string, unknown>>
{
    return new Promise((done, failed) => {
        // A connection of its own: a table of an earlier test may have held this port, and closed the one kept alive.
        get(new URL("/api/game", page.url), { agent: false }, (response) => {
            let body = "";
            response.on("data", (chunk: Buffer) => body += chunk.toString());
            response.on("end", () => done(JSON.parse(body) as Record<string, unknown>));
        }).on("error", failed);
    });
}

/** Asks the table to update Chesspal, as its page does, from the origin given, else the page's own: the answer's status and body. */
function update(url: string, origin = new URL(url).origin): Promise<{ status: number | undefined; body: unknown; }>
{
    return new Promise((done, failed) => {
        const asked = request(new URL("/api/table/update", url), { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, agent: false }, (response) => {
            let body = "";
            response.on("data", (chunk: Buffer) => body += chunk.toString());
            // A request from another origin is refused before any route, in a line of text.
            response.on("end", () => done({ status: response.statusCode, body: response.headers["content-type"]?.includes("json") === true ? JSON.parse(body) as unknown : body }));
        });
        asked.on("error", failed);
        asked.end("{}");
    });
}
