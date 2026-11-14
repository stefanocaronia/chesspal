// The doorbell for the page (D-47): `chesspal listen`, the Stop hook init writes for Claude Code, Codex and Antigravity, waits at the page of its chat and, when
// the player moves or writes there, tells the chat to call status. It never carries the move, the words or the position: status reads them fresh.
import { closeSync, fstatSync, mkdirSync, openSync, readFileSync, rmSync, writeSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, join, resolve } from "node:path";
import { positionShownNote, writeAtomically } from "../../games/index.ts";
import { samePath } from "../../home/index.ts";
import { analystAgent } from "../../host-files/index.ts";
import { askPage, chatFolder, findChatPage, notedFolder, notedPagePorts, pageNote, probeOf, probeWait } from "../ports/index.ts";
import { watchNewTurn } from "./antigravity.ts";

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
    // The chat's last hook went without the bell, or a ring found it stopped in its turn: it is out of its turn, and nobody hears the player.
    private unheard = false;
    // Looks again, while a ring waits for a chat in a turn, whether the chat was stopped meanwhile.
    private stopWatch: NodeJS.Timeout | undefined;
    private readonly news: () => boolean;
    private readonly changed: () => void;
    private readonly stopped: () => boolean;
    private readonly log: (line: string) => void;

    /**
     * `news` says whether a ring no hook heard is still worth waking the chat for; `changed` is told when what the page shows of the chat may change: it
     * starts or stops listening, the doorbell wakes it, its turn ends; `stopped` whether the host says the chat was stopped in its turn (Esc), which no
     * hook tells; `log` takes a line for the doorbell's log at each change of its state.
     */
    constructor(news: () => boolean = () => true, changed: () => void = () => undefined, stopped: () => boolean = () => false, log: (line: string) => void = () => undefined)
    {
        this.news = news;
        this.changed = changed;
        this.stopped = stopped;
        this.log = log;
    }

    /** Whether the chat is in a turn, as far as the doorbell knows: a chat stopped with Esc stays in it until its next tool, or until a ring finds it stopped. */
    get inTurn(): boolean
    {
        return this.busy;
    }

    /** Whether the doorbell woke the chat in the turn it is in. */
    get woke(): boolean
    {
        return this.woken;
    }

    /** Whether the chat is out of its turn and hears nobody: its hook went without the bell, or it was stopped; until it calls a tool or a hook waits again. */
    get deaf(): boolean
    {
        return this.unheard;
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
        const changes = !this.busy || this.unheard;
        this.busy = true;
        this.unheard = false;

        // Only a call that changes the state is logged: the chat calls a tool at every step of its turn.
        if (changes) {
            this.note("chatCalls");
        }

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
        // A chat nobody heard is in its turn now, though still unheard.
        if (this.listener === undefined) {
            const deaf = this.unheard;
            this.unheard = false;
            this.note("chatPrompted");
            this.tellIf(deaf);
            return;
        }

        this.listener.end("dismissed");
        this.listener = undefined;
        this.busy = true;
        this.note("chatPrompted, the hook dismissed");
        this.changed();
    }

    /**
     * The player acted on the page: the hook waiting hears it now, or the next one as soon as it comes. In a host that runs no hook nothing tells the end of
     * a turn: an act the chat waits for finds it out of its turn, and nobody hears the player, unless the chat `mayBeAtWork` on the AI's move meanwhile.
     * A chat stopped in its turn ends no turn either: while the ring waits, the doorbell looks every `stopCheck` whether the host says so.
     */
    ring(mayBeAtWork = false): void
    {
        const ring = mayBeAtWork ? "ring mayBeAtWork" : "ring";

        if (this.listener === undefined) {
            this.pending = true;

            if (!this.hooked && !mayBeAtWork && this.busy) {
                this.busy = false;
                this.note(`${ring}, the chat out of its turn`);
                this.changed();
            } else {
                this.note(`${ring}, it waits`);
                this.watchForStop();
            }

            return;
        }

        this.listener.end("ring");
        this.listener = undefined;
        this.busy = true;
        this.woken = true;
        this.note(`${ring}, the hook heard it`);
        this.changed();
    }

    /**
     * A hook waits for the bell, so the chat's turn has ended; the hook before it, of a turn already ended, is let go. A ring no hook heard is dropped when
     * the chat is `told` all of it otherwise: by the player's message that came with the move the prompt hook played.
     */
    listen(request: IncomingMessage, response: ServerResponse, told = false, hook: HookSeen = {}): void
    {
        response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
        this.hooked = true;
        this.unheard = false;
        const missed = this.pending && !told;
        this.pending = false;
        const who = hookNamed(hook);

        if (missed && this.news()) {
            response.end("ring");
            this.busy = true;
            this.woken = true;
            this.note(`listen${who}, rung at once for a ring it missed`);
            this.changed();
            return;
        }

        this.busy = false;
        this.woken = false;
        this.listener?.end("dismissed");
        this.listener = response;
        this.note(`listen${who}${told ? ", told" : ""}`);
        this.changed();
        request.on("close", () => {
            if (this.listener === response) {
                // The hook went without the bell (the chat stopped, cleared or closed, or its host ended the hook): nobody hears the player until the chat calls
                // a tool again, but the chat is out of its turn.
                this.listener = undefined;
                this.unheard = !this.busy;
                this.note(`hook gone without the bell${who}`);
                this.tellIf(this.unheard);
            }
        });
    }

    /** The chat left the table (D-104): its process ended, and nobody is in a turn or waits for the bell; a ring no hook heard is no longer news for anyone. */
    chatLeft(): void
    {
        this.hooked = false;
        this.busy = false;
        this.woken = false;
        this.unheard = false;
        this.pending = false;
        this.listener?.end("dismissed");
        this.listener = undefined;
        this.note("chatLeft");
        this.changed();
    }

    /** Writes a line in the doorbell's log: what happened, and the doorbell's state after it. */
    note(event: string): void
    {
        this.log(`bell ${event} -> ${this.state()}`);
    }

    private tellIf(changed: boolean): void
    {
        if (changed) {
            this.changed();
        }
    }

    /** A ring waits for a chat in its turn: a chat stopped there, which nobody hears, is out of it now, and the page says where to wake it. */
    private watchForStop(): void
    {
        if (this.stopWatch !== undefined || !this.waitsInTurn()) {
            return;
        }

        if (this.stopped()) {
            this.busy = false;
            this.woken = false;
            this.unheard = true;
            this.note("the chat found stopped in its turn");
            this.changed();
            return;
        }

        this.stopWatch = setTimeout(() => {
            this.stopWatch = undefined;
            this.watchForStop();
        }, stopCheck);
        this.stopWatch.unref();
    }

    private waitsInTurn(): boolean
    {
        return this.pending && this.busy && this.listener === undefined;
    }

    /** The doorbell's state for its log: the names of what holds, `idle` when none. */
    private state(): string
    {
        const held = { busy: this.busy, woken: this.woken, waiting: this.listener !== undefined, listening: this.listening, unheard: this.unheard, pending: this.pending, hooked: this.hooked };
        const names = Object.entries(held).filter(([, holds]) => holds).map(([name]) => name);
        return names.length === 0 ? "idle" : names.join(" ");
    }
}

/** What the page hears of a hook that waits at its doorbell, for the log: its chat's session and its process, when it says them. */
export interface HookSeen
{
    session?: string | undefined;
    pid?: string | undefined;
}

function hookNamed(hook: HookSeen): string
{
    // What a request says goes in the log as one short word.
    const word = (text: string): string => text.replace(/[^\w.-]/g, "?").slice(0, 64);
    return `${hook.session === undefined ? "" : ` session=${word(hook.session)}`}${hook.pid === undefined ? "" : ` pid=${word(hook.pid)}`}`;
}

/** How often the doorbell looks whether a chat a ring waits for was stopped in its turn. */
export const stopCheck = 2_000;

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

/** What Antigravity's Stop hook answers to wake the chat: its turn goes on, the doorbell's line given as a system message (D-115). */
export const antigravityBellAnswer = JSON.stringify({ decision: "continue", reason: bellLine });

/** The host whose Stop hook runs `chesspal listen`, as its flag names it: Claude Code with none. */
export type ListeningHost = "claude" | "codex" | "antigravity";

/**
 * Reads the hook's input, waits for the bell, and ends the process as the host reads it: for Claude Code's asyncRewake, 2 with the line on stderr; for
 * Codex's and Antigravity's Stop hooks, 0 with their answer on stdout, since Windows PowerShell, which runs Codex's hooks, turns an exit code 2 into 1.
 * Else 0, saying nothing, or for Antigravity an empty answer, which lets its chat stop. Antigravity's hook holds the chat: it lets it go as soon as the
 * player writes in the chat or stops it, without the bell.
 */
export async function listen(host: ListeningHost = "claude"): Promise<void>
{
    let input = "";

    for await (const chunk of process.stdin) {
        input += String(chunk);
    }

    // The hook leaves a line as it starts and as it ends, beside the page's: a chat its bell never woke shows whether the hook ran at all, and why it ended.
    const hook = hookInput(input);
    const folder = chatFolder(hook);
    const who = `hook ${host} pid=${process.pid}`;
    noteBell(folder, `${who}${hook.session === undefined ? "" : ` session=${hook.session}`} waiting`);

    const conversation = host === "antigravity" ? hook.session : undefined;
    const turn = conversation === undefined ? undefined : watchNewTurn(conversation);
    const waited = bellHeard(input).catch((error: unknown): BellHeard => ({ folder, rang: false, why: `failed: ${(error as Error).message}` }));
    const newTurn = turn?.started.then((): BellHeard => ({ folder, rang: false, why: "the player started a new turn" }));
    const heard = await (newTurn === undefined ? waited : Promise.race([waited, newTurn]));
    turn?.stop();
    noteBell(heard.folder, `${who} ${heard.rang ? "rang" : heard.why}`);

    // It ends as soon as it knows: the chat hears the hook only once it ends.
    const answer = hookAnswer(host, heard.rang);

    if (answer === undefined) {
        process.exit(0);
    } else if (host === "claude") {
        process.stderr.write(`${answer}\n`, () => process.exit(2));
    } else {
        process.stdout.write(`${answer}\n`, () => process.exit(0));
    }
}

/** What the hook says as it ends, by its host: the doorbell's line or answer when it rang; else nothing, but for Antigravity, which reads an answer. */
export function hookAnswer(host: ListeningHost, rang: boolean): string | undefined
{
    if (host === "antigravity") {
        return rang ? antigravityBellAnswer : "{}";
    }

    if (!rang) {
        return undefined;
    }

    return host === "codex" ? codexBellAnswer : bellLine;
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
    // Its session and process go with it, for the page's log.
    const query = new URLSearchParams({
        ...(hook.analystGone === true ? { analyst: "gone" } : {}),
        ...(told === undefined ? {} : { shown: told }),
        ...(hook.session === undefined ? {} : { session: hook.session }),
        pid: String(process.pid),
    });
    const said = (await askPage(port, `/api/bell?${query}`)).text;
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

// The doorbell's log, in the chat's folder: the page's changes of the doorbell and of the sign it shows, the hooks' starts and ends. A line is appended,
// and only once the log grows past its size is it cut to its last half: no rewrite at every line.
const bellLog = "listen.log";
const bellLogBytes = 256 * 1024;

/** Adds a line to the doorbell's log, with the time to the millisecond; a log that cannot be written never stops the page or the hook. */
export function noteBell(folder: string, line: string, now = new Date()): void
{
    const path = join(folder, bellLog);

    try {
        const descriptor = openSync(path, "a");
        let size = 0;

        try {
            // One write, so that the page's lines and the hook's, from two processes, never mix.
            writeSync(descriptor, `${now.toISOString()} ${line.replace(/\s+/g, " ")}\n`);
            size = fstatSync(descriptor).size;
        } finally {
            closeSync(descriptor);
        }

        if (size > bellLogBytes) {
            const kept = readFileSync(path, "utf8").slice(-bellLogBytes / 2);
            writeAtomically(path, kept.slice(kept.indexOf("\n") + 1));
        }
    } catch {
        // The log only explains; the page and the hook go on the same.
    }
}

/** What the hook reads of its host's input: the chat's session, Antigravity's conversation, its folder, and whether its analyst has gone. */
function hookInput(input: string): { session?: string; cwd?: string; analystGone?: true; }
{
    try {
        const parsed = JSON.parse(input) as { session_id?: unknown; conversationId?: unknown; cwd?: unknown; background_tasks?: unknown; };
        const session = typeof parsed.session_id === "string" ? parsed.session_id : parsed.conversationId;
        return {
            ...(typeof session === "string" ? { session } : {}),
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
