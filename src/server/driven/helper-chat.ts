// A helper's chat the table opens beside the opponent's: Claude Code in a folder of its role's, at a place of that role, given one turn at a time; a prompt
// asked while a turn runs waits, and only the latest asked is sent.
import { homedir } from "node:os";
import { join } from "node:path";
import type { Caller, Context, HelperRole, TableHelpers } from "../../commands/index.ts";
import { makeFolder } from "../../games/index.ts";
import { tableHelperInstructions } from "../../host-files/index.ts";
import type { HostChat, HostDriver, HostEvent } from "../../hosts/index.ts";
import type { Place, TablePlaces } from "../places/index.ts";
import { chatEnvironment } from "./environment.ts";
import { failureCode } from "./failure.ts";
import type { Starts } from "./starts.ts";

/** The model a helper's chat runs, as the host names it, and its effort: the driver's own model where `model` is empty. */
export interface HelperModel
{
    readonly model: string;
    readonly effort?: string | undefined;
}

/** What a helper's chat runs with: the table's context, the field its place answers from, and how the table starts Claude Code's chats. */
export interface HelperChatOptions
{
    readonly context: Context;
    readonly helpers: TableHelpers;
    readonly places: () => Promise<TablePlaces>;
    readonly driver: () => Promise<HostDriver>;
    readonly chesspal: readonly string[];
    readonly environment: NodeJS.ProcessEnv;
    readonly log: (line: string) => void;
    /** The starts of the table's programs, one at a time. */
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

/** A helper's chat, as the table drives it. */
export interface HelperChat
{
    /** Gives the chat a turn: at once when it is at rest, else once its turn ends, in place of any other prompt waiting; `sent` hears when it goes. */
    ask(prompt: string, sent?: () => void): void;
    /** Stops the turn running, and lets the prompt waiting go. */
    interrupt(): void;
    /** Ends the chat gently, its turn stopped first: nothing is told after. */
    close(): void;
    /** Whether a turn runs, or waits to be sent. */
    busy(): boolean;
    /** When the turn running began: none at rest. */
    turnSince(): Date | undefined;
}

/** Opens the chat of `role` in `<home>/chats/<role>`; `ended` hears each turn that ends and the failure that closes it. */
export function openHelperChat(role: HelperRole, model: HelperModel, options: HelperChatOptions, ended: (end: HelperEnd) => void): HelperChat
{
    const { context } = options;
    const folder = join(context.home(), "chats", role);
    let chat: HostChat | undefined;
    let place: Place | undefined;
    let pending: { prompt: string; sent?: (() => void) | undefined; } | undefined;
    let since: Date | undefined;
    let closed = false;
    let prose: string[] = [];
    let runs: HelperModel = model;
    let started = (): void => undefined;

    const send = (): void => {
        if (chat === undefined || since !== undefined || pending === undefined) {
            return;
        }

        const { prompt, sent } = pending;
        pending = undefined;
        prose = [];

        if (chat.send(prompt)) {
            since = context.now();
            sent?.();
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
        ended({ reason: "failed", why, signin: signin || failureCode(why) === "not-signed-in" });
    };

    const heard = (event: HostEvent): void => {
        if (closed) {
            return;
        }

        if (event.type === "session") {
            started();
            runs = { model: event.model, effort: event.effort ?? runs.effort };
        } else if (event.type === "text") {
            prose[event.block] = `${prose[event.block] ?? ""}${event.text}`;
        } else if (event.type === "turnEnd") {
            started();
            since = undefined;

            if (event.reason === "failed") {
                fail(event.why ?? `The ${role}'s turn failed.`, event.code === "signin");
                return;
            }

            ended(event.reason === "done" ? { reason: "done", text: lastBlock(prose) } : { reason: "interrupted" });
            send();
        } else if (event.type === "ended") {
            fail(event.why, event.code === "signin");
        }
    };

    const open = async (): Promise<void> => {
        const driver = await options.driver();
        const program = driver.program(options.environment, context.platform, context.userHome?.() ?? homedir());

        if (program === undefined) {
            throw new Error("Claude Code's program was not found where the table looks for it.");
        }

        makeFolder(folder);
        const caller = (): Promise<Caller | undefined> => Promise.resolve({ annotator: runs.model, ...(runs.effort === undefined ? {} : { effort: runs.effort }) });
        place = await (await options.places()).offer(role, folder, { caller, helpers: options.helpers });
        const turn = await options.starts.next();
        started = () => turn.opened();

        if (closed) {
            started();
            place.withdraw();
            return;
        }

        const [command, ...args] = options.chesspal;
        const choice = { ...(model.model === "" ? {} : { model: model.model }), ...(model.effort === undefined ? {} : { effort: model.effort }) };
        runs = { model: model.model === "" ? driver.model : model.model, effort: model.effort };
        chat = driver.open({
            folder,
            program,
            model: runs.model,
            ...(model.effort === undefined ? {} : { effort: model.effort }),
            allowed: ["chesspal"],
            environment: chatEnvironment(driver, options.environment, choice),
            server: { name: "chesspal", command: command ?? process.execPath, args: [...args, "mcp"], environment: { ...place.environment } },
            instructions: tableHelperInstructions(role),
            log: options.log,
        });
        chat.onEvent(heard);
        send();
    };

    void open().catch((error: unknown) => fail((error as Error).message, false));

    return {
        ask: (prompt, sent) => {
            if (!closed) {
                pending = { prompt, sent };
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
