// The doorbell for the page (D-47): `chesspal listen`, the Stop hook init writes for Claude Code and Codex, waits at the page of its chat and, when
// the player moves or writes there, tells the chat to call status. It never carries the move, the words or the position: status reads them fresh.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { get, type IncomingMessage, type ServerResponse } from "node:http";
import { join, resolve } from "node:path";
import { writeAtomically } from "../games/index.ts";
import { version } from "../version.ts";

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

    /** The player acted on the page: the hook waiting hears it now, or the next one as soon as it comes. */
    ring(): void
    {
        if (this.listener === undefined) {
            this.pending = true;
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

    private tellIf(changed: boolean): void
    {
        if (changed) {
            this.changed();
        }
    }
}

/**
 * Whose page answers at a port, for the hook to find its own: the chat's session, the player's folder, whether a browser has the page open, Chesspal's
 * version, and whether the table serves it (D-104), which has no chat and no session, even when started from a chat's terminal.
 */
export function bellProbe(folder: string, open = false, table = false): BellProbe
{
    return { session: table ? null : process.env.CLAUDE_CODE_SESSION_ID ?? null, folder: resolve(folder), open, version, ...(table ? { table } : {}) };
}

/** What a page says of itself at `/api/bell?probe`. */
export interface BellProbe
{
    session: string | null;
    folder: string;
    open: boolean;
    version?: string;
    table?: true;
}

/** What the page at a port of this computer says of itself; undefined when none answers there. */
export async function pageAt(port: number): Promise<BellProbe | undefined>
{
    return probeOf(await body(port, "/api/bell?probe", probeWait));
}

/** The ports a folder's page tries first: one in each of a few ranges, by its path, since Windows may reserve a range. The hook looks for it there. */
export function pagePorts(folder: string): number[]
{
    const offset = createHash("sha256").update(resolve(folder).toLowerCase()).digest()[0]! % 10;
    return [5870, 6870, 7870].map((base) => base + offset);
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

/** Waits at the page of the hook's chat, as waitForBell does, and says what it heard. */
export async function bellHeard(input: string, ports?: number[]): Promise<BellHeard>
{
    const hook = hookInput(input);
    const folder = chatFolder(hook);
    const tried = ports ?? pagePorts(folder);
    const probes = await Promise.all(tried.map(async (port) => ({ port, said: await pageAt(port) })));
    const ours = probes.flatMap(({ port, said }) => (said !== undefined && samePath(said.folder, folder) ? [{ port, said }] : []));
    const port = chatPage(ours, hook.session)?.port;

    if (port === undefined) {
        const others = probes.flatMap((one) => (one.said === undefined ? [] : [`${one.port} is ${one.said.folder}'s`]));
        const open = ours.filter(({ said }) => said.open).length;
        const pages = ours.length > 1 ? `${ours.length} pages of it, none of this chat's session, ${open} open in a browser` : "no page of it";
        return { folder, rang: false, why: `${pages} at ports ${tried.join(", ")}${others.length > 0 ? `; ${others.join(", ")}` : ""}` };
    }

    const said = await body(port, "/api/bell");
    return said === "ring" ? { folder, rang: true } : { folder, rang: false, why: said === undefined ? `the page at port ${port} did not answer` : `the page at port ${port} said "${said}"` };
}

// How long a port may take to say whose page it is: one of this computer answers at once.
const probeWait = 1000;

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

function hookInput(input: string): { session?: string; cwd?: string; }
{
    try {
        const parsed = JSON.parse(input) as { session_id?: unknown; cwd?: unknown; };
        return {
            ...(typeof parsed.session_id === "string" ? { session: parsed.session_id } : {}),
            ...(typeof parsed.cwd === "string" ? { cwd: parsed.cwd } : {}),
        };
    } catch {
        return {};
    }
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
        const parsed = said === undefined ? undefined : JSON.parse(said) as { session?: unknown; folder?: unknown; open?: unknown; version?: unknown; table?: unknown; };
        return parsed === undefined || typeof parsed.folder !== "string" ? undefined : {
            session: typeof parsed.session === "string" ? parsed.session : null,
            folder: parsed.folder,
            open: parsed.open === true,
            ...(typeof parsed.version === "string" ? { version: parsed.version } : {}),
            ...(parsed.table === true ? { table: true as const } : {}),
        };
    } catch {
        return undefined;
    }
}

/** Whether two paths name the same folder: without regard to case on Windows. */
export function samePath(one: string, other: string): boolean
{
    return process.platform === "win32" ? resolve(one).toLowerCase() === resolve(other).toLowerCase() : resolve(one) === resolve(other);
}

/** The body a page of this computer answers with, once it ends; undefined when it does not answer, or not with 200. */
function body(port: number, path: string, wait?: number): Promise<string | undefined>
{
    return new Promise((done) => {
        // A connection of its own: Node's shared one ends a request idle for five seconds, and the doorbell waits for hours.
        const request = get({ host: "127.0.0.1", port, path, agent: false, ...(wait === undefined ? {} : { timeout: wait }) }, (response) => {
            let text = "";
            response.setEncoding("utf8");
            response.on("data", (chunk: string) => {
                text += chunk;
            });
            response.on("end", () => done(response.statusCode === 200 ? text : undefined));
            response.on("error", () => done(undefined));
        });

        if (wait !== undefined) {
            request.on("timeout", () => request.destroy());
        }

        request.on("error", () => done(undefined));
    });
}
