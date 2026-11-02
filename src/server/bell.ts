// Claude Code's doorbell for the moves played on the page (D-47): `chesspal listen`, the Stop hook init writes, waits at the page of its chat and, when the
// player moves there, tells the chat to call status. It never carries the move or the position: status reads them fresh.
import { createHash } from "node:crypto";
import { get, type IncomingMessage, type ServerResponse } from "node:http";
import { resolve } from "node:path";

/** What the chat hears from the doorbell: never the move, only where to read it. */
export const bellLine = "The player moved on the board page, where they see the board: call status to see their move and your position.";

/** The doorbell's end on the page's server: the hook of the chat that ended its turn waits here, one at a time, and hears "ring" when the player moves. */
export class Bell
{
    private listener: ServerResponse | undefined;
    private pending = false;

    /** The player moved on the page: the hook waiting hears it now, or the next one as soon as it comes. */
    ring(): void
    {
        if (this.listener === undefined) {
            this.pending = true;
            return;
        }

        this.listener.end("ring");
        this.listener = undefined;
    }

    /** The move is no longer news: the AI answered it from a chat already awake. */
    clear(): void
    {
        this.pending = false;
    }

    /** A hook waits for the bell; the one before it, of a turn already ended, is let go. */
    listen(request: IncomingMessage, response: ServerResponse): void
    {
        response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });

        if (this.pending) {
            this.pending = false;
            response.end("ring");
            return;
        }

        this.listener?.end("dismissed");
        this.listener = response;
        request.on("close", () => {
            if (this.listener === response) {
                this.listener = undefined;
            }
        });
    }
}

/** Whose page answers at a port, for the hook to find its own: the chat's session and the player's folder. */
export function bellProbe(folder: string): { session: string | null; folder: string; }
{
    return { session: process.env.CLAUDE_CODE_SESSION_ID ?? null, folder: resolve(folder) };
}

/** The ports a folder's page tries first: one in each of a few ranges, by its path, since Windows may reserve a range. The hook looks for it there. */
export function pagePorts(folder: string): number[]
{
    const offset = createHash("sha256").update(resolve(folder).toLowerCase()).digest()[0]! % 10;
    return [5870, 6870, 7870].map((base) => base + offset);
}

/** Reads the hook's input, waits for the bell, and ends the process as Claude Code's asyncRewake reads it: 2 with the line to wake the chat, else 0. */
export async function listen(): Promise<void>
{
    let input = "";

    for await (const chunk of process.stdin) {
        input += String(chunk);
    }

    // It ends as soon as it knows: the chat hears the hook only once it ends.
    if (await waitForBell(input)) {
        process.stderr.write(`${bellLine}\n`, () => process.exit(2));
    } else {
        process.exit(0);
    }
}

/**
 * Waits at the page of the hook's chat until the player moves there: true then; false when there is no page to wait at, or another hook takes its place.
 * The chat's own page is the one with its session; after /clear, which gives the hook a new one, the only page of its folder.
 */
export async function waitForBell(input: string, ports?: number[]): Promise<boolean>
{
    const hook = hookInput(input);
    // The chat's folder, where its server started: Claude Code names it, and the hook's cwd follows the cd's of the chat.
    const folder = resolve(process.env.CLAUDE_PROJECT_DIR ?? hook.cwd ?? process.cwd());
    const probes = await Promise.all((ports ?? pagePorts(folder)).map(async (port) => ({ port, said: probeOf(await body(port, "/api/bell?probe", probeWait)) })));
    const ours = probes.filter((one) => one.said !== undefined && samePath(one.said.folder, folder));
    const port = (ours.find((one) => hook.session !== undefined && one.said?.session === hook.session) ?? (ours.length === 1 ? ours[0] : undefined))?.port;
    return port === undefined ? false : (await body(port, "/api/bell")) === "ring";
}

// How long a port may take to say whose page it is: one of this computer answers at once.
const probeWait = 1000;

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

function probeOf(said: string | undefined): { session: string | null; folder: string; } | undefined
{
    try {
        const parsed = said === undefined ? undefined : JSON.parse(said) as { session?: unknown; folder?: unknown; };
        return parsed === undefined || typeof parsed.folder !== "string" ? undefined : { session: typeof parsed.session === "string" ? parsed.session : null, folder: parsed.folder };
    } catch {
        return undefined;
    }
}

function samePath(one: string, other: string): boolean
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
