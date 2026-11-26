// The chat the table drives itself, without a terminal: Claude Code started by its driver in a folder of the table's, its commands run at its place, in
// the table's process, and its turns given by the doorbell. To the page it is a chat at the table as any other, which the table plays the hooks of.
import { homedir } from "node:os";
import { join } from "node:path";
import { type Caller, type Context, speechOf } from "../../commands/index.ts";
import { loadGame, makeFolder, saveChatStart } from "../../games/index.ts";
import { samePath, tableFolder } from "../../home/index.ts";
import { startInstructions } from "../../host-files/index.ts";
import type { HostChat, HostDriver, HostEvent } from "../../hosts/index.ts";
import { activeProfile, gameFolder, profileSettings } from "../../profiles/index.ts";
import { version } from "../../version.ts";
import { bellLineIn, type BellListener, gameBellLine } from "../bell/index.ts";
import type { ChatFailure, ChatSeat, HeldChat, TableChats } from "../page/index.ts";
import type { Place, TablePlaces } from "../places/index.ts";
import { chatStart, hostEnvironment } from "../table/index.ts";
import { keepChat, keptChat } from "./kept.ts";

/** What the chats the table drives run with besides the table's context; the tests inject them. */
export interface DrivenOptions
{
    /** The chats in a terminal: every host but Claude Code, and Claude Code too while the switch is off. */
    readonly terminal: TableChats;
    /** The table's places, asked for at the first chat the table drives. */
    readonly places: () => TablePlaces | Promise<TablePlaces>;
    /** Claude Code's driver, loaded at the first chat the table drives. */
    readonly driver?: () => Promise<HostDriver>;
    /** The command line that runs Chesspal, as the table runs it: the chat's server is it with `mcp`. */
    readonly chesspal: readonly string[];
    /** The environment Claude Code starts from: the table's own unless given. */
    readonly environment?: NodeJS.ProcessEnv;
}

/** The setting of the profile that has the table drive Claude Code's chat itself, without a terminal; off unless the player turns it on. */
export const chatInPage = "chatInPage";

/**
 * The chats of a table that drives Claude Code's chat itself when the profile in use says so (`chatInPage`), the terminal's for every other: the chat's
 * folder is `chats/opponent` in the table's, its place the opponent's. The chat it drove is kept across the table's restarts, and opened again with its
 * session once a page is open.
 */
export function drivenChats(context: Context, options: DrivenOptions): TableChats
{
    const { terminal } = options;
    const table = tableFolder(context.home());
    const folder = join(table, "chats", "opponent");
    let seat: ChatSeat | undefined;
    let driven: Driven | undefined;
    let places: Promise<TablePlaces> | undefined;
    let failure: ChatFailure | undefined;
    let failures = 0;
    let seats = 0;

    const failed = (why: string): void => {
        failures += 1;
        failure = { why, number: failures };
    };

    // The chat the table drives answers for its folder; while it has not attached yet, for the table's too, where the page looks for a chat opening.
    const answersFor = (asked: string): boolean => driven !== undefined && (samePath(asked, folder) || (!driven.attached && samePath(asked, table)));

    const keep = (state: Driven | undefined, closed: boolean): void => {
        keepChat(table, { host: "claude", model: state?.choice.model, effort: state?.choice.effort, session: state?.session, closed });
    };

    // The chat leaves the table and its place, and its process ends with all it started.
    const close = (state: Driven): void => {
        state.closing = true;
        state.gone?.();
        state.chat?.close();

        if (state.attached) {
            seat?.leave();
        } else {
            seat?.notOpening();
        }

        state.place?.withdraw();

        if (driven === state) {
            driven = undefined;
        }
    };

    const attach = (state: Driven): void => {
        const chat = { version, session: state.session ?? null, folder, host: "claude-code", outdated: false, seat: state.seat };

        if (seat?.attach(chat, state.place!.context) !== true) {
            failed("Another chat is at the table: the one the table drives closed.");
            close(state);
            return;
        }

        state.attached = true;
    };

    // The chat's turn has ended: it waits at the doorbell, which sends it the game as its next turn when the player acts on the page.
    const waitAtBell = (state: Driven): void => {
        const listener: BellListener = {
            hear: (said) => {
                const game = said.startsWith("ring\n") ? said.slice("ring\n".length) : undefined;
                const language = playerLanguage(context);
                state.inTurn = state.chat?.send(game === undefined ? bellLineIn(language) : gameBellLine(language, game)) === true;
            },
            dismissed: () => undefined,
        };
        state.gone = seat?.wait(listener);
    };

    const heard = (state: Driven, event: HostEvent): void => {
        if (state.closing) {
            return;
        }

        if (event.type === "session") {
            state.session = event.session;
            state.model = event.model;
            state.effort = event.effort ?? state.effort;
            keep(state, false);

            if (!state.attached) {
                attach(state);
            }
        } else if (event.type === "turnStart") {
            state.inTurn = true;
            seat?.prompted();
        } else if (event.type === "turnEnd") {
            endTurn(state, event.reason === "failed" ? event.why ?? "The chat's turn failed." : undefined);
        } else if (event.type === "ended") {
            failed(event.why);
            keep(state, true);
            close(state);
        }
    };

    const endTurn = (state: Driven, why: string | undefined): void => {
        state.inTurn = false;

        if (why !== undefined) {
            failed(why);
        }

        // A new game in the chat after a long one: the table starts it again clean, in place of the player's /clear (D-57).
        if (state.startAgain) {
            close(state);
            void open(undefined);
        } else if (state.attached) {
            waitAtBell(state);
        } else {
            // Its first turn ended before the host said which chat it is, as when it cannot sign in: it would hold the table opening for nobody.
            keep(state, true);
            close(state);
        }
    };

    // Opens the chat, clean or taking up `session`: whether it started.
    const open = async (session: string | undefined): Promise<boolean> => {
        if (seat === undefined || driven !== undefined) {
            return false;
        }

        const start = chatStart(context, "claude");
        const state: Driven = { seat: ++seats, choice: start.choice, model: start.choice.model ?? "", effort: start.choice.effort, analysis: start.analysis, attached: false, inTurn: false, closing: false, startAgain: false };
        driven = state;
        failure = undefined;

        try {
            const driver = await (options.driver ?? claudeDriver)();
            const environment = options.environment ?? process.env;
            const program = driver.program(environment, context.platform, context.userHome?.() ?? homedir());

            if (program === undefined) {
                throw new Error("Claude Code's own program is not on this computer, where the table looks for it: install it from https://claude.com/claude-code, then try again.");
            }

            makeFolder(folder);
            notedStart(context, folder, session);
            const caller = (): Promise<Caller | undefined> => Promise.resolve({ annotator: state.model, ...(state.effort === undefined ? {} : { effort: state.effort }) });

            const startAgain = (): void => {
                state.startAgain = true;
            };

            const hooks = { ...seat.hooks, caller, startAgain };
            places ??= Promise.resolve(options.places());
            state.place = await (await places).offer("opponent", folder, hooks);

            if (state.closing) {
                state.place.withdraw();
                return false;
            }

            const [command, ...args] = options.chesspal;
            state.chat = driver.open({
                folder,
                program,
                model: state.model === "" ? driver.model : state.model,
                ...(state.effort === undefined ? {} : { effort: state.effort }),
                ...(session === undefined ? {} : { session }),
                allowed: ["chesspal"],
                environment: defined({ ...driver.environment(environment), ...hostEnvironment("claude", start.choice) }),
                server: { name: "chesspal", command: command ?? process.execPath, args: [...args, "mcp"], environment: { ...state.place.environment } },
                instructions: startInstructions(),
            });
        } catch (error) {
            failed((error as Error).message);
            close(state);
            return false;
        }

        state.session = session;
        keep(state, false);
        state.chat.onEvent((event) => heard(state, event));

        // A chat taken up again waits at rest for the player's first act; a new one starts with the start message, as a terminal's.
        if (session !== undefined) {
            attach(state);

            if (state.attached) {
                waitAtBell(state);
            }
        } else {
            state.inTurn = state.chat.send(start.message);
            seat.prompted();
        }

        return true;
    };

    return {
        hosts: () => terminal.hosts(),
        ...(terminal.watch === undefined ? {} : { watch: (changed: () => void) => terminal.watch!(changed) }),
        ...(terminal.ollama === undefined ? {} : { ollama: () => terminal.ollama!() }),
        open: (host) => (host === "claude" && switchedOn(context) ? open(undefined) : terminal.open(host)),
        held: (asked) => (answersFor(asked) ? heldOf(driven!) : terminal.held(asked)),
        relaunch: (asked, host, updated) => {
            // After an update the page asks for the chat of the table's folder, whichever is at the table (D-108).
            if (!answersFor(asked) && !(updated === true && driven !== undefined)) {
                return terminal.relaunch(asked, host, updated);
            }

            const state = driven!;
            close(state);

            // The table starts again from the Chesspal just installed, and opens a clean chat then (D-108).
            if (updated === true) {
                keep({ ...state, session: undefined }, false);
            } else if (host !== undefined && host !== "claude") {
                keep(state, true);
                void terminal.open(host);
            } else if (switchedOn(context)) {
                void open(undefined);
            } else {
                keep(state, true);
                void terminal.open("claude");
            }

            return true;
        },
        seat: (given) => {
            seat = given;
            const kept = keptChat(table);

            // The chat of the table before, opened again with its session once a page is open: a table that starts by itself plays for nobody.
            if (kept !== undefined && !kept.closed && kept.host === "claude") {
                let waiting = true;
                given.pageOpened(() => {
                    if (waiting && switchedOn(context)) {
                        waiting = false;
                        void open(kept.session);
                    }
                });
            }
        },
        stop: () => {
            if (driven?.chat === undefined || !driven.inTurn) {
                return false;
            }

            driven.chat.interrupt();
            return true;
        },
        failure: () => failure,
        close: async () => {
            if (driven !== undefined) {
                close(driven);
            }

            await (await places?.catch(() => undefined))?.close();
            await terminal.close?.();
        },
    };
}

/** A chat the table drives, as it keeps it. */
interface Driven
{
    readonly seat: number;
    /** The model and effort chosen on the page, which the page shows the chat started with; and those the host says it runs. */
    readonly choice: { readonly model?: string | undefined; readonly effort?: string | undefined; };
    model: string;
    effort: string | undefined;
    readonly analysis: boolean;
    session?: string | undefined;
    place?: Place;
    chat?: HostChat;
    attached: boolean;
    inTurn: boolean;
    /** Waits at the bell no more, when it went without it. */
    gone?: () => void;
    closing: boolean;
    /** Started again clean once its turn ends (D-57). */
    startAgain: boolean;
}

function heldOf(state: Driven): HeldChat
{
    return { model: state.choice.model, effort: state.choice.effort, seat: state.seat, ...(state.analysis ? { analysis: true as const } : {}) };
}

/** Whether the profile in use has the table drive Claude Code's chat itself: read at each opening, off when it cannot be read. */
function switchedOn(context: Context): boolean
{
    try {
        const home = context.home();
        return profileSettings(home, activeProfile(home).id)?.[chatInPage] === true;
    } catch {
        return false;
    }
}

/** Notes how the chat starts in its folder, as the hook of a chat in a terminal notes it: a new game after a long one in it wants it clean (D-57). */
function notedStart(context: Context, folder: string, session: string | undefined): void
{
    const now = context.now().toISOString();

    if (session !== undefined) {
        saveChatStart(folder, { source: "resume", at: now, session });
        return;
    }

    try {
        const current = loadGame(gameFolder(context.home()));
        saveChatStart(folder, { source: "startup", at: now, ...(current === undefined ? {} : { game: { started: current.started, plies: current.game.record.moves.length } }) });
    } catch {
        saveChatStart(folder, { source: "startup", at: now });
    }
}

/** The player's language, as the doorbell names it to the chat; none in English, or when it cannot be read. */
function playerLanguage(context: Context): string | undefined
{
    try {
        return speechOf(gameFolder(context.home()), context.language)?.language;
    } catch {
        return undefined;
    }
}

/** The environment without the variables a choice takes away. */
function defined(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv
{
    return Object.fromEntries(Object.entries(environment).filter(([, value]) => value !== undefined));
}

/** Claude Code's driver, loaded with the hosts' module at the first chat the table drives. */
async function claudeDriver(): Promise<HostDriver>
{
    const { hostDriver } = await import("../../hosts/index.ts");
    return hostDriver("claudeCode")!;
}
