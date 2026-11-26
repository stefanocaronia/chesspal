// The chat the table drives itself, without a terminal: Claude Code started by its driver in a folder of the data folder's, its commands run at its place,
// in the table's process, and its turns given by the doorbell. To the page it is a chat at the table as any other, which the table plays the hooks of.
import { homedir } from "node:os";
import { join } from "node:path";
import { aiActedSince, type Caller, type Context, positionIn, sayProse, type SeenPosition, speechOf } from "../../commands/index.ts";
import { endOf, loadGame, makeFolder, saveChatStart } from "../../games/index.ts";
import { samePath, tableFolder } from "../../home/index.ts";
import { drivenStartInstructions } from "../../host-files/index.ts";
import type { HostChat, HostDriver, HostEvent } from "../../hosts/index.ts";
import { activeProfile, gameFolder, profileSettings } from "../../profiles/index.ts";
import { version } from "../../version.ts";
import { bellLineIn, type BellListener, gameBellLine } from "../bell/index.ts";
import type { ChatFailure, ChatSeat, HeldChat, TableChats } from "../page/index.ts";
import type { Place, TablePlaces } from "../places/index.ts";
import { chatStart, hostEnvironment } from "../table/index.ts";
import { failureOf } from "./failure.ts";
import { keepChat, keptChat } from "./kept.ts";
import { moveEndsTurn } from "./move-ends-turn.ts";

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

/** The host the table drives, as the table and the page name it. */
const host = "claude";

/**
 * The chats of a table that drives Claude Code's chat itself when the profile in use says so (`chatInPage`), the terminal's for every other. The chat's
 * folder is `chats/opponent` in the data folder, outside the table's, whose files init wrote for a chat in a terminal; its place is the opponent's. The
 * chat it drove is kept across the table's restarts, and taken up again with its session while the game it played goes on.
 */
export function drivenChats(context: Context, options: DrivenOptions): TableChats
{
    const { terminal } = options;
    const table = tableFolder(context.home());
    const chats = join(context.home(), "chats");
    const folder = join(chats, "opponent");
    let seat: ChatSeat | undefined;
    let driven: Driven | undefined;
    let places: Promise<TablePlaces> | undefined;
    let failure: ChatFailure | undefined;
    let failures = 0;
    let seats = 0;

    const failed = (why: string): void => {
        failures += 1;
        failure = failureOf(why, failures);
    };

    // The chat the table drives answers for its folder; while it has not attached yet, for the table's too, where the page looks for a chat opening.
    const answersFor = (asked: string): boolean => driven !== undefined && (samePath(asked, folder) || (!driven.attached && samePath(asked, table)));

    const keep = (state: Driven | undefined, closed: boolean): void => {
        keepChat(chats, { host, session: state?.session, game: state?.game, closed });
    };

    // The chat leaves the table and its place. Its program ends by itself, its input closed, as one renewing the player's sign-in must: stopped, with all
    // it started, only where it is still there after the driver's grace.
    const close = (state: Driven): void => {
        state.closing = true;
        state.gone?.();
        state.chat?.close(true);

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
        const chat = { version, session: state.session ?? null, folder, host, outdated: false, seat: state.seat };

        if (seat?.attach(chat, state.place!.context) !== true) {
            failed("Another chat is at the table: the one the table drives closed.");
            close(state);
            return;
        }

        state.attached = true;

        // It attaches in its first turn, which the table sent and the bell never saw: a chat at work hears the player.
        if (state.inTurn) {
            seat?.atWork();
        }
    };

    // A turn begins: the pages see the chat at work, and what it writes outside its tools is gathered from here.
    const begin = (state: Driven): void => {
        state.inTurn = true;
        state.moved = false;
        state.tools.clear();
        state.prose = [];
        state.from = { at: context.now(), position: positionNow(context) };
        seat?.changed();
    };

    const send = (state: Driven, text: string): boolean => {
        const sent = state.chat?.send(text) === true;

        if (sent) {
            begin(state);

            if (state.attached) {
                seat?.atWork();
            }
        }

        return sent;
    };

    // The chat's turn has ended: it waits at the doorbell, which sends it the game as its next turn when the player acts on the page, or the table when
    // the AI has not moved.
    const listener = (state: Driven): BellListener => ({
        rung: (game) => {
            const language = playerLanguage(context);
            const nudge = state.nudging;
            state.nudging = false;
            state.nudged = nudge;
            send(state, game === undefined ? bellLineIn(language) : nudge ? yourMoveLine(language, game) : gameBellLine(language, game));
        },
        dismissed: () => undefined,
    });

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
            begin(state);
            seat?.prompted();
        } else if (event.type === "tool") {
            endAtMove(state, event);
        } else if (event.type === "text") {
            state.prose[event.block] = `${state.prose[event.block] ?? ""}${event.text}`;
        } else if (event.type === "turnEnd") {
            endTurn(state, event.reason, event.reason === "failed" ? event.why ?? "The chat's turn failed." : undefined);
        } else if (event.type === "ended") {
            failed(event.why);
            state.game = gameStarted(context);
            keep(state, true);
            close(state);
        }
    };

    const endTurn = (state: Driven, reason: "done" | "interrupted" | "failed", why: string | undefined): void => {
        const stopped = state.stopping;
        state.inTurn = false;
        state.stopping = false;
        state.moved = false;
        state.tools.clear();

        if (why !== undefined) {
            failed(why);
        }

        showProse(context, state, reason === "done" && !stopped);
        state.game = gameStarted(context);
        seat?.changed();

        // A new game in the chat after a long one: the table starts it again clean, in place of the player's /clear (D-57).
        if (state.startAgain) {
            close(state);
            void open(undefined);
            return;
        }

        if (!state.attached) {
            // Its first turn ended before the host said which chat it is, as when it cannot sign in: it would hold the table opening for nobody.
            keep(state, true);
            close(state);
            return;
        }

        keep(state, false);
        // After the player's Stop a ring missed in the turn wakes nobody: the player's next act does.
        state.gone = seat?.wait(listener(state), stopped);

        // A ring the chat missed in its turn woke it again already.
        if (state.inTurn || seat === undefined) {
            return;
        }

        if (stopped) {
            // The turn the player stopped costs the AI no time: its clock is held from the turn's start.
            seat.stall("stopped", state.from?.at);
        } else if (!seat.aiToMove()) {
            state.nudged = false;
        } else if (reason === "done" && !state.nudged) {
            // The AI's turn ended without its move: the table asks it once more, with the game.
            state.nudging = true;
            seat.ring();
        } else {
            seat.stall("noMove");
        }
    };

    // Opens the chat, clean or taking up `session`: whether it started; "missing" when Claude Code's program is not where the driver looks.
    const open = async (session: string | undefined): Promise<boolean | "missing"> => {
        if (seat === undefined || driven !== undefined || !seat.free()) {
            return false;
        }

        const start = chatStart(context, host);
        const state: Driven = {
            seat: ++seats,
            choice: start.choice,
            model: start.choice.model ?? "",
            effort: start.choice.effort,
            analysis: start.analysis,
            resumed: session !== undefined,
            attached: false,
            inTurn: false,
            closing: false,
            startAgain: false,
            stopping: false,
            moved: false,
            tools: new Set(),
            nudging: false,
            nudged: false,
            prose: [],
        };
        driven = state;
        failure = undefined;

        try {
            const driver = await (options.driver ?? claudeDriver)();
            const environment = options.environment ?? process.env;
            const program = driver.program(environment, context.platform, context.userHome?.() ?? homedir());

            if (program === undefined) {
                driven = undefined;
                return "missing";
            }

            makeFolder(folder);
            notedStart(context, folder, session);
            const caller = (): Promise<Caller | undefined> => Promise.resolve({ annotator: state.model, ...(state.effort === undefined ? {} : { effort: state.effort }) });

            const startAgain = (): void => {
                state.startAgain = true;
            };

            const answered = (tool: string, result: unknown): void => {
                if (tool === "ai_move") {
                    state.moved = state.inTurn && moveEndsTurn(tool, result);
                }
            };

            const hooks = { ...seat.hooks, caller, startAgain, answered, drivenByTable: true as const, givenSinceWords: new Set<string>() };
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
                environment: defined({ ...driver.environment(environment), ...hostEnvironment(host, start.choice) }),
                server: { name: "chesspal", command: command ?? process.execPath, args: [...args, "mcp"], environment: { ...state.place.environment } },
                instructions: drivenStartInstructions(),
            });
        } catch (error) {
            failed((error as Error).message);
            close(state);
            return false;
        }

        state.session = session;
        state.game = gameStarted(context);
        keep(state, false);
        state.chat.onEvent((event) => heard(state, event));

        // A chat taken up again waits at the bell, rung at once when the AI is to move; a new one starts with the start message, as a terminal's.
        if (session !== undefined) {
            attach(state);

            if (state.attached) {
                state.gone = seat.resume(listener(state));
            }
        } else {
            send(state, start.message);
            seat.prompted();
        }

        return true;
    };

    // The chat the page asks for: the one kept, taken up again while its game goes on, else a clean one; the terminal's where Claude Code's program is not
    // where the driver looks for it, as one installed by npm alone.
    const asked = async (): Promise<boolean> => {
        const kept = keptChat(chats);
        const opened = await open(kept !== undefined && !kept.closed && kept.host === host && keptGameGoesOn(context, kept.game) ? kept.session : undefined);
        return opened === "missing" ? terminal.open(host) : opened;
    };

    return {
        hosts: () => terminal.hosts(),
        ...(terminal.watch === undefined ? {} : { watch: (changed: () => void) => terminal.watch!(changed) }),
        ...(terminal.ollama === undefined ? {} : { ollama: () => terminal.ollama!() }),
        open: (name) => (name === host && switchedOn(context) ? asked() : terminal.open(name)),
        held: (folderAsked) => (answersFor(folderAsked) ? heldOf(driven!) : terminal.held(folderAsked)),
        relaunch: (folderAsked, name, updated) => {
            // After an update the page asks for the chat of the table's folder, whichever is at the table (D-108).
            if (!answersFor(folderAsked) && !(updated === true && driven !== undefined)) {
                return terminal.relaunch(folderAsked, name, updated);
            }

            const state = driven!;
            close(state);

            // The table starts again from the Chesspal just installed, and opens a clean chat then (D-108).
            if (updated === true) {
                keep({ ...state, session: undefined }, false);
            } else if (name !== undefined && name !== host) {
                keep(state, true);
                void terminal.open(name);
            } else if (switchedOn(context)) {
                void open(undefined);
            } else {
                keep(state, true);
                void terminal.open(host);
            }

            return true;
        },
        seat: (given) => {
            seat = given;
            const kept = keptChat(chats);

            // The chat of the table before, taken up again once a page is open, and only while the game it played goes on: else at the player's next request.
            if (kept !== undefined && !kept.closed && kept.host === host && kept.session !== undefined) {
                let waiting = true;
                given.pageOpened(() => {
                    if (waiting && switchedOn(context) && keptGameGoesOn(context, kept.game)) {
                        void open(kept.session);
                    }

                    waiting = false;
                });
            }
        },
        stop: () => {
            if (driven?.chat === undefined || !driven.inTurn) {
                return false;
            }

            driven.stopping = true;
            driven.chat.interrupt();
            return true;
        },
        atWork: () => driven?.attached === true && driven.inTurn,
        turnSince: () => (driven?.attached === true && driven.inTurn ? driven.from?.at : undefined),
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
    /** Taken up again with its session: it holds a game played before. */
    readonly resumed: boolean;
    session?: string | undefined;
    /** When the game it played last started. */
    game?: string | undefined;
    place?: Place;
    chat?: HostChat;
    attached: boolean;
    inTurn: boolean;
    /** Waits at the bell no more, when it went without it. */
    gone?: () => void;
    closing: boolean;
    /** Started again clean once its turn ends (D-57). */
    startAgain: boolean;
    /** The player stopped the turn in course. */
    stopping: boolean;
    /** The AI's move in this turn asked nothing more of it; the table ends the turn once the chat has the answers of all the tools it started. */
    moved: boolean;
    readonly tools: Set<string>;
    /** The table rings the chat for the AI's move it did not make; it did once since the player last woke it. */
    nudging: boolean;
    nudged: boolean;
    /** What the chat wrote in its turn outside its tools, by block; when the turn began, and the game then. */
    prose: string[];
    from?: { readonly at: Date; readonly position: SeenPosition | undefined; };
}

/**
 * Once the chat has the answer of a move that asked nothing more of it, and of every other tool it started, the table ends its turn: not the player's
 * Stop. What it wrote is not shown, as the AI moved.
 */
function endAtMove(state: Driven, event: Extract<HostEvent, { type: "tool"; }>): void
{
    if (event.state === "started") {
        state.tools.add(event.id);
        return;
    }

    state.tools.delete(event.id);

    if (!state.moved || state.stopping || state.tools.size > 0) {
        return;
    }

    state.moved = false;
    state.chat?.interrupt();
}

function heldOf(state: Driven): HeldChat
{
    return {
        model: state.choice.model,
        effort: state.choice.effort,
        seat: state.seat,
        driven: true,
        ...(state.analysis ? { analysis: true as const } : {}),
        ...(state.resumed ? { played: true as const } : {}),
    };
}

/**
 * What the chat wrote in its turn outside its tools, which the player of a chat the table drives has no other window to read: shown on the board page as
 * the AI's words only when the turn ended by itself (`whole`: done, neither stopped nor failed), the AI neither spoke through a tool nor moved in it, and it
 * is not the AI's move. Its words while its move waits are its plans, never the player's to read. Written before the player's lines it was not given.
 */
function showProse(context: Context, state: Driven, whole: boolean): void
{
    const text = state.prose.filter((block) => block.trim() !== "").join("\n\n");
    const from = state.from;
    state.prose = [];

    if (text === "" || from === undefined || !whole) {
        return;
    }

    try {
        const games = gameFolder(context.home());
        const current = loadGame(games);
        const aiToMove = current !== undefined && endOf(current.game) === undefined && current.game.position.turn === current.ai;

        if (!aiToMove && !aiActedSince(games, from.at, from.position) && sayProse(games, text, context.now(), state.place?.context.given ?? new Set()) !== undefined) {
            state.place?.context.heard?.();
        }
    } catch {
        // A game that cannot be written keeps the words in the chat alone.
    }
}

/** The line that asks the chat once more for the AI's move it did not make, with the game as status shows it. */
function yourMoveLine(language: string | undefined, game: string): string
{
    const line = "It is your move, and the player waits for it: here is the game now, as status shows it. Don't call status for it: decide, then call ai_move. "
        + "What you wrote outside your tools was not shown to the player: speak to them in ai_move's comment.";
    return `${line}${language === undefined ? "" : ` Write to the player in ${language}.`}\n${game}`;
}

/** Whether the game the kept chat played, by its start, is the one going on now. */
function keptGameGoesOn(context: Context, started: string | undefined): boolean
{
    try {
        const current = loadGame(gameFolder(context.home()));
        return started !== undefined && current !== undefined && current.started === started && endOf(current.game) === undefined;
    } catch {
        return false;
    }
}

/** When the game in the data folder started; none with no game, or when it cannot be read. */
function gameStarted(context: Context): string | undefined
{
    try {
        return loadGame(gameFolder(context.home()))?.started;
    } catch {
        return undefined;
    }
}

function positionNow(context: Context): SeenPosition | undefined
{
    try {
        return positionIn(gameFolder(context.home()));
    } catch {
        return undefined;
    }
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
