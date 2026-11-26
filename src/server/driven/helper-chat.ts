// A helper's chat the table opens beside the opponent's, in the opponent's host: in a folder of its role's, at a place of that role. It may be opened
// ahead, its program started and waiting with no word sent, so no request made; a prompt asked before its program has started is sent once it has.
import { homedir } from "node:os";
import { join } from "node:path";
import type { Caller, Context, HelperRole, TableHelpers } from "../../commands/index.ts";
import { makeFolder } from "../../games/index.ts";
import { tableHelperInstructions } from "../../host-files/index.ts";
import type { HostChat, HostDriver, HostEvent, HostId } from "../../hosts/index.ts";
import type { Place, TablePlaces } from "../places/index.ts";
import { chatEnvironment, chatTrace } from "./environment.ts";
import { failureCode } from "./failure.ts";
import { chatModel, type DrivenHost } from "./hosts.ts";
import type { Starts } from "./starts.ts";

/** The host a helper's chat runs in, the model as the host names it, and its effort: the driver's own model where `model` is empty. */
export interface HelperModel
{
    readonly host: DrivenHost;
    readonly model: string;
    readonly effort?: string | undefined;
}

/** What a helper's chat runs with: the table's context, the field its place answers from, and how the table starts its chats. */
export interface HelperChatOptions
{
    readonly context: Context;
    readonly helpers: TableHelpers;
    readonly places: () => Promise<TablePlaces>;
    readonly driver: (host: HostId) => Promise<HostDriver>;
    readonly chesspal: readonly string[];
    readonly environment: NodeJS.ProcessEnv;
    readonly log: (line: string) => void;
    /** The starts of the table's programs, one at a time, each after the program before of its role exited. */
    readonly starts: Starts;
}

/**
 * How a helper's turn ended: by itself, with what it wrote last outside its tools; stopped; or failed, its program ended or never started, with why, and
 * whether the host said the player is not signed in.
 */
export type HelperEnd =
    | { readonly reason: "done"; readonly text: string; }
    | { readonly reason: "interrupted"; }
    | { readonly reason: "failed"; readonly why: string; readonly signin: boolean; };

/** What the table hears of a helper's chat: each turn that ends and the failure that closes it, and each tool's result at its place. */
export interface HelperHeard
{
    ended(end: HelperEnd): void;
    answered?(tool: string, result: unknown): void;
}

/** A helper's chat, as the table drives it. */
export interface HelperChat
{
    /** Gives the chat a turn: at once when its program has started, else once it has; one asked before and not sent yet is replaced. */
    ask(prompt: string): void;
    /** Stops the turn running, and lets the prompt waiting go. */
    interrupt(): void;
    /** Ends the chat gently, its turn stopped first: nothing is told after. */
    close(): void;
    /** Whether a turn runs, or waits to be sent. */
    busy(): boolean;
    /** When the turn running began: none at rest. */
    turnSince(): Date | undefined;
}

/** Opens the chat of `role` in `<home>/chats/<role>`. */
export function openHelperChat(role: HelperRole, model: HelperModel, options: HelperChatOptions, heard: HelperHeard): HelperChat
{
    const { context } = options;
    const folder = join(context.home(), "chats", role);
    let chat: HostChat | undefined;
    let place: Place | undefined;
    let pending: string | undefined;
    let since: Date | undefined;
    let closed = false;
    let prose: string[] = [];
    let runs: HelperModel = model;
    let started = (): void => undefined;

    const send = (): void => {
        if (chat === undefined || since !== undefined || pending === undefined) {
            return;
        }

        const prompt = pending;
        pending = undefined;
        prose = [];

        if (chat.send(prompt)) {
            since = context.now();
        }
    };

    const close = (): void => {
        if (closed) {
            return;
        }

        closed = true;
        pending = undefined;
        started();

        if (since !== undefined) {
            chat?.interrupt();
        }

        since = undefined;
        chat?.close(true);
        place?.withdraw();
    };

    const fail = (why: string, signin: boolean): void => {
        if (closed) {
            return;
        }

        close();
        options.log(`helper ${role} failed: ${why}`);
        heard.ended({ reason: "failed", why, signin: signin || failureCode(why) === "not-signed-in" });
    };

    const told = (event: HostEvent): void => {
        if (closed) {
            return;
        }

        if (event.type === "session") {
            started();
            runs = { host: runs.host, model: event.model, effort: event.effort ?? runs.effort };
        } else if (event.type === "text") {
            prose[event.block] = `${prose[event.block] ?? ""}${event.text}`;
        } else if (event.type === "turnEnd") {
            started();
            since = undefined;

            if (event.reason === "failed") {
                fail(event.why ?? `The ${role}'s turn failed.`, event.code === "signin");
                return;
            }

            heard.ended(event.reason === "done" ? { reason: "done", text: lastBlock(prose) } : { reason: "interrupted" });
            send();
        } else if (event.type === "ended") {
            fail(event.why, event.code === "signin");
        }
    };

    const open = async (): Promise<void> => {
        const driver = await options.driver(model.host.driver);
        const program = driver.program(options.environment, context.platform, context.userHome?.() ?? homedir());

        if (program === undefined) {
            throw new Error(`${model.host.title}'s program was not found where the table looks for it.`);
        }

        makeFolder(folder);
        const caller = (): Promise<Caller | undefined> => Promise.resolve({ annotator: runs.model, ...(runs.effort === undefined ? {} : { effort: runs.effort }) });

        const answered = (tool: string, result: unknown): void => {
            if (!closed) {
                heard.answered?.(tool, result);
            }
        };

        place = await (await options.places()).offer(role, folder, { caller, helpers: options.helpers, answered });
        const turn = await options.starts.next(role);
        started = () => turn.opened();

        if (closed) {
            started();
            place.withdraw();
            return;
        }

        // A chat opened ahead says which chat it is only at its first words: its server sat at its place says its program is up.
        void place.seated.then(started);
        const [command, ...args] = options.chesspal;
        const choice = { ...(model.model === "" ? {} : { model: model.model }), ...(model.effort === undefined ? {} : { effort: model.effort }) };
        const trace = chatTrace(options.environment, role, context.now());
        runs = { host: model.host, model: model.model === "" ? driver.model : model.model, effort: model.effort };
        chat = driver.open({
            folder,
            program,
            ...chatModel(model.host, runs.model, model.effort),
            allowed: [...model.host.allowed],
            environment: chatEnvironment(driver, options.environment, model.host.name, choice),
            server: { name: "chesspal", command: command ?? process.execPath, args: [...args, "mcp"], environment: { ...place.environment } },
            instructions: tableHelperInstructions(role),
            log: options.log,
            start: options.starts.starter(role),
            ...(trace === undefined ? {} : { trace }),
        });
        chat.onEvent(told);
        send();
    };

    void open().catch((error: unknown) => fail((error as Error).message, false));

    return {
        ask: (prompt) => {
            if (!closed) {
                pending = prompt;
                send();
            }
        },
        interrupt: () => {
            pending = undefined;

            if (since !== undefined) {
                chat?.interrupt();
            }
        },
        close,
        busy: () => since !== undefined || pending !== undefined,
        turnSince: () => since,
    };
}

/** The last block the chat wrote outside its tools, trimmed: empty where it wrote none. */
function lastBlock(prose: readonly string[]): string
{
    return [...prose].reverse().find((block) => block !== undefined && block.trim() !== "")?.trim() ?? "";
}
