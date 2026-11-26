// A chat with the AI in an AI host, as the table sees it: nothing here is of one host.
import { type LineProcess, startLineProcess } from "./process.ts";

/** What a tool of the host does, so that the table says yes or no without knowing the host. */
export type ToolKind = "chesspal" | "read" | "web" | "fetch" | "agent" | "image" | "shell" | "write" | "other";

/** Why a chat cannot play, beside the words: the player is not signed in to the host, or no longer. */
export type EndCode = "signin";

export type HostEvent =
    /**
     * The host said which chat this is and the model it runs: at the first turn, and when either changes; with the effort where the driver knows it, and the
     * efforts that model takes, where the host says them only once it is chosen.
     */
    | { type: "session"; session: string; model: string; effort?: string; efforts?: string[]; }
    /**
     * The host answered another model, or its effort, asked between turns with an error: the chat goes on with `model` and `effort` (none, the host's own),
     * as setModel named them; `model` is the one asked where only its effort was not taken.
     */
    | { type: "changeRefused"; asked: string; model: string; effort?: string; why: string; }
    /** The host took the model and effort asked with setModel, or the model alone where a changeRefused said the effort was not: told once, after that. */
    | { type: "changeTaken"; model: string; }
    /** A turn the host began by itself, with no words of the player's, as OpenCode tells a subagent's answer once its turn ended; a turnEnd ends it. */
    | { type: "turnStart"; by: "host"; }
    /** A piece of the AI's prose; `block` grows with each new block of text in a turn. */
    | { type: "text"; block: number; text: string; }
    /** A tool the AI uses: for a tool of the chesspal server, `name` is the command's name alone. */
    | { type: "tool"; id: string; name: string; kind: ToolKind; state: "started" | "done" | "failed"; }
    /** A permission the host asked and the chat answered by its `allowed` kinds. */
    | { type: "permission"; name: string; kind: ToolKind; allowed: boolean; }
    /**
     * The turn ended: done, stopped by interrupt(), or failed, with why in words a player can read, and its code where it has one; and the turn's tokens
     * where the host reports them, its input counting those of its cache too.
     */
    | { type: "turnEnd"; reason: "done" | "interrupted" | "failed"; why?: string; code?: EndCode; usage?: TurnUsage; }
    /** The host's process is gone: nothing comes after. */
    | { type: "ended"; why: string; code?: EndCode; };

/**
 * A turn's tokens: its input, the cache's included, and its output, summed over every request of the turn; and, where the host tells it, `context`, the input
 * of the turn's last request, which is how full the chat's context is.
 */
export interface TurnUsage
{
    input: number;
    output: number;
    context?: number;
}

export interface HostChat
{
    /** The player's words: a turn begins. False, and nothing is sent, while a turn runs, the host's own too, or once the chat ended. */
    send(text: string): boolean;
    /** Every event of the chat, in order; one listener (a later call replaces it). Events that came before a listener was set are kept and told to it when set. */
    onEvent(listener: (event: HostEvent) => void): void;
    /** Stops the turn in course, the host's own too: its end comes as a turnEnd "interrupted". Nothing between turns. */
    interrupt(): void;
    /**
     * Another model, and effort where given, from the next turn: the player's next words wait until the host confirms them, and the host's confirmation
     * comes as a changeTaken event; an error of the host's, as a changeRefused event, the chat going on as before. False, and nothing is asked, while a turn
     * runs, the host's own too, before the chat is ready, or once it ended. An effort not given stays as the host has it.
     */
    setModel?(model: string, effort?: string): boolean;
    /**
     * Ends the chat and its process, stopped at once; `gently`, as the table ends every chat, the player's too, its input closed so that it ends by itself,
     * and stopped only where it is still there after a grace. No event comes after.
     */
    close(gently?: boolean): void;
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
    /** The MCP server the chat gets, given by whoever opens it instead of the folder's files: then the chat's servers are this one alone. */
    server?: ChatServer;
    /** What the chat is told before the player's first words: who it is and how it works. */
    instructions?: string;
    /** What the chat's listener threw, which never stops the chat; by default a warning of this process. */
    failed?: (error: unknown) => void;
    /** What the chat tells the table's log, never the player: as a wait over that went on without what it waited for. */
    log?: (line: string) => void;
    /** A file every line written to the host and read from it is added to, with its way and time; none by default. */
    trace?: string;
    /** Starts the process, the core's by default. Injected in tests. */
    start?: typeof startLineProcess;
    /** Runs `run` after `ms` and returns what cancels it; by default a timer that keeps no process alive. */
    later?: (ms: number, run: () => void) => () => void;
}

/**
 * An MCP server as whoever opens a chat gives it: its name, the command that starts it and its environment, which is the server's own, in its
 * configuration: it may carry a secret, so it is never on the host's command line nor in its process's environment.
 */
export interface ChatServer
{
    name: string;
    command: string;
    args: string[];
    environment: Record<string, string>;
}

/** What the table knows of a host it can open a chat with: how to open it, its program, the environment it runs in, its model and efforts. */
export interface HostDriver
{
    /** Opens the chat; throws where the host's program cannot start. */
    open(options: ChatOptions): HostChat;
    /**
     * What the chat's `folder` lacks for this host, in words that say how to mend it; undefined where it lacks nothing. Whoever gives the chat its `server`
     * does not ask it: the folder's own files are not read then.
     */
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
    /** The host lists the efforts of the model in play alone: another's are known once it is chosen, and an effort it does not take is left out. */
    effortsOnceChosen?: true;
}

/**
 * A model a host offers: `id` is what `ChatOptions.model` takes; its efforts lowest first, none where it takes no effort. `advised`, the host's own
 * default; `metered`, paid apart for each answer, on the player's key of a provider; `group`, the provider, in a host that lists many.
 */
export interface HostModel
{
    id: string;
    name: string;
    about?: string;
    efforts: string[];
    advised?: true;
    metered?: true;
    group?: string;
}

/**
 * What asking a host its models takes: where its program runs, the program, its environment; where to say when it started and how it ended; the start and
 * the clock injected in tests.
 */
export interface ModelsOptions
{
    folder: string;
    program: { command: string; args: string[]; };
    environment: NodeJS.ProcessEnv;
    log?: (line: string) => void;
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

/** The variable of the table's environment that names the file of a trace: never given to a host's process. */
export const traceVariable = "CHESSPAL_HOST_TRACE";

/** The environment of a host's process without the table's trace, which only the table reads. */
export function withoutTrace(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv
{
    return Object.fromEntries(Object.entries(environment).filter(([name]) => name.toUpperCase() !== traceVariable));
}

/** Whether a model's or a chat's name, as the player or a file gives it, may become an argument of the host's program: never one read as an option. */
export function isHostName(value: string): boolean
{
    return /^[A-Za-z0-9][\w.:/@[\]-]{0,199}$/.test(value);
}

/** Throws, before any process starts, where a driver that does not take them yet is given a server or instructions. */
export function refuseGiven(options: ChatOptions, host: string): void
{
    if (options.server !== undefined || options.instructions !== undefined) {
        throw new Error(`${host}'s driver does not take its server or its instructions from the table yet.`);
    }
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

/** How long a host's program has to end by itself once its input is closed, before it is stopped. */
export const graceWait = 10_000;

/**
 * Lets a host's program that is done end by itself, as one that may be saving the player's login, which a kill would lose: its input closed, and stopped only
 * where it is still there after a grace. `ended` hears how it went.
 */
export function letGo(host: LineProcess, later: (ms: number, run: () => void) => () => void, ended?: (how: "by itself" | "stopped") => void): void
{
    let done = false;

    const cancel = later(graceWait, () => {
        if (!done) {
            done = true;
            host.stop();
            ended?.("stopped");
        }
    });

    host.onEnd(() => {
        if (!done) {
            done = true;
            cancel();
            ended?.("by itself");
        }
    });
    host.closeInput();
}

/**
 * A host's program asked for its models: started with `args` after its own, given `wait` to answer through `talk`, which reads its lines and calls `answer`.
 * Once answered it is let go, and so is one that does not answer in time. What `talk` returns gives the models found so far, for a program that
 * ends or is late. The log says when it started and how it ended.
 */
export function hostModels(options: ModelsOptions, args: string[], wait: number, talk: (host: LineProcess, answer: (models: HostModel[]) => void) => (() => HostModel[]) | undefined): Promise<HostModel[]>
{
    const start = options.start ?? startLineProcess;
    const later = options.later ?? laterByTimer;
    const log = options.log ?? (() => undefined);

    return new Promise((done) => {
        let host: LineProcess;

        try {
            host = start(options.program.command, [...options.program.args, ...args], { cwd: options.folder, env: options.environment, errors: () => undefined });
        } catch (error) {
            log(`could not start for its models: ${error instanceof Error ? error.message : String(error)}.`);
            done([]);
            return;
        }

        log(`started for its models${host.pid === undefined ? "" : ` (process ${String(host.pid)})`}.`);
        let finished = false;
        let found = (): HostModel[] => [];

        const finish = (models: HostModel[], how: "answered" | "late" | { ended: string; }): void => {
            if (finished) {
                return;
            }

            finished = true;
            cancel();
            done(models);

            if (how === "answered") {
                letGo(host, later, (went) => log(went === "by itself" ? "ended by itself once asked its models." : `was stopped ${String(graceWait / 1000)} s after it gave its models.`));
            } else if (how === "late") {
                // Late, it may be renewing the player's login: let go as one that answered, never stopped at once.
                const late = `it did not give its models within ${String(wait / 1000)} s`;
                letGo(host, later, (went) => log(went === "by itself" ? `ended by itself: ${late}.` : `was stopped: ${late}, nor ended in ${String(graceWait / 1000)} s more.`));
            } else {
                log(`ended before it gave its models (${how.ended}).`);
            }
        };

        const cancel = later(wait, () => finish(found(), "late"));
        host.onEnd((reason) => finish(found(), { ended: reason }));
        found = talk(host, (models) => finish(models, "answered")) ?? found;
    });
}
