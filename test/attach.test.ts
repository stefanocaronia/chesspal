import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, get, type Server } from "node:http";
import type { Socket } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Context } from "../src/commands/index.ts";
import { status } from "../src/commands/status.ts";
import { aiNameOf } from "../src/core/index.ts";
import { noteAiModel, saveTableTalk, type TableTalk, talkLine } from "../src/games/index.ts";
import { tableFolder } from "../src/home/index.ts";
import { gameFolder } from "../src/profiles/index.ts";
import { bellHeard, pageAt, pagePorts } from "../src/server/bell.ts";
import { type Page, startPage } from "../src/server/page/page.ts";
import { attachTable, startTable, type Table } from "../src/server/table/index.ts";
import { version } from "../src/version.ts";
import { testContext } from "./commands.ts";

const folders: string[] = [];
const tables: Table[] = [];
const pages: Page[] = [];

afterEach(async () => {
    await Promise.all(pages.splice(0).map((page) => page.close()));
    await Promise.all(tables.splice(0).map((table) => table.close()));
    folders.splice(0).forEach((folder) => rmSync(folder, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
});

describe("a chat at the table", () => {
    it("attaches to the table of its data folder, whose probe then names the chat's folder and session", async () => {
        const { home, table } = await tableOn();
        const chat = chatOn(home);
        const page = await attached(chat);

        expect(page.url).toBe(table.url);
        expect(await pageAt(portOf(table.url))).toMatchObject({ table: true, chat: resolve(chat.folder), session: process.env.CLAUDE_CODE_SESSION_ID ?? null });
    });

    it("tells the table it calls a tool and what it saw: the page shows it listens and names the AI by its host; it hears when a browser has the page open", async () => {
        const { home, table } = await tableOn();
        const chat = { ...chatOn(home), host: () => "claude-code" };
        const page = await attached(chat);
        const events = await listening(table.url);

        try {
            await page.chatCalls();
            page.toolEnded();
            await until(async () => (await gameShown(table.url)).opponent !== undefined);

            expect(page.open()).toBe(true);
            expect(await gameShown(table.url)).toMatchObject({ opponent: aiNameOf("claude-code"), listening: true });
        } finally {
            events.destroy();
        }
    });

    it("is refused while another chat is at the table: that one serves its own page", async () => {
        const { home } = await tableOn();
        await attached(chatOn(home));

        expect(await attachTable(chatOn(home), () => undefined)).toBeUndefined();
    });

    it("finds no table of another data folder", async () => {
        await tableOn();

        expect(await attachTable(chatOn(temporary()), () => undefined)).toBeUndefined();
    });

    it("leaves the table nobody's when the chat goes, and the hook waiting at it is let go", async () => {
        const { home, table } = await tableOn();
        const chat = chatOn(home);
        const page = await attached(chat);
        const before = process.env.CHESSPAL_HOME;
        process.env.CHESSPAL_HOME = home;

        try {
            // The chat's folder serves no page: the hook finds the chat at the table, by its folder.
            const hook = bellHeard(JSON.stringify({ cwd: chat.folder }));
            await until(async () => (await gameShown(table.url)).listening === true);
            await page.close();

            expect(await hook).toEqual({ folder: resolve(chat.folder), rang: false, why: `the page at port ${portOf(table.url)} said "dismissed"` });
            expect(await pageAt(portOf(table.url))).toMatchObject({ table: true, session: null });
            expect(await pageAt(portOf(table.url))).not.toHaveProperty("chat");
        } finally {
            restore("CHESSPAL_HOME", before);
        }
    });

    it("has the hook find the table through the data folder the chat's server is given in Claude Code's settings or Codex's, not the host's", async () => {
        const { home, table } = await tableOn();
        const claude = chatOn(home);
        writeFileSync(join(claude.folder, ".mcp.json"), JSON.stringify({ mcpServers: { chesspal: { command: "chesspal", args: ["mcp"], env: { CHESSPAL_HOME: home } } } }));
        const codex = chatOn(home);
        mkdirSync(join(codex.folder, ".codex"));
        writeFileSync(join(codex.folder, ".codex", "config.toml"), `[mcp_servers.chesspal]\ncommand = "chesspal"\nenv = { CHESSPAL_HOME = '${home}' }\n`);
        const before = process.env.CHESSPAL_HOME;
        process.env.CHESSPAL_HOME = temporary();

        try {
            for (const chat of [claude, codex]) {
                const page = await attached(chat);
                const hook = bellHeard(JSON.stringify({ cwd: chat.folder }));
                await until(async () => (await gameShown(table.url)).listening === true);
                await page.close();

                expect(await hook).toMatchObject({ rang: false, why: `the page at port ${portOf(table.url)} said "dismissed"` });
                await until(async () => (await pageAt(portOf(table.url)))?.chat === undefined);
            }
        } finally {
            restore("CHESSPAL_HOME", before);
        }
    });

    it("hears when the table is gone, and attaches again to the next", async () => {
        const { home, table } = await tableOn();
        let lost = 0;
        const page = await attachTable(chatOn(home), () => lost++);
        pages.push(page!);
        await table.close();
        await until(() => Promise.resolve(lost > 0));

        expect(lost).toBe(1);
        await tableOn(home);
        expect(await attachTable(chatOn(home), () => undefined)).toBeDefined();
    });

    it("loses a table that takes it and then stops answering, within seconds, and its tool goes on", async () => {
        const home = temporary();
        const frozen = await fakeTable(home, version, "frozen");
        let lost = 0;

        try {
            const page = await attachTable(chatOn(home), () => lost++);
            pages.push(page!);
            const started = Date.now();
            await page!.chatCalls();

            expect(lost).toBe(1);
            expect(Date.now() - started).toBeLessThan(3_000);
        } finally {
            frozen.server.close();
            frozen.server.closeAllConnections();
        }
    }, 10_000);

    it("stays at a table that failed one request, and loses one that no longer knows it", async () => {
        const home = temporary();
        const failing = await fakeTable(home, version, "fails");
        let lost = 0;

        try {
            const page = await attachTable(chatOn(home), () => lost++);
            pages.push(page!);
            await page!.chatCalls();
            await page!.chatCalls();

            expect(failing.calls()).toBe(2);
            expect(lost).toBe(0);
        } finally {
            failing.server.close();
            failing.server.closeAllConnections();
        }

        const other = temporary();
        const forgetting = await fakeTable(other, version, "forgets");
        let forgotten = 0;

        try {
            const page = await attachTable(chatOn(other), () => forgotten++);
            pages.push(page!);
            await page!.chatCalls();

            expect(forgotten).toBe(1);
        } finally {
            forgetting.server.close();
            forgetting.server.closeAllConnections();
        }
    });

    it("asks again on a new connection when the table has just closed the one kept, and stays", async () => {
        const home = temporary();
        const dropping = await fakeTable(home, version, "drops-kept");
        let lost = 0;

        try {
            const page = await attachTable(chatOn(home), () => lost++);
            pages.push(page!);
            await page!.chatCalls();
            await page!.chatCalls();

            expect(dropping.calls()).toBe(3);
            expect(lost).toBe(0);
            expect(page!.open()).toBe(true);
        } finally {
            dropping.server.close();
            dropping.server.closeAllConnections();
        }
    });

    it("sends the words the chat was given, which the page shows read, and its news, which the pages hear", async () => {
        const { home, table } = await tableOn();
        const chat = chatOn(home);
        const empty: TableTalk = { started: new Date().toISOString(), talk: [] };
        saveTableTalk(gameFolder(chat.home()), { ...empty, talk: [talkLine(empty, "player", "Ciao!", new Date())] });
        const page = await attached(chat);
        expect(await gameShown(table.url)).toMatchObject({ talk: [{ heard: "sent" }] });

        await status.run(status.input.parse({}), chat);
        page.toolEnded();
        await until(async () => (await gameShown(table.url)).talk?.[0]?.heard === "read");

        let heard = 0;
        const events = await listening(table.url, () => heard++);

        try {
            const before = heard;
            page.heard();
            await until(() => Promise.resolve(heard > before));
        } finally {
            events.destroy();
        }
    });

    it("forgets who played as the AI when the chat leaves: the next may be another", async () => {
        const { home, table } = await tableOn();
        const chat = chatOn(home);
        const page = await attached(chat);
        noteAiModel(gameFolder(chat.home()), { model: "claude-opus-5-5" });
        expect(await gameShown(table.url)).toMatchObject({ aiModel: { model: "claude-opus-5-5" } });

        await page.close();
        await until(async () => (await gameShown(table.url)).aiModel === undefined);
    });

    it("has the hook of the chat at the table wait there, and the hook of another chat of its folder at that chat's own page", async () => {
        const { home, table } = await tableOn();
        const folder = temporary();
        const before = { home: process.env.CHESSPAL_HOME, session: process.env.CLAUDE_CODE_SESSION_ID };
        process.env.CHESSPAL_HOME = home;
        const hook = (session: string): Promise<unknown> => bellHeard(JSON.stringify({ cwd: folder, session_id: session }));

        try {
            process.env.CLAUDE_CODE_SESSION_ID = "at-the-table";
            await attached({ ...chatOn(home), folder });
            process.env.CLAUDE_CODE_SESSION_ID = "on-its-page";
            const own = await startPage({ ...chatOn(home), folder });
            pages.push(own);
            const atTable = hook("at-the-table");
            const onItsPage = hook("on-its-page");
            await until(async () => (await gameShown(table.url)).listening === true && (await gameShown(own.url)).listening === true);
            // The next hook of each chat lets the one before go, which says where it waited.
            void hook("at-the-table");
            void hook("on-its-page");

            expect(await atTable).toMatchObject({ rang: false, why: `the page at port ${portOf(table.url)} said "dismissed"` });
            expect(await onItsPage).toMatchObject({ rang: false, why: `the page at port ${portOf(own.url)} said "dismissed"` });
        } finally {
            restore("CHESSPAL_HOME", before.home);
            restore("CLAUDE_CODE_SESSION_ID", before.session);
        }
    });

    it("asks an older table to quit, and leaves a newer one be: either way it serves its own page", async () => {
        const home = temporary();
        const older = await fakeTable(home, "0.0.1");
        const newer = await fakeTable(home, "99.0.0");

        try {
            expect(await attachTable(chatOn(home), () => undefined)).toBeUndefined();
            expect(older.quitAsked()).toBe(true);
            expect(await attachTable(chatOn(home), () => undefined)).toBeUndefined();
            expect(newer.quitAsked()).toBe(false);
        } finally {
            older.server.close();
            newer.server.close();
        }
    });

    it("attaches from the MCP server a host starts, at its first tool, and leaves when the host goes", async () => {
        const { home, table } = await tableOn();
        const folder = temporary();
        const server = mcpServer(folder, home);

        try {
            expect(await server.call("status")).toContain(table.url);
            expect(await pageAt(portOf(table.url))).toMatchObject({ chat: resolve(folder), session: "a-chat" });
        } finally {
            await server.close();
        }

        await until(async () => (await pageAt(portOf(table.url)))?.chat === undefined);
        expect(await pageAt(portOf(table.url))).toMatchObject({ session: null });
    }, 20_000);

    it("serves its own page from the MCP server while no table answers, and goes to one started since at a tool after", async () => {
        const home = temporary();
        const folder = temporary();
        const server = mcpServer(folder, home);

        try {
            const first = await server.call("status");
            const { table } = await tableOn(home);

            expect(first).not.toContain(table.url);
            // The look for a table comes after a tool, the move to it at the next one.
            await until(async () => (await server.call("status")).includes(table.url) && (await pageAt(portOf(table.url)))?.chat !== undefined, 10_000);
            expect(await pageAt(portOf(table.url))).toMatchObject({ chat: resolve(folder) });
        } finally {
            await server.close();
        }
    }, 30_000);
});

/** A table on a temporary data folder, with the real time. */
async function tableOn(home = temporary()): Promise<{ home: string; table: Table; }>
{
    const table = await startTable(homeContext(home), { idle: 60_000, every: 10 });

    if (table === undefined) {
        throw new Error("The table did not start: another one holds its ports.");
    }

    tables.push(table);
    return { home, table };
}

/** A chat in a folder of its own, on the data folder given. */
function chatOn(home: string): Context
{
    return { ...testContext(temporary()), home: homeContext(home).home };
}

async function attached(chat: Context): Promise<Page>
{
    const page = await attachTable(chat, () => undefined);

    if (page === undefined) {
        throw new Error("The chat did not attach to the table.");
    }

    pages.push(page);
    return page;
}

/** `chesspal mcp` as a host starts it, in a player's folder on a data folder: its tools called one at a time, with what each answered. */
function mcpServer(folder: string, home: string): { call: (name: string) => Promise<string>; close: () => Promise<void>; }
{
    const cli = join(import.meta.dirname, "..", "src", "cli", "cli.ts");
    const env = { ...process.env, CHESSPAL_HOME: home, CLAUDE_CODE_SESSION_ID: "a-chat" };
    const server = spawn(process.execPath, ["--experimental-strip-types", "--no-warnings", cli, "mcp"], { stdio: ["pipe", "pipe", "pipe"], cwd: folder, env });
    const exited = new Promise((done) => server.on("exit", done));
    let stdout = "";
    let stderr = "";
    let id = 1;
    server.stdout.on("data", (chunk: Buffer) => (stdout += String(chunk)));
    server.stderr.on("data", (chunk: Buffer) => (stderr += String(chunk)));
    const send = (message: object): void => void server.stdin.write(`${JSON.stringify(message)}\n`);
    // The lines written whole, the last one cut until its end comes.
    const answer = (asked: number): string | undefined => stdout.split("\n").slice(0, -1).find((line) => (JSON.parse(line) as { id?: number; }).id === asked);
    send({ jsonrpc: "2.0", id, method: "initialize", params: { protocolVersion: LATEST_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "test", version: "1.0.0" } } });
    return {
        call: async (name) => {
            const asked = ++id;
            send({ jsonrpc: "2.0", id: asked, method: "tools/call", params: { name, arguments: {} } });
            // What the server wrote on stderr says why it did not answer.
            await until(() => Promise.resolve(answer(asked) !== undefined), 15_000).catch((error: unknown) => {
                throw new Error(`${(error as Error).message} The server wrote: ${stderr}`);
            });
            return answer(asked) ?? "";
        },
        close: async () => {
            server.stdin.end();
            await exited;
        },
    };
}

function homeContext(home: string): Context
{
    return { ...testContext(home), now: () => new Date() };
}

function temporary(): string
{
    const folder = mkdtempSync(join(tmpdir(), "chesspal-attach-"));
    folders.push(folder);
    return folder;
}

/**
 * How a fake table answers the chat it takes: never again; with 500, a request it failed; with 409, as a table that no longer knows the chat; or by closing
 * each kept connection as the chat's next request comes on it, as one idle for 5 s.
 */
type FakeChat = "frozen" | "fails" | "forgets" | "drops-kept";

/** A table of a version on the first of the table's ports that is free: whether it was asked to quit, and how many calls of the chat's it had. */
async function fakeTable(home: string, other: string, chat?: FakeChat): Promise<{ server: Server; quitAsked: () => boolean; calls: () => number; }>
{
    const folder = tableFolder(home);
    let asked = false;
    let calls = 0;
    const requestsOn = new WeakMap<Socket, number>();
    // It quits when asked, as a table does.
    const server = createServer((request, answer) => {
        if (chat !== undefined && request.url?.startsWith("/api/chat") === true) {
            request.resume();
            const before = requestsOn.get(request.socket) ?? 0;
            requestsOn.set(request.socket, before + 1);

            if (request.url === "/api/chat") {
                answer.writeHead(200).write(`${JSON.stringify({ token: "fake", open: false })}\n`);
                return;
            }

            calls++;

            if (chat === "fails" || chat === "forgets") {
                answer.writeHead(chat === "fails" ? 500 : 409).end("{}");
            } else if (chat === "drops-kept" && before > 0) {
                request.socket.destroy();
            } else if (chat === "drops-kept") {
                answer.writeHead(200).end(JSON.stringify({ open: true }));
            }

            return;
        }

        const quit = request.method === "POST" && request.url === "/api/table/quit";
        answer.end(JSON.stringify({ session: null, folder, open: false, version: other, table: true }));

        if (quit) {
            asked = true;
            server.close();
            server.closeAllConnections();
        }
    });

    for (const port of pagePorts(folder)) {
        const listened = await new Promise<boolean>((done) => {
            server.once("error", () => done(false));
            server.listen(port, "127.0.0.1", () => done(true));
        });

        if (listened) {
            return { server, quitAsked: () => asked, calls: () => calls };
        }
    }

    throw new Error("Every port of the table is taken.");
}

function gameShown(url: string): Promise<{ opponent?: string; listening?: boolean; talk?: { heard?: string; }[]; aiModel?: { model: string; }; }>
{
    return new Promise((done, failed) => {
        get(new URL("/api/game", url), (response) => {
            let text = "";
            response.on("data", (chunk: Buffer) => (text += String(chunk)));
            response.on("end", () => done(JSON.parse(text) as never));
        }).on("error", failed);
    });
}

/** A browser listening to the page's changes, told of each. */
function listening(url: string, told: () => void = () => undefined): Promise<ReturnType<typeof get>>
{
    return new Promise((done) => {
        const events = get(new URL("/api/events", url), (response) => {
            response.on("data", told);
            done(events);
        });
    });
}

async function until(condition: () => Promise<boolean>, wait = 5_000): Promise<void>
{
    const end = Date.now() + wait;

    while (!(await condition())) {
        if (Date.now() > end) {
            throw new Error("What the test waited for did not come.");
        }

        await new Promise((done) => setTimeout(done, 20));
    }
}

function portOf(url: string): number
{
    return Number(new URL(url).port);
}

function restore(name: string, value: string | undefined): void
{
    if (value === undefined) {
        delete process.env[name];
    } else {
        process.env[name] = value;
    }
}
