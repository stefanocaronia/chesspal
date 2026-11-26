// A helper's chat the table opens beside the opponent's: Claude Code in a folder of its role's, at a place of that role, given one turn at a time; a prompt
// asked while a turn runs waits, and only the latest asked is sent.
import { homedir } from "node:os";
import { join } from "node:path";
import type { Caller, Context, HelperRole, TableHelpers } from "../../commands/index.ts";
import { makeFolder } from "../../games/index.ts";
import { tableHelperInstructions } from "../../host-files/index.ts";
import type { HostChat, HostDriver, HostEvent } from "../../hosts/index.ts";
import type { Place, TablePlaces } from "../places/index.ts";
import { hostEnvironment } from "../table/index.ts";

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
}

/** How a helper's turn ended: by itself, with what it wrote last outside its tools; or failed, its program ended or never started, with why. */
export type HelperEnd = { readonly reason: "done"; readonly text: string; } | { readonly reason: "failed"; readonly why: string; };

/** A helper's chat, as the table drives it. */
export interface HelperChat
{
    /** Gives the chat a turn: at once when it is at rest, else once its turn ends, in place of any other prompt waiting. */
    ask(prompt: string): void;
    /** Stops the turn running, and lets the prompt waiting go. */
    interrupt(): void;
    /** Ends the chat gently, its turn stopped first: nothing is told after. */
    close(): void;
}

/** Opens the chat of `role` in `<home>/chats/<role>`; `ended` hears each turn that ends by itself and the failure that closes it. */
export function openHelperChat(role: HelperRole, model: HelperModel, options: HelperChatOptions, ended: (end: HelperEnd) => void): HelperChat
{
    const { context } = options;
    const folder = join(context.home(), "chats", role);
    let chat: HostChat | undefined;
    let place: Place | undefined;
    let pending: string | undefined;
    let inTurn = false;
    let closed = false;
    let prose: string[] = [];
    let runs: HelperModel = model;

    const send = (): void => {
        if (chat === undefined || inTurn || pending === undefined) {
            return;
        }

        const prompt = pending;
        pending = undefined;
        prose = [];
        inTurn = chat.send(prompt);
    };

    const close = (): void => {
        if (closed) {
            return;
        }

        closed = true;
        pending = undefined;

        if (inTurn) {
            chat?.interrupt();
        }

        chat?.close(true);
        place?.withdraw();
    };

    const fail = (why: string): void => {
        if (closed) {
            return;
        }

        close();
        options.log(`helper ${role} failed: ${why}`);
        ended({ reason: "failed", why });
    };

    const heard = (event: HostEvent): void => {
        if (closed) {
            return;
        }

        if (event.type === "session") {
            runs = { model: event.model, effort: event.effort ?? runs.effort };
        } else if (event.type === "text") {
            prose[event.block] = `${prose[event.block] ?? ""}${event.text}`;
        } else if (event.type === "turnEnd") {
            inTurn = false;

            if (event.reason === "failed") {
                fail(event.why ?? `The ${role}'s turn failed.`);
                return;
            }

            if (event.reason === "done") {
                ended({ reason: "done", text: lastBlock(prose) });
            }

            send();
        } else if (event.type === "ended") {
            fail(event.why);
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
        const offered = await (await options.places()).offer(role, folder, { caller, helpers: options.helpers });

        if (closed) {
            offered.withdraw();
            return;
        }

        place = offered;
        const [command, ...args] = options.chesspal;
        const choice = { ...(model.model === "" ? {} : { model: model.model }), ...(model.effort === undefined ? {} : { effort: model.effort }) };
        runs = { model: model.model === "" ? driver.model : model.model, effort: model.effort };
        chat = driver.open({
            folder,
            program,
            model: runs.model,
            ...(model.effort === undefined ? {} : { effort: model.effort }),
            allowed: ["chesspal"],
            environment: defined({ ...driver.environment(options.environment), ...hostEnvironment("claude", choice) }),
            server: { name: "chesspal", command: command ?? process.execPath, args: [...args, "mcp"], environment: { ...offered.environment } },
            instructions: tableHelperInstructions(role),
            log: options.log,
        });
        chat.onEvent(heard);
        send();
    };

    void open().catch((error: unknown) => fail((error as Error).message));

    return {
        ask: (prompt) => {
            if (!closed) {
                pending = prompt;
                send();
            }
        },
        interrupt: () => {
            pending = undefined;

            if (inTurn) {
                chat?.interrupt();
            }
        },
        close,
    };
}

/** The last block the chat wrote outside its tools, trimmed: empty where it wrote none. */
function lastBlock(prose: readonly string[]): string
{
    return [...prose].reverse().find((block) => block !== undefined && block.trim() !== "")?.trim() ?? "";
}

/** The environment without the variables a choice takes away. */
export function defined(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv
{
    return Object.fromEntries(Object.entries(environment).filter(([, value]) => value !== undefined));
}
