// A chat with the AI in an AI host, as the table sees it: nothing here is of one host.
import type { startLineProcess } from "./process.ts";

/** What a tool of the host does, so that the table says yes or no without knowing the host. */
export type ToolKind = "chesspal" | "read" | "web" | "fetch" | "agent" | "image" | "shell" | "write" | "other";

export type HostEvent =
    /** The host said which chat this is and the model it runs: at the first turn, and when either changes. */
    | { type: "session"; session: string; model: string; }
    /** A turn the host began by itself, with no words of the player's, as OpenCode tells a subagent's answer once its turn ended; a turnEnd ends it. */
    | { type: "turnStart"; by: "host"; }
    /** A piece of the AI's prose; `block` grows with each new block of text in a turn. */
    | { type: "text"; block: number; text: string; }
    /** A tool the AI uses: for a tool of the chesspal server, `name` is the command's name alone. */
    | { type: "tool"; id: string; name: string; kind: ToolKind; state: "started" | "done" | "failed"; }
    /** A permission the host asked and the chat answered by its `allowed` kinds. */
    | { type: "permission"; name: string; kind: ToolKind; allowed: boolean; }
    /** The turn ended: done, stopped by interrupt(), or failed, with why in words a player can read. */
    | { type: "turnEnd"; reason: "done" | "interrupted" | "failed"; why?: string; }
    /** The host's process is gone: nothing comes after. */
    | { type: "ended"; why: string; };

export interface HostChat
{
    /** The player's words: a turn begins. False, and nothing is sent, while a turn runs, the host's own too, or once the chat ended. */
    send(text: string): boolean;
    /** Every event of the chat, in order; one listener (a later call replaces it). Events that came before a listener was set are kept and told to it when set. */
    onEvent(listener: (event: HostEvent) => void): void;
    /** Stops the turn in course, the host's own too: its end comes as a turnEnd "interrupted". Nothing between turns. */
    interrupt(): void;
    /** Ends the chat and its process; no event comes after. */
    close(): void;
}

export interface ChatOptions
{
    /** The chat's folder, where the host runs. */
    folder: string;
    /** The host's program on this computer. */
    program: { command: string; args: string[]; };
    /** The model, as the host names it, and the effort: fixed before the player's first words. */
    model: string;
    effort?: string;
    /** The host's own id of a chat to take up again. */
    session?: string;
    /**
     * The kinds of tools the AI may use: the others are not given to it where the host can, and refused when it asks. `read` is the chat's folder
     * alone: a tool that reads asking for a path outside it is refused.
     */
    allowed: ToolKind[];
    /** The environment of the host's process. */
    environment: NodeJS.ProcessEnv;
    /** What the chat's listener threw, which never stops the chat; by default a warning of this process. */
    failed?: (error: unknown) => void;
    /** Starts the process, the core's by default. Injected in tests. */
    start?: typeof startLineProcess;
    /** Runs `run` after `ms` and returns what cancels it; by default a timer that keeps no process alive. */
    later?: (ms: number, run: () => void) => () => void;
}

/** What the table knows of a host it can open a chat with: how to open it, its program, the environment it runs in, its model and efforts. */
export interface HostDriver
{
    /** Opens the chat; throws where the host's program cannot start. */
    open(options: ChatOptions): HostChat;
    /** What the chat's `folder` lacks for this host, in words that say how to mend it; undefined where it lacks nothing. */
    missing(folder: string): string | undefined;
    /** The host's own program on this computer, where it is installed by itself; undefined where it is not found. */
    program(environment: NodeJS.ProcessEnv, platform: string, home: string): { command: string; args: string[]; } | undefined;
    /** The environment the host's process gets, from the table's own. */
    environment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
    /** The models the host offers on this computer, asked of the host itself; an empty list where it does not say. Never throws, never hangs. */
    models(options: ModelsOptions): Promise<HostModel[]>;
    /** The model a new chat proposes, and the efforts the host knows, lowest first. */
    model: string;
    efforts: string[];
}

/** A model a host offers: `id` is what `ChatOptions.model` takes; its efforts lowest first, none where it takes no effort. */
export interface HostModel
{
    id: string;
    name: string;
    about?: string;
    efforts: string[];
}

/** What asking a host its models takes: where its program runs, the program, its environment; the start and the clock injected in tests. */
export interface ModelsOptions
{
    folder: string;
    program: { command: string; args: string[]; };
    environment: NodeJS.ProcessEnv;
    start?: typeof startLineProcess;
    later?: (ms: number, run: () => void) => () => void;
}

/**
 * Hands events to one listener in order, keeping those that come before it; an event told while another is being told waits its turn. What the listener
 * throws goes to `failed`, and the next event is told.
 */
export class EventQueue
{
    private readonly waiting: HostEvent[] = [];
    private listener: ((event: HostEvent) => void) | undefined;
    private telling = false;
    private closed = false;
    private readonly failed: (error: unknown) => void;

    constructor(failed: (error: unknown) => void)
    {
        this.failed = failed;
    }

    /** Sets the listener and tells it what waited. */
    listen(listener: (event: HostEvent) => void): void
    {
        this.listener = listener;
        this.drain();
    }

    tell(event: HostEvent): void
    {
        if (!this.closed) {
            this.waiting.push(event);
            this.drain();
        }
    }

    /** Drops what waits and tells nothing more. */
    close(): void
    {
        this.closed = true;
        this.waiting.length = 0;
    }

    private drain(): void
    {
        if (this.telling) {
            return;
        }

        this.telling = true;
        let event = this.next();

        while (event !== undefined && this.listener !== undefined) {
            try {
                this.listener(event);
            } catch (error) {
                this.failed(error);
            }

            event = this.next();
        }

        this.telling = false;
    }

    /** The next event to tell, while a listener hears and the queue is open. */
    private next(): HostEvent | undefined
    {
        return this.listener === undefined || this.closed ? undefined : this.waiting.shift();
    }
}

/** Whether a model's or a chat's name, as the player or a file gives it, may become an argument of the host's program: never one read as an option. */
export function isHostName(value: string): boolean
{
    return /^[A-Za-z0-9][\w.:/@[\]-]{0,199}$/.test(value);
}

/** What a chat's listener threw, where the table gave no handler: a warning of this process, never lost. */
export function warnFailed(error: unknown): void
{
    process.emitWarning(error instanceof Error ? error : String(error));
}

// How many of the host's last lines on its stderr say why it ended, and how long each may be.
const lastErrors = 5;
const errorLength = 300;

/** Keeps a line the host wrote on its stderr among its last ones. */
export function keepError(errors: string[], line: string): void
{
    if (line.trim() !== "") {
        errors.push(line.trim().slice(0, errorLength));
        errors.splice(0, Math.max(0, errors.length - lastErrors));
    }
}

/** The default clock of the waits: a timer that keeps no process alive. */
export function laterByTimer(ms: number, run: () => void): () => void
{
    const timer = setTimeout(run, ms);
    timer.unref();
    return () => clearTimeout(timer);
}
