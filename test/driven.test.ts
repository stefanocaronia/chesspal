import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { ReadBuffer, serializeMessage } from "@modelcontextprotocol/sdk/shared/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { newGame, startNewGame } from "../src/commands/game/new.ts";
import type { Context } from "../src/commands/index.ts";
import { loadGame, positionShownNote } from "../src/games/index.ts";
import { tableFolder } from "../src/home/index.ts";
import type { ChatOptions, HostChat, HostDriver, HostEvent } from "../src/hosts/index.ts";
import { activeProfile, gameFolder, saveProfileSettings } from "../src/profiles/index.ts";
import { Bell, type BellListener } from "../src/server/bell/index.ts";
import { doorVariable, keyVariable, pipeToTable } from "../src/server/door/index.ts";
import { chatInPage, drivenChats, keptChat } from "../src/server/driven/index.ts";
import type { TableChats } from "../src/server/page/index.ts";
import { tablePlaces } from "../src/server/places/index.ts";
import { startTable, type Table } from "../src/server/table/index.ts";
import { version } from "../src/version.ts";
import { playedHere, testContext } from "./commands.ts";
import { removeFolder } from "./folders.ts";
import { sent } from "./http.ts";
import { onFreePorts } from "./ports.ts";

const folders: string[] = [];
const tables: Table[] = [];
const clients: Client[] = [];

afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close().catch(() => undefined)));
    await Promise.all(tables.splice(0).map((table) => table.close()));
    await Promise.all(folders.splice(0).map(removeFolder));
});

describe("the doorbell with a listener of the table's own", () => {
    it("rings at once a listener for a ring it missed, lets one go for the next, and hears when one goes without it", () => {
        const bell = new Bell(() => true, () => undefined, () => false, () => undefined, () => "the game");
        const heard: string[] = [];
        const listener = (name: string): BellListener => ({ hear: (said) => void heard.push(`${name} ${said}`), dismissed: () => void heard.push(`${name} dismissed`) });

        bell.ring();
        bell.wait(listener("first"));
        expect(heard).toEqual(["first ring\nthe game"]);
        expect(bell.inTurn).toBe(true);

        bell.wait(listener("second"));
        bell.wait(listener("third"));
        expect(heard.at(-1)).toBe("second dismissed");
        expect([bell.listening, bell.inTurn]).toEqual([true, false]);

        bell.chatPrompted();
        expect(heard.at(-1)).toBe("third dismissed");

        const gone = bell.wait(listener("fourth"));
        gone();
        expect([bell.listening, bell.deaf]).toEqual([false, true]);
        bell.ring();
        expect(heard.at(-1)).toBe("third dismissed");
    });
});

describe("the chat the table drives", () => {
    it("plays a game through its place: attached, held, moved by the bell with the game, the player's words once, a move written alone, stopped and woken", async () => {
        const { table, home, ai } = await drivenTable();
        expect(await opened(table.url)).toEqual({ status: 200, text: JSON.stringify({ opened: true }) });
        await until(() => ai.chats.length === 1 && ai.chats[0]!.idle());
        const chat = ai.chats[0]!;

        expect(chat.options).toMatchObject({ model: "sonnet", effort: "medium", allowed: ["chesspal"], folder: join(tableFolder(home), "chats", "opponent") });
        expect(chat.options.server).toMatchObject({ name: "chesspal", command: "node", args: ["cli.js", "mcp"] });
        expect(Object.keys(chat.options.server!.environment).sort()).toEqual([doorVariable, keyVariable].sort());
        expect(chat.sent).toEqual(["Let's play!"]);
        expect(chat.calls).toEqual(["instructions", "status"]);
        expect((await shown(table.url)).table).toMatchObject({ chat: true, host: "claude", held: true, started: { model: "sonnet", effort: "medium" }, driven: true });

        // A new game: the chat, which has only greeted the player, hears it from the bell.
        expect((await posted(table.url, "/api/new", { ai_colour: "black" })).status).toBe(200);
        await until(() => chat.sent.length === 2 && chat.idle());
        expect(ai.chats).toHaveLength(1);

        // The player moves: the bell sends the game, and the AI moves on it without status.
        chat.turns.push(async (client) => void chat.answers.push(await call(client, "ai_move", { move: "e5", plan: "Hold the centre." })));
        expect((await posted(table.url, "/api/move", { move: "e4" })).status).toBe(200);
        await until(() => chat.sent.length === 3 && chat.idle());
        expect(chat.sent[2]).toMatch(/^The player acted on the board page\. Here is the game now, as status shows it: don't call status for it, decide on it\.\n/);
        expect(chat.calls.slice(2)).toEqual(["ai_move"]);
        expect(chat.answers[0]!.isError).toBe(false);
        expect(sans(home)).toEqual(["e4", "e5"]);
        expect(existsSync(join(chat.options.folder, "position-shown.json"))).toBe(false);
        expect(positionShownNote(chat.options.folder)).toBeUndefined();
        const atRest = await shown(table.url);
        expect(atRest.thinking).toBeUndefined();
        expect(atRest.aiModel).toMatchObject({ model: "claude-sonnet", effort: "medium" });

        // The player's words reach the AI once.
        expect((await posted(table.url, "/api/message", { text: "Nice opening!" })).status).toBe(200);
        await until(() => chat.sent.length === 4 && chat.idle());
        expect(chat.sent[3]).toContain("Nice opening!");
        expect(chat.sent[3]!.split("Nice opening!")).toHaveLength(2);
        expect((await shown(table.url)).game?.talk?.find((line) => line.text === "Nice opening!")?.heard).toBeDefined();

        // A move written alone in the message box the table plays, and the bell rings for it.
        chat.turns.push(async (client) => void chat.answers.push(await call(client, "ai_move", { move: "Nc6", plan: "Develop." })));
        expect(await posted(table.url, "/api/message", { text: "Nf3" })).toEqual({ status: 200, text: JSON.stringify({ said: true, played: true }) });
        await until(() => chat.sent.length === 5 && chat.idle());
        expect(sans(home)).toEqual(["e4", "e5", "Nf3", "Nc6"]);

        // Nothing to stop at rest; a turn stopped waits at the bell, and the player's next act wakes the chat.
        expect((await posted(table.url, "/api/table/stop", {})).status).toBe(409);
        chat.turns.push(() => new Promise<void>(() => undefined));
        expect((await posted(table.url, "/api/move", { move: "Bc4" })).status).toBe(200);
        await until(() => chat.sent.length === 6 && !chat.idle());
        expect(await posted(table.url, "/api/table/stop", {})).toEqual({ status: 200, text: JSON.stringify({ stopping: true }) });
        await until(() => chat.idle());
        expect(chat.ends.at(-1)).toBe("interrupted");
        chat.turns.push(async (client) => void chat.answers.push(await call(client, "ai_move", { move: "Nf6", plan: "Develop." })));
        expect((await posted(table.url, "/api/message", { text: "Your move." })).status).toBe(200);
        await until(() => chat.sent.length === 7 && chat.idle());
        expect(sans(home).at(-1)).toBe("Nf6");
        expect(ai.chats).toHaveLength(1);
    }, 30_000);

    it("starts again clean for a new game from the page once it has played, and with the model the player changed: no /clear asked", async () => {
        const { table, home, ai } = await drivenTable();
        await opened(table.url);
        await until(() => ai.chats.length === 1 && ai.chats[0]!.idle());
        const first = ai.chats[0]!;
        await posted(table.url, "/api/new", { ai_colour: "black" });
        await until(() => first.sent.length === 2 && first.idle());
        first.turns.push(async (client) => void (await call(client, "ai_move", { move: "e5", plan: "Hold the centre." })));
        await posted(table.url, "/api/move", { move: "e4" });
        await until(() => first.sent.length === 3 && first.idle());

        expect(await posted(table.url, "/api/new", { ai_colour: "black" })).toEqual({ status: 200, text: JSON.stringify({ started: true }) });
        await until(() => ai.chats.length === 2 && ai.chats[1]!.idle());
        expect(first.closed).toBe(true);
        expect(ai.chats[1]!.options.session).toBeUndefined();
        expect(ai.chats[1]!.sent).toEqual(["Let's play!"]);
        await until(async () => (await shown(table.url)).table?.chat === true);

        // The player chooses another model on the page, and the chat starts again with it.
        saveProfileSettings(home, activeProfile(home).id, { [chatInPage]: true, claudeModel: "opus", claudeEffort: "high" });
        expect(await posted(table.url, "/api/table/restart", { host: "claude" })).toEqual({ status: 200, text: JSON.stringify({ restarting: true }) });
        await until(() => ai.chats.length === 3 && ai.chats[2]!.idle());
        expect(ai.chats[2]!.options).toMatchObject({ model: "opus", effort: "high" });
        await until(async () => (await shown(table.url)).table?.started?.model === "opus");
    }, 30_000);

    it("starts again clean when the chat itself begins a new game after a long one, in place of asking the player for /clear", async () => {
        const { table, home, ai } = await drivenTable();
        await opened(table.url);
        await until(() => ai.chats.length === 1 && ai.chats[0]!.idle());
        const chat = ai.chats[0]!;

        // A long game the chat has played, its own moves; the player's words wake it on it.
        const moves = "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7";
        startNewGame(newGame.input.parse({ ai_colour: "black", from: moves, replace: true }), { ...homeContext(home), pageOpen: () => true }, "page");
        playedHere(gameFolder(home));
        chat.turns.push(async (client) => void chat.answers.push(await call(client, "new_game", { ai_colour: "white", from: "8/8/8/4k3/8/8/4K3/7Q w - - 0 1", replace: true })));
        await posted(table.url, "/api/message", { text: "Let's start from an ending." });
        await until(() => ai.chats.length === 2 && ai.chats[1]!.idle());

        expect(chat.answers[0]).toMatchObject({ isError: false });
        expect(chat.answers[0]!.text).not.toContain("/clear");
        expect(chat.closed).toBe(true);
        expect(ai.chats[1]!.sent).toEqual(["Let's play!"]);
    }, 30_000);

    it("has a new game wait for the chat at work on a long game, then starts it again clean; after an update the next table opens a clean one", async () => {
        const { table, home, ai, chats } = await drivenTable();
        await opened(table.url);
        await until(() => ai.chats.length === 1 && ai.chats[0]!.idle());
        const chat = ai.chats[0]!;
        const moves = "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7";
        startNewGame(newGame.input.parse({ ai_colour: "black", from: moves, replace: true }), { ...homeContext(home), pageOpen: () => true }, "page");
        playedHere(gameFolder(home));
        chat.turns.push(() => new Promise<void>(() => undefined));
        await posted(table.url, "/api/message", { text: "Think it over." });
        await until(() => chat.sent.length === 2 && !chat.idle());

        expect(await posted(table.url, "/api/new", { ai_colour: "black" })).toEqual({ status: 200, text: JSON.stringify({ waiting: true }) });
        expect(ai.chats).toHaveLength(1);
        await posted(table.url, "/api/table/stop", {});
        await until(() => ai.chats.length === 2 && ai.chats[1]!.idle());
        expect(chat.closed).toBe(true);
        expect(sans(home)).toEqual([]);

        // An update asks the page for the chat of the table's folder again (D-108): it closes, and the table started next opens a clean one.
        await until(async () => (await shown(table.url)).table?.chat === true);
        expect(keptChat(tableFolder(home))?.session).toBe(ai.chats[1]!.session);
        expect(chats.relaunch(tableFolder(home), undefined, true)).toBe(true);
        expect(ai.chats[1]!.closed).toBe(true);
        expect(ai.chats).toHaveLength(2);
        expect(keptChat(tableFolder(home))).toMatchObject({ closed: false, session: undefined });
    }, 30_000);

    it("leaves the table when its host ends, and the page says why once; a table started again opens the chat again with its session", async () => {
        const { table, home, ai, context } = await drivenTable();
        await opened(table.url);
        await until(() => ai.chats.length === 1 && ai.chats[0]!.idle());
        const session = ai.chats[0]!.session;
        expect(keptChat(tableFolder(home))).toMatchObject({ host: "claude", session, closed: false });

        // The table closes, its chat with it, and starts again: once a page is open, the chat is taken up again, at rest.
        await table.close();
        expect(ai.chats[0]!.closed).toBe(true);
        const again = await drivenTable(home, ai, context);
        const page = await eventsOf(again.table.url);

        try {
            await until(() => ai.chats.length === 2);
            expect(ai.chats[1]!.options.session).toBe(session);
            expect(ai.chats[1]!.sent).toEqual([]);
            await until(async () => (await shown(again.table.url)).table?.chat === true);

            ai.chats[1]!.emit({ type: "ended", why: "the host's program ended (exit code 1)" });
            await until(async () => (await shown(again.table.url)).table?.chat === false);
            expect((await shown(again.table.url)).table?.failed).toEqual({ why: "the host's program ended (exit code 1)", number: 1 });
            expect(keptChat(tableFolder(home))?.closed).toBe(true);
        } finally {
            page.destroy();
        }
    }, 30_000);

    it("lets go a chat whose first turn fails before it says which chat it is, and the page says why", async () => {
        const { table, ai } = await drivenTable();
        ai.failFirst = true;
        await opened(table.url);
        await until(() => ai.chats.length === 1 && ai.chats[0]!.closed);
        await until(async () => (await shown(table.url)).table?.failed !== undefined);
        const table1 = (await shown(table.url)).table;
        expect(table1).toMatchObject({ chat: false, failed: { why: "Not signed in.", number: 1 } });
        expect(table1).not.toHaveProperty("opening");
    }, 30_000);

    it("leaves every host to the terminal with the switch off, and every other host with it on", async () => {
        const off = await drivenTable(undefined, undefined, undefined, false);
        await opened(off.table.url);
        expect(off.terminal.opened).toEqual(["claude"]);
        expect(off.ai.chats).toEqual([]);

        const on = await drivenTable();
        await opened(on.table.url, "codex");
        expect(on.terminal.opened).toEqual(["codex"]);
        expect(on.ai.chats).toEqual([]);
    }, 30_000);
});

/** A chat of the fake driver: what it was opened with, the words it was sent and the tools its AI called, how its turns ended; it plays through its place. */
interface FakeChat
{
    readonly options: ChatOptions;
    readonly session: string;
    readonly sent: string[];
    readonly calls: string[];
    readonly answers: { text: string; isError: boolean; }[];
    readonly ends: string[];
    /** What the AI does at its next turns woken by the bell, in order; none does nothing. */
    readonly turns: ((client: Client) => Promise<void>)[];
    closed: boolean;
    idle(): boolean;
    emit(event: HostEvent): void;
}

/** A driver of Claude Code whose chat plays the AI for real: on each turn, a client of the MCP SDK at its place, through the door. */
function fakeDriver(): { driver: HostDriver; chats: FakeChat[]; failFirst: boolean; }
{
    const chats: FakeChat[] = [];
    const driver: HostDriver = {
        open: (options) => {
            const fake = fakeChat(options, `session-${chats.length + 1}`, made.failFirst);
            chats.push(fake.chat);
            return fake.host;
        },
        missing: () => undefined,
        program: () => ({ command: "claude", args: [] }),
        environment: (environment) => ({ ...environment }),
        models: () => Promise.resolve([]),
        model: "opus",
        efforts: ["low", "medium", "high"],
    };
    const made = { driver, chats, failFirst: false };
    return made;
}

function fakeChat(options: ChatOptions, ownSession: string, failFirst = false): { chat: FakeChat; host: HostChat; }
{
    let listener: ((event: HostEvent) => void) | undefined;
    const waiting: HostEvent[] = [];
    let busy = false;
    let told = false;
    let client: Promise<Client> | undefined;
    let stopTurn: (() => void) | undefined;
    const session = options.session ?? ownSession;

    const emit = (event: HostEvent): void => {
        if (chat.closed) {
            return;
        }

        if (listener === undefined) {
            waiting.push(event);
        } else {
            listener(event);
        }
    };

    const chat: FakeChat = { options, session, sent: [], calls: [], answers: [], ends: [], turns: [], closed: false, idle: () => !busy, emit };

    const turn = async (text: string): Promise<void> => {
        // A host that cannot sign in fails its first turn before it says which chat it is.
        if (failFirst) {
            busy = false;
            emit({ type: "turnEnd", reason: "failed", why: "Not signed in." });
            return;
        }

        if (!told) {
            told = true;
            emit({ type: "session", session, model: `claude-${options.model}`, ...(options.effort === undefined ? {} : { effort: options.effort }) });
        }

        client ??= sitAt(options.server!.environment);
        const sitting = await client;
        const traced = tracing(sitting, chat);
        const stopped = new Promise<"interrupted">((done) => (stopTurn = () => done("interrupted")));
        const play = text === "Let's play!" ? startTurn(traced) : (chat.turns.shift() ?? (() => Promise.resolve()))(traced);
        const reason = await Promise.race([play.then(() => "done" as const), stopped]);
        stopTurn = undefined;
        chat.ends.push(reason);
        busy = false;
        emit({ type: "turnEnd", reason });
    };

    const host: HostChat = {
        send: (text) => {
            if (busy || chat.closed) {
                return false;
            }

            busy = true;
            chat.sent.push(text);
            void turn(text);
            return true;
        },
        onEvent: (heard) => {
            listener = heard;
            waiting.splice(0).forEach(heard);
        },
        interrupt: () => stopTurn?.(),
        close: () => {
            chat.closed = true;
            void client?.then((sitting) => sitting.close()).catch(() => undefined);
        },
    };
    return { chat, host };
}

/** What a chat's AI does at its first turn: the instructions, then status. */
async function startTurn(client: Client): Promise<void>
{
    await call(client, "instructions");
    await call(client, "status");
}

/** The client, its tools' names noted in the chat as they are called. */
function tracing(client: Client, chat: FakeChat): Client
{
    return new Proxy(client, {
        get: (target, name) => {
            if (name === "callTool") {
                return (asked: { name: string; }) => {
                    chat.calls.push(asked.name);
                    return target.callTool(asked as never);
                };
            }

            return Reflect.get(target, name) as unknown;
        },
    });
}

/** A host's client at the place the environment names, through the door, as `chesspal mcp` pipes it. */
async function sitAt(environment: Record<string, string>): Promise<Client>
{
    const input = new PassThrough();
    const output = new PassThrough();
    void pipeToTable(input, output, { door: environment[doorVariable]!, key: environment[keyVariable]!, version });
    const client = new Client({ name: "claude-code", version: "1.0.0" });
    clients.push(client);
    await client.connect(linesTransport(input, output));
    return client;
}

function linesTransport(input: PassThrough, output: PassThrough): Transport
{
    const buffer = new ReadBuffer();
    const transport: Transport = {
        start: async () => {
            output.on("data", (chunk: Buffer) => {
                buffer.append(chunk);

                for (let message = buffer.readMessage(); message !== null; message = buffer.readMessage()) {
                    transport.onmessage?.(message);
                }
            });
            output.on("end", () => transport.onclose?.());
        },
        send: async (message: JSONRPCMessage) => {
            input.write(serializeMessage(message));
        },
        close: async () => {
            input.end();
        },
    };
    return transport;
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}): Promise<{ text: string; isError: boolean; }>
{
    const result = await client.callTool({ name, arguments: args });
    return { text: (result.content as { text: string; }[])[0]?.text ?? "", isError: result.isError === true };
}

/** The terminal's chats, which open nothing: the hosts it was asked to open. */
function terminalChats(): { chats: TableChats; opened: string[]; }
{
    const opened: string[] = [];
    const hosts = ["claude", "codex"].map((name) => ({ name, installed: true, models: [], efforts: [], command: `chesspal play ${name}` }));
    const chats: TableChats = { hosts: () => hosts, open: (host) => Promise.resolve(opened.push(host) < 0), held: () => undefined, relaunch: () => false };
    return { chats, opened };
}

/**
 * A table on a data folder, a new one unless given, whose chats are driven over a terminal's that opens nothing, with the switch on unless `switched` is
 * false: its fake driver's chats, given to share them with a table started again.
 */
async function drivenTable(
    home?: string,
    ai = fakeDriver(),
    given?: Context,
    switched = true,
): Promise<{ table: Table; home: string; ai: ReturnType<typeof fakeDriver>; terminal: ReturnType<typeof terminalChats>; context: Context; chats: TableChats; }>
{
    const start = async (folder: string) => {
        const context = given ?? homeContext(folder);
        saveProfileSettings(folder, activeProfile(context.home()).id, { [chatInPage]: switched });
        const terminal = terminalChats();
        const chats = drivenChats(context, { terminal: terminal.chats, places: () => tablePlaces(context, { leaveWait: 500 }), driver: () => Promise.resolve(ai.driver), chesspal: ["node", "cli.js"], environment: {} });
        const table = await startTable(context, { idle: 60_000, every: 10 }, chats);

        if (table === undefined) {
            throw new Error("The table did not start: another one holds its ports.");
        }

        tables.push(table);
        return { table, home: folder, ai, terminal, context, chats };
    };

    return home === undefined ? onFreePorts(() => start(temporary())) : start(home);
}

/** The moves of the game going on, in SAN. */
function sans(home: string): string[]
{
    return loadGame(gameFolder(home))!.game.record.moves.map((move) => move.san);
}

function homeContext(home: string): Context
{
    return { ...testContext(home), now: () => new Date() };
}

function temporary(): string
{
    const folder = mkdtempSync(join(tmpdir(), "chesspal-driven-"));
    folders.push(folder);
    return folder;
}

/** A request of the table's own page, with its origin: the answer's status and text. */
function posted(url: string, path: string, body: object): Promise<{ status: number; text: string; }>
{
    return sent(new URL(path, url), { method: "POST", headers: { "Content-Type": "application/json", Origin: new URL(url).origin }, body: JSON.stringify(body) });
}

function opened(url: string, host = "claude"): Promise<{ status: number; text: string; }>
{
    return posted(url, "/api/table/chat", { host });
}

interface Shown
{
    game?: { talk?: { text: string; heard?: unknown; }[]; };
    thinking?: string;
    aiModel?: { model: string; effort?: string; };
    table?: { chat: boolean; started?: { model?: string; }; failed?: unknown; };
}

async function shown(url: string): Promise<Shown>
{
    return JSON.parse((await sent(new URL("/api/game", url))).text) as Shown;
}

/** A browser that has the page open, listening to its events. */
async function eventsOf(url: string): Promise<{ destroy(): void; }>
{
    const { get } = await import("node:http");
    return new Promise((done) => {
        const events = get(new URL("/api/events", url), { agent: false }, () => done(events));
    });
}

async function until(condition: () => boolean | Promise<boolean>, wait = 10_000): Promise<void>
{
    const end = Date.now() + wait;

    while (!(await condition())) {
        if (Date.now() > end) {
            throw new Error("What the test waited for did not come.");
        }

        await new Promise((done) => setTimeout(done, 20));
    }
}
