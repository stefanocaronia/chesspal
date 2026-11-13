// Where a folder's page answers, and how a hook finds its chat's page: on its folder's usual ports, at a port it noted in the data folder, or at the table
// (D-104). Light on purpose: the prompt hook loads it on every message of the chat.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { type ClientRequest, get } from "node:http";
import { join, resolve } from "node:path";
import { dataFolder, realPath, samePath, tableFolder } from "../../home/index.ts";
import { version } from "../../version.ts";

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

/** What the page at a port of this computer says of itself; undefined when none answers there in `wait`. */
export async function pageAt(port: number, wait = probeWait): Promise<BellProbe | undefined>
{
    return probeOf((await askPage(port, "/api/bell?probe", wait)).text);
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

/** The file where a page off its folder's usual ports notes its port in the data folder: `pages/<port>.json`, with the page's folder. */
export function pageNote(home: string, port: number): string
{
    return join(home, notesFolder, `${port}.json`);
}

/** The folder whose page noted a port; none when no note reads well. */
export function notedFolder(home: string, port: number): string | undefined
{
    try {
        const { folder } = JSON.parse(readFileSync(pageNote(home, port), "utf8")) as { folder?: unknown; };
        return typeof folder === "string" ? folder : undefined;
    } catch {
        return undefined;
    }
}

/** What a hook reads of its host's input to find its chat's page: the chat's session and the folder it runs in. */
export interface ChatHook
{
    session?: string;
    cwd?: string;
}

/** The page of a hook's chat, in the chat's folder: its port, or why none was found. */
export type ChatPage = { folder: string; port: number; } | { folder: string; port?: undefined; why: string; };

/**
 * Finds the page of the hook's chat: the one of its session among those of its folder, or the table the chat is attached to (D-104); else the only one,
 * or the only one a browser has open. Its folder's usual ports first: a page of the chat's session there spares reading the data folder, some 40 ms on
 * Windows. With `ports` given, only those are tried. Each page has `wait` to say whose it is.
 */
export async function findChatPage(hook: ChatHook, ports?: number[], wait = probeWait): Promise<ChatPage>
{
    const folder = chatFolder(hook);
    const probed = (tried: number[]) => Promise.all(tried.map(async (port) => ({ port, said: await pageAt(port, wait) })));
    const usual = await probed(ports ?? pagePorts(folder));
    const own = usual.find(({ said }) => hook.session !== undefined && said?.session === hook.session && samePath(said.folder, folder));

    if (own !== undefined) {
        return { folder, port: own.port };
    }

    // The data folder holds the table's ports and those a page of the folder noted, off its usual ones.
    const home = ports === undefined ? homeOf(folder) : undefined;
    const noted = home === undefined ? [] : notedPagePorts(home, folder).filter((port) => !usual.some((one) => one.port === port));
    const [more, table] = await Promise.all([probed(noted), home === undefined ? undefined : tableOf(home, folder, hook.session, wait)]);
    const probes = [...usual, ...more];
    const pages = probes.flatMap(({ port, said }) => (said !== undefined && samePath(said.folder, folder) ? [{ port, said }] : []));
    // A chat opened in the table's own folder finds the table among the pages of its folder already.
    const ours = table === undefined || pages.some(({ port }) => port === table.port) ? pages : [...pages, table];
    const port = chosenPage(ours, hook.session)?.port;

    if (port !== undefined) {
        return { folder, port };
    }

    const others = probes.flatMap((one) => (one.said === undefined ? [] : [`${one.port} is ${one.said.folder}'s`]));
    const open = ours.filter(({ said }) => said.open).length;
    const found = ours.length > 1 ? `${ours.length} pages of it, none of this chat's session, ${open} open in a browser` : "no page of it";
    return { folder, why: `${found} at ports ${probes.map((one) => one.port).join(", ")}${others.length > 0 ? `; ${others.join(", ")}` : ""}` };
}

/**
 * Tells the page of the hook's chat that the player's message started its turn (the prompt hook): whether the page heard it. Quick or not at all: each
 * page has a quarter of a second to answer, and none is asked twice, so that the prompt never waits on a page that is busy or gone.
 */
export async function tellChatAtWork(hook: ChatHook, ports?: number[]): Promise<boolean>
{
    try {
        const found = await findChatPage(hook, ports, promptWait);
        return found.port !== undefined && (await askPage(found.port, "/api/bell/prompt", promptWait)).text === "at work";
    } catch {
        return false;
    }
}

/** What the page at a port of this computer answers, once it ends: the body of a 200, none for any other answer or none in `wait`; `refused` when nobody listens there at all. */
export interface PageAnswer
{
    refused: boolean;
    text?: string;
}

/** Asks the page at a port of this computer, on a connection of its own: one that waits for the bell waits for hours, with no `wait`. */
export function askPage(port: number, path: string, wait?: number): Promise<PageAnswer>
{
    return new Promise((done) => {
        // Node's shared connection ends a request idle for five seconds.
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

/** The page's words for what it says of itself; undefined for anything else. */
export function probeOf(said: string | undefined): BellProbe | undefined
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

/**
 * The data folder the chat's server is given in its folder's settings, as CHESSPAL_HOME in a playtest: the hook runs in the host's environment, not the
 * server's (Federico). Claude Code's .mcp.json first, then Codex's config.
 */
export function serverHome(folder: string): string | undefined
{
    const chosen = [claudeHome(folder), codexHome(folder)].find((one) => one !== undefined && one.trim() !== "");
    return chosen === undefined ? undefined : resolve(chosen.trim());
}

/** The chat's folder, where its server started, as a hook finds it: Claude Code names it, and the hook's cwd follows the cd's of the chat. */
export function chatFolder(hook: { cwd?: string; }): string
{
    return resolve(process.env.CLAUDE_PROJECT_DIR ?? hook.cwd ?? process.cwd());
}

/** How long a port may take to say whose page it is: one of this computer answers at once. */
export const probeWait = 1000;

// How long a page has to answer the prompt hook, which holds the player's message meanwhile.
const promptWait = 250;

// Where the pages off their folder's usual ports note them, in the data folder: `<port>.json`, with the page's folder.
const notesFolder = "pages";

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
 * The data folder of the chat's server, as the hook finds it; none when it cannot be found. Finding it costs some tens of milliseconds on Windows, the
 * registry read.
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
async function tableOf(home: string, folder: string, session: string | undefined, wait: number): Promise<{ port: number; said: BellProbe; } | undefined>
{
    const probes = await Promise.all(pagePorts(tableFolder(home)).map(async (port) => ({ port, said: await pageAt(port, wait) })));
    return probes.find((one): one is { port: number; said: BellProbe; } => one.said?.table === true && ((one.said.chat !== undefined && samePath(one.said.chat, folder)) || (session !== undefined && one.said.session === session)));
}

/**
 * The chat's page among those of its folder: the one of its session; else the only one, or the only one a browser has open, where the player plays. Codex
 * gives the page no session, and a chat closed may leave its page behind for a while.
 */
function chosenPage(pages: { port: number; said: BellProbe; }[], session: string | undefined): { port: number; } | undefined
{
    const open = pages.filter(({ said }) => said.open);
    return pages.find(({ said }) => session !== undefined && said.session === session) ?? (pages.length === 1 ? pages[0] : open.length === 1 ? open[0] : undefined);
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
