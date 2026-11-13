// The doorbell for the page (D-47): `chesspal listen`, the Stop hook init writes for Claude Code and Codex, waits at the page of its chat and, when
// the player moves or writes there, tells the chat to call status. It never carries the move, the words or the position: status reads them fresh.
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, join, resolve } from "node:path";
import { positionShownNote, writeAtomically } from "../../games/index.ts";
import { samePath } from "../../home/index.ts";
import { analystAgent } from "../../host-files/index.ts";
import { askPage, chatFolder, findChatPage, notedFolder, notedPagePorts, pageNote, probeOf, probeWait } from "../ports/index.ts";

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
    // The chat is in a turn: the player's message started it, it called a tool, or a hook woke it, and its turn has not ended yet. A chat never started,
    // or just cleared, is not.
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
     * The player's message, or one the host sent for the doorbell or an agent, starts the chat's turn, as the prompt hook says: the hook of the turn
     * before is let go without a ring, and what the player does on the page meanwhile waits for the turn's end, as during a tool. A chat nobody heard
     * stays unheard until its first tool, which starts the AI's clock, held till then: the message moves no clock.
     */
    chatPrompted(): void
    {
        if (this.listener === undefined) {
            return;
        }

        this.listener.end("dismissed");
        this.listener = undefined;
        this.busy = true;
        this.changed();
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

    /**
     * A hook waits for the bell, so the chat's turn has ended; the hook before it, of a turn already ended, is let go. A ring no hook heard is dropped when
     * the chat is `told` all of it otherwise: by the player's message that came with the move the prompt hook played.
     */
    listen(request: IncomingMessage, response: ServerResponse, told = false): void
    {
        response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
        this.hooked = true;
        const missed = this.pending && !told;
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
 * Notes in the data folder the port a chat's page took off its folder's usual ports, one file per page, for the hook to find it there; then forgets, off
 * the caller's clock, the notes of its folder whose page is gone: nobody listens at the port, or another folder's page does. A page that answers late
 * is busy, not gone, and keeps its note. It throws when the note cannot be written.
 */
export function notePagePort(home: string, folder: string, port: number, wait = probeWait): Promise<void>
{
    const note = pageNote(home, port);
    mkdirSync(dirname(note), { recursive: true });
    writeAtomically(note, JSON.stringify({ folder: resolve(folder) }));
    return forgetGonePages(home, folder, port, wait);
}

/** Forgets the note of a page that closes, unless another folder's page took its port since; a note that cannot go is left for the next page to clear. */
export function forgetPagePort(home: string, folder: string, port: number): void
{
    const noted = notedFolder(home, port);

    if (noted !== undefined && samePath(noted, folder)) {
        try {
            rmSync(pageNote(home, port), { force: true });
        } catch {
            // The next page of the folder clears it.
        }
    }
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
    const found = await findChatPage(hook, ports);
    const { folder, port } = found;

    if (port === undefined) {
        return { folder, rang: false, why: found.why };
    }

    // The page lets the analyst go as the hook starts waiting, when none runs any more; and it rings for nothing older than the move the prompt hook played
    // for this chat, which hears it from the player's message itself.
    const shown = hook.session === undefined ? undefined : positionShownNote(folder);
    const told = shown !== undefined && shown.session === hook.session ? shown.stamp : undefined;
    const query = new URLSearchParams({ ...(hook.analystGone === true ? { analyst: "gone" } : {}), ...(told === undefined ? {} : { shown: told }) });
    const said = (await askPage(port, `/api/bell${query.size === 0 ? "" : `?${query}`}`)).text;
    return said === "ring" ? { folder, rang: true } : { folder, rang: false, why: said === undefined ? `the page at port ${port} did not answer` : `the page at port ${port} said "${said}"` };
}

/**
 * Forgets the notes of a folder's pages that are gone, but the one at `kept`: a page closed without forgetting its own, when nobody listens at its port or
 * another folder's page took it. A page that does not answer in time, or not as a page, may only be busy, and its note stays.
 */
async function forgetGonePages(home: string, folder: string, kept: number, wait: number): Promise<void>
{
    const others = notedPagePorts(home, folder).filter((port) => port !== kept);

    await Promise.all(others.map(async (port) => {
        const { refused, text } = await askPage(port, "/api/bell?probe", wait);
        const said = probeOf(text);

        if (refused || (said !== undefined && !samePath(said.folder, folder))) {
            forgetPagePort(home, folder, port);
        }
    }));
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
