// The fakes of the tests of the chats the table drives: a driver of Claude Code whose chats play through their places, the table that drives them, and the
// page's requests.
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type { Context, HelperRole } from "../src/commands/index.ts";
import { loadGame } from "../src/games/index.ts";
import { type ChatOptions, type HostChat, type HostDriver, type HostEvent, type HostId, hosts, type LineProcess } from "../src/hosts/index.ts";
import { activeProfile, gameFolder, saveProfileSettings } from "../src/profiles/index.ts";
import { drivenChats, pageChat } from "../src/server/driven/index.ts";
import type { TableChats } from "../src/server/page/index.ts";
import { type TablePlaces, tablePlaces } from "../src/server/places/index.ts";
import { startTable, type Table, type TableTimes } from "../src/server/table/index.ts";
import { version } from "../src/version.ts";
import { testContext } from "./commands.ts";
import { removeFolder } from "./folders.ts";
import { sent } from "./http.ts";
import { sitAt } from "./place-client.ts";
import { onFreePorts } from "./ports.ts";

const folders: string[] = [];
const tables: Table[] = [];
const clients: Client[] = [];

/** Closes the clients, the tables and the folders the last test made: after each. */
export async function cleanUp(): Promise<void>
{
    await Promise.all(clients.splice(0).map((client) => client.close().catch(() => undefined)));
    await Promise.all(tables.splice(0).map((table) => table.close()));
    await Promise.all(folders.splice(0).map(removeFolder));
}

/** A chat of the fake driver: what it was opened with, the words it was sent and the tools its AI called, how its turns ended; it plays through its place. */
export interface FakeChat
{
    readonly options: ChatOptions;
    readonly session: string;
    readonly sent: string[];
    readonly calls: string[];
    readonly answers: { text: string; isError: boolean; }[];
    readonly ends: string[];
    /** What the AI does at its next turns woken by the bell, in order; none does nothing. One that gives "failed" fails as the host's API would. */
    readonly turns: ((client: Client) => Promise<void | "failed">)[];
    closed: boolean;
    /** How each close asked its program to end: let go to end by itself (true), or stopped at once. */
    readonly closes: boolean[];
    /** The table's interrupts and closes, in order. */
    readonly steps: ("interrupt" | "close")[];
    idle(): boolean;
    emit(event: HostEvent): void;
    /** A turn the host begins by itself, with no words of the table's, which ends once `play` has. */
    ownTurn(play: () => Promise<void>): Promise<void>;
}

/**
 * A driver of Claude Code whose chat plays the AI for real: on each turn, a client of the MCP SDK at its place, through the door. Its program `missing`,
 * the driver `loading` until a promise settles, the first turns it plays, and the turns the next chat it opens plays.
 */
export interface FakeDriver
{
    driver: HostDriver;
    /** The hosts the table asked a driver for, in order: the same fake answers for each. */
    asked: HostId[];
    /** The opponent's chats; the helpers' apart, each playing its turns as `helpers` says for its role, else doing nothing. */
    chats: FakeChat[];
    helperChats: FakeChat[];
    helpers: Partial<Record<HelperRole, (client: Client, prompt: string, chat: FakeChat) => Promise<void | "failed">>>;
    /** What the table told its log: the helpers' failures. */
    logged: string[];
    /**
     * The programs the table started through its start, by their chat's role, as they started, sat at their place, said which chat they are (helpers only) and
     * exited: "start ponder", "sat ponder", "said ponder", "exit ponder".
     */
    timeline: string[];
    /** How long a program let go takes to exit, in ms. */
    exitAfter: number;
    /** How long a helper's server takes to sit at its place, in ms: a helper sent its first words meanwhile says which chat it is before it sits. */
    sitAfter: number;
    /** The table's environment, empty unless the test gives one. */
    environment: NodeJS.ProcessEnv;
    /** How the table starts its programs: a fake process, which exits `exitAfter` ms after its input is closed. */
    start: (command: string, args: string[], options: { cwd: string; }) => LineProcess;
    failFirst: boolean;
    missing: boolean;
    loading?: Promise<void>;
    /** How long a helper's turn on a position gone by may work while the next waits, in ms: the table's own unless given. */
    staleTurn?: number;
    first?: (client: Client) => Promise<void>;
    queued: ((client: Client) => Promise<void>)[];
}

export function fakeDriver(): FakeDriver
{
    const chats: FakeChat[] = [];
    const helperChats: FakeChat[] = [];
    const driver: HostDriver = {
        open: (options) => {
            const role = basename(options.folder);
            const program = options.start?.(options.program.command, options.program.args, { cwd: options.folder, env: options.environment });

            if (role !== "opponent") {
                const helper = fakeChat(options, `${role}-session-${helperChats.length + 1}`, made, program, role as HelperRole);
                helperChats.push(helper.chat);
                return helper.host;
            }

            const fake = fakeChat(options, `session-${chats.length + 1}`, made, program);
            fake.chat.turns.push(...made.queued.splice(0));
            chats.push(fake.chat);
            return fake.host;
        },
        missing: () => undefined,
        program: () => (made.missing ? undefined : { command: "claude", args: [] }),
        environment: (environment) => ({ ...environment }),
        models: () => Promise.resolve([]),
        model: "opus",
        efforts: ["low", "medium", "high"],
    };
    const timeline: string[] = [];
    const start = (_command: string, _args: string[], options: { cwd: string; }): LineProcess => fakeProgram(basename(options.cwd), made);
    const made: FakeDriver = { driver, asked: [], chats, helperChats, helpers: {}, logged: [], timeline, exitAfter: 0, sitAfter: 0, environment: {}, start, failFirst: false, missing: false, queued: [] };
    return made;
}

/** A program of a chat's role: it starts at once, and exits once its input is closed, `exitAfter` ms later, or at once when stopped. */
function fakeProgram(role: string, ai: FakeDriver): LineProcess
{
    let ended: ((reason: string) => void) | undefined;
    let gone = false;
    ai.timeline.push(`start ${role}`);

    const exit = (reason: string): void => {
        if (!gone) {
            gone = true;
            ai.timeline.push(`exit ${role}`);
            ended?.(reason);
        }
    };

    return {
        pid: undefined,
        write: () => undefined,
        onLine: () => undefined,
        onEnd: (listener) => (ended = listener),
        closeInput: () => void setTimeout(() => exit("exit code 0"), ai.exitAfter),
        stop: () => {
            ended = undefined;
            exit("stopped");
        },
    };
}

function fakeChat(options: ChatOptions, ownSession: string, ai: FakeDriver, program: LineProcess | undefined, role?: HelperRole): { chat: FakeChat; host: HostChat; }
{
    let listener: ((event: HostEvent) => void) | undefined;
    const waiting: HostEvent[] = [];
    const failFirst = role === undefined && ai.failFirst;
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

    const ownTurn = async (play: () => Promise<void>): Promise<void> => {
        busy = true;
        emit({ type: "turnStart", by: "host" });
        await play();
        busy = false;
        emit({ type: "turnEnd", reason: "done" });
    };

    const chat: FakeChat = { options, session, sent: [], calls: [], answers: [], ends: [], turns: [], closed: false, closes: [], steps: [], idle: () => !busy, emit, ownTurn };
    // A helper's program starts its server at once, as Claude Code does before its first words: the table hears it sit at its place, its MCP client named
    // as the host's the table last asked a driver for.
    const name = hosts[ai.asked.at(-1) ?? "claudeCode"].client;
    const sit = (): Promise<Client> => (client ??= pause(role === undefined ? 0 : ai.sitAfter).then(() => sitAt(options.server?.environment ?? (options.environment as Record<string, string>), (made) => void clients.push(made), name)));

    if (role !== undefined) {
        void sit().catch(() => undefined);
    }

    const turn = async (text: string): Promise<void> => {
        // A host that cannot sign in fails its first turn before it says which chat it is.
        if (failFirst) {
            busy = false;
            emit({ type: "turnEnd", reason: "failed", why: "Not logged in · Please run /login" });
            return;
        }

        // As a host's process does, it says which chat it is a moment after it was sent its first words.
        await new Promise((done) => setImmediate(done));

        if (!told) {
            told = true;

            if (role !== undefined) {
                ai.timeline.push(`said ${role}`);
            }

            emit({ type: "session", session, model: `claude-${options.model}`, ...(options.effort === undefined ? {} : { effort: options.effort }) });
        }

        // A turn may be stopped from its first instant, as a real host's is, before its client has sat.
        let wasStopped = false;
        const stopped = new Promise<"interrupted">((done) => (stopTurn = () => {
            wasStopped = true;
            done("interrupted");
        }));
        const sitting = await sit();
        const traced = tracing(sitting, chat);
        // A clean chat's first words are the table's start message.
        const starting = options.session === undefined && chat.sent.length === 1 && text === chat.sent[0];
        const helping = role === undefined ? undefined : ai.helpers[role];
        const play = wasStopped
            ? Promise.resolve()
            : role !== undefined
            ? helping === undefined ? Promise.resolve() : helping(traced, text, chat)
            : starting
            ? (ai.first ?? startTurn)(traced)
            : (chat.turns.shift() ?? (() => Promise.resolve()))(traced);
        const reason = await Promise.race([play.then((ended) => ended ?? "done"), stopped]);
        stopTurn = undefined;
        chat.ends.push(reason);
        busy = false;
        emit(reason === "failed" ? { type: "turnEnd", reason, why: "API Error: 500 Internal server error" } : { type: "turnEnd", reason });
    };

    const host: HostChat = {
        send: (text) => {
            if (busy || chat.closed) {
                return false;
            }

            busy = true;
            chat.sent.push(text);
            // A chat closed in its turn, as a helper the table lets go, hears no more of its place.
            void turn(text).catch((error: unknown) => {
                if (!chat.closed) {
                    throw error;
                }
            });
            return true;
        },
        onEvent: (heard) => {
            listener = heard;
            waiting.splice(0).forEach(heard);
        },
        interrupt: () => {
            chat.steps.push("interrupt");
            stopTurn?.();
        },
        close: (gently) => {
            if (!chat.closed) {
                chat.steps.push("close");
                // Let go, its program ends by itself once its input is closed; else it is stopped at once.
                program?.[gently === true ? "closeInput" : "stop"]();
            }

            chat.closed = true;
            chat.closes.push(gently === true);
            void client?.then((sitting) => sitting.close()).catch(() => undefined);
        },
    };
    return { chat, host };
}

/** What a chat's AI does at its first turn: the instructions, then status. */
export async function startTurn(client: Client): Promise<void>
{
    await call(client, "instructions");
    await call(client, "status");
}

/** The client, its tools' names noted in the chat as they are called, and told to the table as Claude Code tells them, once their answer is in. */
function tracing(client: Client, chat: FakeChat): Client
{
    return new Proxy(client, {
        get: (target, name) => {
            if (name === "callTool") {
                return async (asked: { name: string; }) => {
                    const id = `tool-${chat.calls.length}`;
                    chat.calls.push(asked.name);
                    chat.emit({ type: "tool", id, name: asked.name, kind: "chesspal", state: "started" });
                    const result = await target.callTool(asked as never);
                    chat.emit({ type: "tool", id, name: asked.name, kind: "chesspal", state: result.isError === true ? "failed" : "done" });
                    return result;
                };
            }

            return Reflect.get(target, name) as unknown;
        },
    });
}

export async function call(client: Client, name: string, args: Record<string, unknown> = {}): Promise<{ text: string; isError: boolean; }>
{
    const result = await client.callTool({ name, arguments: args });
    return { text: (result.content as { text: string; }[])[0]?.text ?? "", isError: result.isError === true };
}

/** The terminal's chats, which open nothing: the hosts it was asked to open. */
function terminalChats(): { chats: TableChats; opened: string[]; }
{
    const opened: string[] = [];
    const offered = ["claude", "codex", "antigravity", "opencode"].map((name) => ({ name, installed: true, models: [], efforts: [], command: `chesspal play ${name}` }));
    const chats: TableChats = { hosts: () => offered, open: (host) => Promise.resolve(opened.push(host) < 0), held: () => undefined, relaunch: () => false };
    return { chats, opened };
}

/** The table's places, the roles of those withdrawn noted in `withdrawn`, and in `timeline` each chat's server as it sits, before the table hears it. */
function watchedPlaces(context: Context, withdrawn: string[], timeline: string[]): TablePlaces
{
    const places = tablePlaces(context, { leaveWait: 500 });
    return {
        offer: async (role, folder, chat) => {
            const place = await places.offer(role, folder, chat);
            return {
                ...place,
                seated: place.seated.then(() => void timeline.push(`sat ${role}`)),
                withdraw: () => {
                    withdrawn.push(place.role);
                    place.withdraw();
                },
            };
        },
        close: () => places.close(),
    };
}

/**
 * A table on a data folder, a new one unless given, whose chats are driven over a terminal's that opens nothing, with the switch on unless `switched` is
 * false: its fake driver's chats, given to share them with a table started again.
 */
export async function drivenTable(
    home?: string,
    ai = fakeDriver(),
    given?: Context,
    switched = true,
    times: TableTimes = { idle: 60_000, gone: 60_000, every: 10 },
    programsEnded?: () => Promise<unknown>,
): Promise<{ table: Table; home: string; ai: FakeDriver; terminal: ReturnType<typeof terminalChats>; context: Context; chats: TableChats; withdrawn: string[]; }>
{
    const start = async (folder: string) => {
        const context = given ?? homeContext(folder);
        saveProfileSettings(folder, activeProfile(context.home()).id, { [pageChat]: switched });
        const terminal = terminalChats();
        const withdrawn: string[] = [];

        const driver = async (host: HostId): Promise<HostDriver> => {
            ai.asked.push(host);
            await ai.loading;
            return ai.driver;
        };

        const chats = drivenChats(context, {
            terminal: terminal.chats,
            places: () => watchedPlaces(context, withdrawn, ai.timeline),
            driver,
            chesspal: ["node", "cli.js"],
            environment: ai.environment,
            log: (line) => void ai.logged.push(line),
            start: ai.start,
            ...(ai.staleTurn === undefined ? {} : { staleTurn: ai.staleTurn }),
        });
        const table = await startTable(context, times, chats, undefined, programsEnded);

        if (table === undefined) {
            throw new Error("The table did not start: another one holds its ports.");
        }

        tables.push(table);
        return { table, home: folder, ai, terminal, context, chats, withdrawn };
    };

    return home === undefined ? onFreePorts(() => start(temporary())) : start(home);
}

/** The moves of the game going on, in SAN. */
export function sans(home: string): string[]
{
    return loadGame(gameFolder(home))!.game.record.moves.map((move) => move.san);
}

export function homeContext(home: string): Context
{
    return { ...testContext(home), now: () => new Date() };
}

/** A context whose clock the test moves forward. */
export function movingContext(home: string): { context: Context; ahead: { ms: number; }; }
{
    const ahead = { ms: 0 };
    return { context: { ...testContext(home), now: () => new Date(Date.now() + ahead.ms) }, ahead };
}

export function temporary(): string
{
    const folder = mkdtempSync(join(tmpdir(), "chesspal-driven-"));
    folders.push(folder);
    return folder;
}

export const pause = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

/** A gate a fake turn waits at. */
export function gate(): { open: () => void; passed: Promise<void>; }
{
    let open = (): void => undefined;
    const passed = new Promise<void>((done) => (open = done));
    return { open, passed };
}

/** A request of the table's own page, with its origin: the answer's status and text. */
export function posted(url: string, path: string, body: object): Promise<{ status: number; text: string; }>
{
    return sent(new URL(path, url), { method: "POST", headers: { "Content-Type": "application/json", Origin: new URL(url).origin }, body: JSON.stringify(body) });
}

export function opened(url: string, host = "claude", review?: boolean): Promise<{ status: number; text: string; }>
{
    return posted(url, "/api/table/chat", { host, ...(review === undefined ? {} : { review }) });
}

export interface Shown
{
    game?: { talk?: { text: string; heard?: unknown; }[]; };
    thinking?: string;
    aiModel?: { model: string; effort?: string; };
    table?: { chat: boolean; started?: { model?: string; }; failed?: unknown; opening?: string; atWork?: true; stopped?: true; noMove?: true; };
}

export async function shown(url: string): Promise<Shown>
{
    return JSON.parse((await sent(new URL("/api/game", url))).text) as Shown;
}

export async function raw(url: string): Promise<Record<string, unknown>>
{
    return JSON.parse((await sent(new URL("/api/game", url))).text) as Record<string, unknown>;
}

/** A browser that has the page open, listening to its events. */
export async function eventsOf(url: string): Promise<{ destroy(): void; }>
{
    const { get } = await import("node:http");
    return new Promise((done) => {
        const events = get(new URL("/api/events", url), { agent: false }, () => done(events));
    });
}

/** A browser that has the page open, with the events it was sent: `changed` for each telling. */
export async function pageListening(url: string): Promise<{ events: string[]; destroy(): void; }>
{
    const { get } = await import("node:http");
    const events: string[] = [];
    return new Promise((done) => {
        const asked = get(new URL("/api/events", url), { agent: false }, (response) => {
            response.setEncoding("utf8");
            response.on("data", (chunk: string) => events.push(...chunk.split("\n\n").filter((line) => line.startsWith("data: ")).map((line) => line.slice(6))));
            done({ events, destroy: () => asked.destroy() });
        });
        asked.on("error", () => undefined);
    });
}

/** A chat of a terminal attached to the table over HTTP, which stays while its request does. */
export async function terminalAttached(url: string, folder: string): Promise<{ token: string; leave(): void; }>
{
    const { request } = await import("node:http");
    return new Promise((done, failed) => {
        const asked = request(new URL("/api/chat", url), { method: "POST", headers: { "Content-Type": "application/json" }, agent: false }, (response) => {
            response.setEncoding("utf8");
            response.once("data", (line: string) => {
                const said = JSON.parse(line.split("\n")[0]!) as { token?: string; error?: string; };

                if (said.token === undefined) {
                    failed(new Error(said.error));
                } else {
                    done({ token: said.token, leave: () => asked.destroy() });
                }
            });
        });
        asked.on("error", () => undefined);
        asked.end(JSON.stringify({ version, session: "terminal-session", folder, host: "claude-code", outdated: false }));
    });
}

/** A hook that waits at the bell over HTTP: what it hears. */
export async function hookWaiting(url: string): Promise<{ heard: Promise<string>; }>
{
    const { get } = await import("node:http");
    let said = (text: string): void => void text;
    const heard = new Promise<string>((done) => (said = done));
    await new Promise<void>((started) => {
        const asked = get(new URL("/api/bell?session=terminal-session", url), { agent: false }, (response) => {
            let text = "";
            response.setEncoding("utf8");
            response.on("data", (chunk: string) => (text += chunk));
            response.on("end", () => said(text));
        });
        asked.on("error", () => said("error"));
        setTimeout(started, 150);
    });
    return { heard };
}

export async function until(condition: () => boolean | Promise<boolean>, wait = 10_000): Promise<void>
{
    const end = Date.now() + wait;

    while (!(await condition())) {
        if (Date.now() > end) {
            throw new Error("What the test waited for did not come.");
        }

        await new Promise((done) => setTimeout(done, 20));
    }
}
