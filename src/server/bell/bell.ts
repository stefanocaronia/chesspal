// The doorbell for the page (D-47): `chesspal listen`, the Stop hook init writes for Claude Code and Codex, waits at the page of its chat and, when
// the player moves or writes there, tells the chat to call status. It never carries the move, the words or the position: status reads them fresh.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { type ClientRequest, get, type IncomingMessage, type ServerResponse } from "node:http";
import { join, resolve } from "node:path";
import { writeAtomically } from "../../games/index.ts";
import { dataFolder, realPath, samePath, tableFolder } from "../../home/index.ts";
import { analystAgent } from "../../host-files/index.ts";
import { version } from "../../version.ts";

/** What the chat hears from the doorbell: one line for whatever the player did, never what, only where to read it. */
export const bellLine = "The player acted on the board page: call status to see it.";

/**
 * The doorbell's end on the page's server: the hook of the chat that ended its turn waits here, one at a time, and hears "ring" when the player moves or
 * writes on the page. A ring no hook heard waits for the next one, while it is still news: the chat, awake, may have read it already.
 */
export class Bell
{
    private listener: ServerResponse | undefined;
    private pending = false;
    // The chat is in a turn: it called a tool, or a hook woke it, and its turn has not ended yet. A chat never started, or just cleared, is not.
    private busy = false;
    // The doorbell woke the chat in this turn: the player acted on the page, and the chat goes to see it.
    private woken = false;
    // A hook has waited for the bell since the chat came: its host runs Chesspal's hooks, and only they tell where a turn ends.
    private hooked = false;
    private readonly news: () => boolean;
    private readonly changed: () => void;

    /**
     * `news` says whether a ring no hook heard is still worth waking the chat for; `changed` is told when what the page shows of the chat may change: it
     * starts or stops listening, the doorbell wakes it, its turn ends.
     */
    constructor(news: () => boolean = () => true, changed: () => void = () => undefined)
    {
        this.news = news;
        this.changed = changed;
    }

    /** Whether the chat is in a turn, as far as the doorbell knows: a chat stopped with Esc stays in it until its next tool. */
    get inTurn(): boolean
    {
        return this.busy;
    }

    /** Whether the doorbell woke the chat in the turn it is in. */
    get woke(): boolean
    {
        return this.woken;
    }

    /** Whether the chat hears the player: in a turn, or waiting for the bell with a hook. */
    get listening(): boolean
    {
        return this.busy || this.listener !== undefined;
    }

    /** The chat calls a tool, so it is in a turn: true when nobody was listening before. */
    chatCalls(): boolean
    {
        const asleep = !this.listening;
        this.busy = true;
        this.tellIf(asleep);
        return asleep;
    }

    /**
     * The player acted on the page: the hook waiting hears it now, or the next one as soon as it comes. In a host that runs no hook nothing tells the end of
     * a turn: an act the chat waits for finds it out of its turn, and nobody hears the player, unless the chat `mayBeAtWork` on the AI's move meanwhile.
     */
    ring(mayBeAtWork = false): void
    {
        if (this.listener === undefined) {
            this.pending = true;

            if (!this.hooked && !mayBeAtWork && this.busy) {
                this.busy = false;
                this.changed();
            }

            return;
        }

        this.listener.end("ring");
        this.listener = undefined;
        this.busy = true;
        this.woken = true;
        this.changed();
    }

    /** A hook waits for the bell, so the chat's turn has ended; the hook before it, of a turn already ended, is let go. */
    listen(request: IncomingMessage, response: ServerResponse): void
    {
        response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
        this.hooked = true;
        const missed = this.pending;
        this.pending = false;

        if (missed && this.news()) {
            response.end("ring");
            this.busy = true;
            this.woken = true;
            this.changed();
            return;
        }

        this.busy = false;
        this.woken = false;
        this.listener?.end("dismissed");
        this.listener = response;
        this.changed();
        request.on("close", () => {
            if (this.listener === response) {
                // The hook went without the bell (the chat stopped, cleared or closed): nobody hears the player until the chat calls a tool again.
                this.listener = undefined;
                this.tellIf(!this.busy);
            }
        });
    }

    /** The chat left the table (D-104): its process ended, and nobody is in a turn or waits for the bell; a ring no hook heard is no longer news for anyone. */
    chatLeft(): void
    {
        this.hooked = false;
        this.busy = false;
        this.woken = false;
        this.pending = false;
        this.listener?.end("dismissed");
        this.listener = undefined;
        this.changed();
    }

    private tellIf(changed: boolean): void
    {
        if (changed) {
            this.changed();
        }
    }
}

/**
 * Whose page answers at a port, for the hook to find its own: the chat's session, the player's folder, whether a browser has the page open, Chesspal's
 * version, and whether the table serves it (D-104), with the session and the folder of the chat attached to it, never its own process's.
 */
export function bellProbe(folder: string, open = false, table?: TableChat): BellProbe
{
    const session = table === undefined ? process.env.CLAUDE_CODE_SESSION_ID ?? null : table.session;
    return { session, folder: resolve(folder), open, version, ...(table === undefined ? {} : { table: true, ...(table.chat === undefined ? {} : { chat: table.chat }) }) };
}

/** The chat attached to the table, as its probe says it: its session, null for none or for Codex, and its folder; neither while no chat is attached. */
export interface TableChat
{
    session: string | null;
    chat?: string;
}

/** What a page says of itself at `/api/bell?probe`. */
export interface BellProbe
{
    session: string | null;
    folder: string;
    open: boolean;
    version?: string;
    table?: true;
    /** The folder of the chat attached to the table. */
    chat?: string;
}

/** What the page at a port of this computer says of itself; undefined when none answers there. */
export async function pageAt(port: number): Promise<BellProbe | undefined>
{
    return probeOf(await body(port, "/api/bell?probe", probeWait));
}

/**
 * The ports a folder's page tries first: one in each of a few ranges, by its real path, since Windows may reserve a range and the hook may name the folder
 * through a link. The hook looks for it there.
 */
export function pagePorts(folder: string): number[]
{
    const offset = createHash("sha256").update(realPath(folder).toLowerCase()).digest()[0]! % 10;
    return [5870, 6870, 7870].map((base) => base + portShift() + offset);
}

/**
 * Notes in the data folder the port a chat's page took off its folder's usual ports, one file per page, for the hook to find it there; then forgets, off
 * the caller's clock, the notes of its folder whose page is gone: nobody listens at the port, or another folder's page does. A page that answers late
 * is busy, not gone, and keeps its note. It throws when the note cannot be written.
 */
export function notePagePort(home: string, folder: string, port: number, wait = probeWait): Promise<void>
{
    mkdirSync(join(home, notesFolder), { recursive: true });
    writeAtomically(noteOf(home, port), JSON.stringify({ folder: resolve(folder) }));
    return forgetGonePages(home, folder, port, wait);
}

/** Forgets the note of a page that closes, unless another folder's page took its port since; a note that cannot go is left for the next page to clear. */
export function forgetPagePort(home: string, folder: string, port: number): void
{
    const noted = notedFolder(home, port);

    if (noted !== undefined && samePath(noted, folder)) {
        try {
            rmSync(noteOf(home, port), { force: true });
        } catch {
            // The next page of the folder clears it.
        }
    }
}

/** The ports noted for a folder's page in the data folder: none when it has no notes or cannot be read. A note may be stale: the probe tells. */
export function notedPagePorts(home: string, folder: string): number[]
{
    let names: string[];

    try {
        names = readdirSync(join(home, notesFolder));
    } catch {
        return [];
    }

    return names.flatMap((name) => {
        const port = Number(/^(\d+)\.json$/.exec(name)?.[1]);
        const noted = Number.isInteger(port) ? notedFolder(home, port) : undefined;
        return noted !== undefined && samePath(noted, folder) ? [port] : [];
    });
}

/** What Codex's Stop hook answers to wake the chat: its turn goes on with the doorbell's line. */
export const codexBellAnswer = JSON.stringify({ decision: "block", reason: bellLine });

/**
 * Reads the hook's input, waits for the bell, and ends the process as the host reads it: for Claude Code's asyncRewake, 2 with the line on stderr; for
 * Codex's Stop hook, 0 with its answer on stdout, since Windows PowerShell, which runs Codex's hooks, turns an exit code 2 into 1. Else 0, saying nothing.
 */
export async function listen(codex = false): Promise<void>
{
    let input = "";

    for await (const chunk of process.stdin) {
        input += String(chunk);
    }

    const heard = await bellHeard(input).catch((error: unknown): BellHeard => ({ folder: chatFolder(hookInput(input)), rang: false, why: `failed: ${(error as Error).message}` }));

    // Codex's turn ends with a hook that heard no bell, and the player's next move on the page wakes nobody: the log keeps why.
    if (codex && !heard.rang) {
        noteSilence(heard.folder, heard.why);
    }

    // It ends as soon as it knows: the chat hears the hook only once it ends.
    if (!heard.rang) {
        process.exit(0);
    } else if (codex) {
        process.stdout.write(`${codexBellAnswer}\n`, () => process.exit(0));
    } else {
        process.stderr.write(`${bellLine}\n`, () => process.exit(2));
    }
}

/**
 * Waits at the page of the hook's chat until the player moves there: true then; false when there is no page to wait at, or another hook takes its place.
 * The chat's own page is the one with its session; after /clear, which gives the hook a new one, the only page of its folder.
 */
export async function waitForBell(input: string, ports?: number[]): Promise<boolean>
{
    return (await bellHeard(input, ports)).rang;
}

/** What the hook heard at the page of its chat, in its folder: the bell, or why not. */
export type BellHeard = { folder: string; rang: true; } | { folder: string; rang: false; why: string; };

/**
 * Waits at the page of the hook's chat, as waitForBell does, and says what it heard. The chat may be attached to the table (D-104), beside another chat
 * of its folder that serves its own page: the table is one more page to choose from, unless the ports to try are given (Priya).
 */
export async function bellHeard(input: string, ports?: number[]): Promise<BellHeard>
{
    const hook = hookInput(input);
    const folder = chatFolder(hook);
    // The data folder holds the table's ports and those a page of the folder noted, off its usual ones.
    const home = ports === undefined ? homeOf(folder) : undefined;
    const tried = ports ?? [...new Set([...pagePorts(folder), ...(home === undefined ? [] : notedPagePorts(home, folder))])];
    const [probes, table] = await Promise.all([Promise.all(tried.map(async (port) => ({ port, said: await pageAt(port) }))), home === undefined ? undefined : tableOf(home, folder, hook.session)]);
    const pages = probes.flatMap(({ port, said }) => (said !== undefined && samePath(said.folder, folder) ? [{ port, said }] : []));
    // A chat opened in the table's own folder finds the table among the pages of its folder already.
    const ours = table === undefined || pages.some(({ port }) => port === table.port) ? pages : [...pages, table];
    const port = chatPage(ours, hook.session)?.port;

    if (port === undefined) {
        const others = probes.flatMap((one) => (one.said === undefined ? [] : [`${one.port} is ${one.said.folder}'s`]));
        const open = ours.filter(({ said }) => said.open).length;
        const pages = ours.length > 1 ? `${ours.length} pages of it, none of this chat's session, ${open} open in a browser` : "no page of it";
        return { folder, rang: false, why: `${pages} at ports ${tried.join(", ")}${others.length > 0 ? `; ${others.join(", ")}` : ""}` };
    }

    // The page lets the analyst go as the hook starts waiting, when none runs any more.
    const said = await body(port, hook.analystGone === true ? "/api/bell?analyst=gone" : "/api/bell");
    return said === "ring" ? { folder, rang: true } : { folder, rang: false, why: said === undefined ? `the page at port ${port} did not answer` : `the page at port ${port} said "${said}"` };
}

// How long a port may take to say whose page it is: one of this computer answers at once.
const probeWait = 1000;

/**
 * CHESSPAL_PORT_SHIFT, for the tests: a multiple of ten under a thousand moves every range of ports by it, so that runs side by side never share one.
 * Any other value moves nothing.
 */
function portShift(): number
{
    const shift = Number(process.env.CHESSPAL_PORT_SHIFT ?? 0);
    return Number.isInteger(shift) && shift >= 0 && shift < 1000 && shift % 10 === 0 ? shift : 0;
}

/**
 * The data folder of the chat's server, as the hook finds it; none when it cannot be found. Finding it costs some tens of milliseconds on Windows, off the
 * AI's clock: the hook waits after the turn.
 */
function homeOf(folder: string): string | undefined
{
    try {
        return serverHome(folder) ?? dataFolder();
    } catch {
        return undefined;
    }
}

/** The table of the data folder, when the chat attached to it is the hook's: of its folder, or of its session; none when no table has this chat. */
async function tableOf(home: string, folder: string, session: string | undefined): Promise<{ port: number; said: BellProbe; } | undefined>
{
    const probes = await Promise.all(pagePorts(tableFolder(home)).map(async (port) => ({ port, said: await pageAt(port) })));
    return probes.find((one): one is { port: number; said: BellProbe; } => one.said?.table === true && ((one.said.chat !== undefined && samePath(one.said.chat, folder)) || (session !== undefined && one.said.session === session)));
}

// Where the pages off their folder's usual ports note them, in the data folder: `<port>.json`, with the page's folder.
const notesFolder = "pages";

function noteOf(home: string, port: number): string
{
    return join(home, notesFolder, `${port}.json`);
}

/** The folder whose page noted a port; none when no note reads well. */
function notedFolder(home: string, port: number): string | undefined
{
    try {
        const { folder } = JSON.parse(readFileSync(noteOf(home, port), "utf8")) as { folder?: unknown; };
        return typeof folder === "string" ? folder : undefined;
    } catch {
        return undefined;
    }
}

/**
 * Forgets the notes of a folder's pages that are gone, but the one at `kept`: a page closed without forgetting its own, when nobody listens at its port or
 * another folder's page took it. A page that does not answer in time, or not as a page, may only be busy, and its note stays.
 */
async function forgetGonePages(home: string, folder: string, kept: number, wait: number): Promise<void>
{
    const others = notedPagePorts(home, folder).filter((port) => port !== kept);

    await Promise.all(others.map(async (port) => {
        const { refused, text } = await answerAt(port, "/api/bell?probe", wait);
        const said = probeOf(text);

        if (refused || (said !== undefined && !samePath(said.folder, folder))) {
            forgetPagePort(home, folder, port);
        }
    }));
}

/**
 * The data folder the chat's server is given in its folder's settings, as CHESSPAL_HOME in a playtest: the hook runs in the host's environment, not the
 * server's (Federico). Claude Code's .mcp.json first, then Codex's config.
 */
function serverHome(folder: string): string | undefined
{
    const chosen = [claudeHome(folder), codexHome(folder)].find((one) => one !== undefined && one.trim() !== "");
    return chosen === undefined ? undefined : resolve(chosen.trim());
}

function claudeHome(folder: string): string | undefined
{
    try {
        const config = JSON.parse(readFileSync(join(folder, ".mcp.json"), "utf8")) as { mcpServers?: { chesspal?: { env?: { CHESSPAL_HOME?: unknown; }; }; }; };
        const home = config.mcpServers?.chesspal?.env?.CHESSPAL_HOME;
        return typeof home === "string" ? home : undefined;
    } catch {
        return undefined;
    }
}

// The setting as init keeps it in Codex's table: a basic string, whose escapes are JSON's for a path, or a literal one.
function codexHome(folder: string): string | undefined
{
    try {
        const config = readFileSync(join(folder, ".codex", "config.toml"), "utf8");
        const [, basic, literal] = /\bCHESSPAL_HOME\s*=\s*(?:("(?:[^"\\]|\\.)*")|'([^']*)')/.exec(config) ?? [];
        return basic === undefined ? literal : JSON.parse(basic) as string;
    } catch {
        return undefined;
    }
}

// The log of Codex's hooks that heard no bell, in the chat's folder: its last lines only.
const silenceLog = "listen.log";
const silenceLines = 100;

/** Adds a line to the log of the hooks that heard no bell, keeping its last lines; a log that cannot be written never stops the hook. */
export function noteSilence(folder: string, why: string, now = new Date()): void
{
    const path = join(folder, silenceLog);

    try {
        const before = existsSync(path) ? readFileSync(path, "utf8").split("\n").filter((line) => line !== "") : [];
        writeAtomically(path, `${[...before, `${now.toISOString()} ${why}`].slice(-silenceLines).join("\n")}\n`);
    } catch {
        // The log only explains; the hook ends the same.
    }
}

/** The chat's folder, where its server started: Claude Code names it, and the hook's cwd follows the cd's of the chat. */
function chatFolder(hook: { cwd?: string; }): string
{
    return resolve(process.env.CLAUDE_PROJECT_DIR ?? hook.cwd ?? process.cwd());
}

function hookInput(input: string): { session?: string; cwd?: string; analystGone?: true; }
{
    try {
        const parsed = JSON.parse(input) as { session_id?: unknown; cwd?: unknown; background_tasks?: unknown; };
        return {
            ...(typeof parsed.session_id === "string" ? { session: parsed.session_id } : {}),
            ...(typeof parsed.cwd === "string" ? { cwd: parsed.cwd } : {}),
            ...(analystGone(parsed.background_tasks) ? { analystGone: true } : {}),
        };
    } catch {
        return {};
    }
}

/**
 * Whether Claude Code's Stop hook says no analyst runs in the background: after it ends, is stopped or fails, the chat takes a turn, and its Stop hook
 * lists the tasks still running (D-109, Priya's test). A host that lists none says nothing.
 */
function analystGone(tasks: unknown): boolean
{
    return Array.isArray(tasks) && !tasks.some((task) => {
        const { agent_type: agent, status } = (task ?? {}) as { agent_type?: unknown; status?: unknown; };
        return agent === analystAgent && status === "running";
    });
}

/**
 * The chat's page among those of its folder: the one of its session; else the only one, or the only one a browser has open, where the player plays. Codex
 * gives the page no session, and a chat closed may leave its page behind for a while.
 */
function chatPage(pages: { port: number; said: BellProbe; }[], session: string | undefined): { port: number; } | undefined
{
    const open = pages.filter(({ said }) => said.open);
    return pages.find(({ said }) => session !== undefined && said.session === session) ?? (pages.length === 1 ? pages[0] : open.length === 1 ? open[0] : undefined);
}

function probeOf(said: string | undefined): BellProbe | undefined
{
    try {
        const parsed = said === undefined ? undefined : JSON.parse(said) as { session?: unknown; folder?: unknown; open?: unknown; version?: unknown; table?: unknown; chat?: unknown; };
        return parsed === undefined || typeof parsed.folder !== "string" ? undefined : {
            session: typeof parsed.session === "string" ? parsed.session : null,
            folder: parsed.folder,
            open: parsed.open === true,
            ...(typeof parsed.version === "string" ? { version: parsed.version } : {}),
            ...(parsed.table === true ? { table: true as const } : {}),
            ...(typeof parsed.chat === "string" ? { chat: parsed.chat } : {}),
        };
    } catch {
        return undefined;
    }
}

/** The body a page of this computer answers with, once it ends; undefined when it does not answer, or not with 200. */
async function body(port: number, path: string, wait?: number): Promise<string | undefined>
{
    return (await answerAt(port, path, wait)).text;
}

/** What a port of this computer answers: the body of a 200, none for any other answer or none in time; `refused` when nobody listens there at all. */
interface Answer
{
    refused: boolean;
    text?: string;
}

function answerAt(port: number, path: string, wait?: number): Promise<Answer>
{
    return new Promise((done) => {
        // A connection of its own: Node's shared one ends a request idle for five seconds, and the doorbell waits for hours.
        const request = get({ host: "127.0.0.1", port, path, agent: false }, (response) => {
            let text = "";
            response.setEncoding("utf8");
            response.on("data", (chunk: string) => {
                text += chunk;
            });
            response.on("end", () => done(response.statusCode === 200 ? { refused: false, text } : { refused: false }));
            response.on("error", () => done({ refused: false }));
        });

        if (wait !== undefined) {
            giveUpAfterTurns(request, wait);
        }

        request.on("error", (error: NodeJS.ErrnoException) => done({ refused: error.code === "ECONNREFUSED" }));
    });
}

/**
 * Ends a request still unanswered after `wait`, counted in ten turns of this process's clock: after a stall (a busy computer, one waking up), a timer
 * fires before the answer waiting is read, and a page of this process, or one that answered meanwhile, would be taken for one that does not answer.
 */
function giveUpAfterTurns(request: ClientRequest, wait: number): void
{
    let turns = 0;
    const timer = setInterval(() => {
        turns++;

        if (turns === 10) {
            request.destroy();
        }
    }, wait / 10);
    request.on("close", () => clearInterval(timer));
}
