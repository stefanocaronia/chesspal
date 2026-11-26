// The opponent's helpers the table runs itself beside the chat it drives, while the switch is on, as the host's own agents would: the one that thinks on
// the player's time and the coach with the helps on, each turn on a chat of its own that knows nothing of the turns before, with the next chat of the role
// opened ahead and waiting; and the analyst of a game over, one chat for one review.
import { type Context, endingToCoach, type HelperRole, namedGame, speechOf, type TableHelpers } from "../../commands/index.ts";
import { isReviewed, levelOf } from "../../core/index.ts";
import { type CurrentGame, endOf, forgetAnalyst, gameInAnalysis, loadGame, notePondering, ponderingUntil, thoughtKey } from "../../games/index.ts";
import { onQuickModel } from "../../host-files/index.ts";
import { gameFolder, helpsIn } from "../../profiles/index.ts";
import { type HelperChat, type HelperChatOptions, type HelperEnd, type HelperHeard, type HelperModel, openHelperChat } from "./helper-chat.ts";
import type { DrivenHost } from "./hosts.ts";

/** What the helpers run with besides the table's context: how a chat opens, and what the table knows of the opponent's. */
export interface HelpersOptions extends Omit<HelperChatOptions, "context" | "helpers">
{
    /** Whether the profile in use has the switch on. */
    readonly switchedOn: () => boolean;
    /** The opponent's chat the table drives, from its opening to its close, with the host, model and effort it was opened with; none otherwise. */
    readonly opponent: () => HelperModel | undefined;
    /** What the pages show may have changed: the analyst started or ended, the sign of the thinking went. */
    readonly changed: () => void;
    /** Tells the opponent's chat what the analyst found. */
    readonly tell: (line: string) => void;
}

/** The table's helpers, as the chat it drives and the page call them. */
export interface Helpers
{
    /** The field of a place's context that says which helpers the table runs. */
    readonly field: TableHelpers;
    /** The opponent moved: the one that thinks gets a turn while the game goes on, the coach with the helps on. */
    afterMove(): void;
    /**
     * The game or the switch may have changed: the player's move stops the thinking; a game over ends it, and has the coach judge the move that ended it;
     * a new game, or the switch off, ends them. A game going on has a chat of each role waiting ahead.
     */
    check(): void;
    /** Has the analyst go over `game`, as the player wants, a new one for a review asked again (`redo`): whether one goes over it now. */
    analyse(game: string, redo?: boolean): boolean;
    /** The game in analysis the brought game or the start again asked for, if not yet reviewed, goes to the analyst. */
    analysePending(): void;
    /** The player stopped the analysis on the page. */
    stopAnalysis(): void;
    /** The opponent's chat opened: the helpers stilled by their falls may start again. */
    opponentOpened(): void;
    /** The opponent's chat left the table: its helpers go with it. */
    opponentLeft(): void;
    /** When the earliest turn of a helper at work began: none while none is. */
    turnSince(): Date | undefined;
    /** Ends every helper's chat, gently. */
    close(): void;
}

/** The helpers of a table serving `context`. At its start, the sign of a thinking no chat of its own does is taken away. */
export function tableHelpers(context: Context, options: HelpersOptions): Helpers
{
    const games = (): string => gameFolder(context.home());
    const shifts: Readonly<Record<TurnRole, Shift>> = { ponder: { role: "ponder" }, coach: { role: "coach" } };
    const skipped: Record<TurnRole, number> = { ponder: 0, coach: 0 };
    let analyst: { chat: HelperChat; game: string; } | undefined;
    let coached: string | undefined;
    // The falls in a row of each role, and whether the host said the player is not signed in: either stills helpers until the opponent opens again.
    const falls = new Map<HelperRole, number>();
    let signedOut = false;

    const runs = (role: HelperRole): boolean => options.switchedOn() && options.opponent() !== undefined && !signedOut && (falls.get(role) ?? 0) < 2;

    const open = (role: HelperRole, model: HelperModel, heard: HelperHeard): HelperChat =>
        openHelperChat(role, model, { ...options, context, helpers: field }, {
            ...heard,
            ended: (end) => {
                if (end.reason === "failed") {
                    fell(role, end);
                } else if (end.reason === "done") {
                    falls.set(role, 0);
                }

                heard.ended(end);
            },
        });

    // The sign of the thinking is on only while a turn of the one that thinks is at work: its chat gone, the sign goes with it.
    const forgetPondering = (): void => {
        try {
            const folder = games();
            const current = loadGame(folder);

            if (current !== undefined && ponderingUntil(folder, thoughtKey(current)) !== undefined) {
                notePondering(folder, thoughtKey(current), false, context.now());
                options.changed();
            }
        } catch {
            // A game that cannot be read shows no sign.
        }
    };

    const closeShift = (shift: Shift): void => {
        shift.working?.chat.close();
        shift.waiting?.close();
        shift.working = undefined;
        shift.waiting = undefined;
        shift.asked = undefined;
        shift.game = undefined;

        if (shift.role === "ponder") {
            forgetPondering();
        }
    };

    // The analyst goes, and the pages show its review as far as it got; the game is no longer held by it unless the player's stop keeps who held it.
    const closeAnalyst = (forget = true): void => {
        if (analyst !== undefined) {
            analyst.chat.close();
            analyst = undefined;

            if (forget) {
                forgetAnalyst(games());
            }

            options.changed();
        }
    };

    const helpersOff = (): void => {
        closeShift(shifts.ponder);
        closeShift(shifts.coach);
    };

    const fell = (role: HelperRole, end: Extract<HelperEnd, { reason: "failed"; }>): void => {
        const count = (falls.get(role) ?? 0) + 1;
        falls.set(role, count);

        if (end.signin && !signedOut) {
            signedOut = true;
            options.log("helpers stopped: the player is not signed in; they start again when the opponent's chat opens again");
            helpersOff();
            closeAnalyst();
        } else if (count === 2) {
            options.log(`helper ${role} stopped: it fell twice in a row; it starts again when the opponent's chat opens again`);
        }
    };

    // A chat of the role for `current`, on its host's quick model for the one that thinks at the levels where the opponent's answers say a quicker model
    // thought, as they ask by the name the host's MCP client gives itself; on the opponent's own in a host that has none.
    const chatOf = (shift: Shift, current: CurrentGame): HelperChat | undefined => {
        const opponent = options.opponent();

        if (opponent === undefined) {
            return undefined;
        }

        const quickModel = shift.role === "ponder" && onQuickModel(levelOf(current.game.record), opponent.host.client) ? opponent.host.quickModel : undefined;
        const chosen = quickModel === undefined ? opponent : { host: opponent.host, model: quickModel };
        const effort = shift.role === "ponder" ? chosen.effort ?? opponent.host.ponderEffort : chosen.effort;
        const model = { host: chosen.host, model: chosen.model, ...(effort === undefined ? {} : { effort }) };
        const chat: HelperChat = open(shift.role, model, {
            ended: () => shiftEnded(shift, chat),
            answered: (tool, result) => toolAnswered(shift, chat, tool, result),
        });
        return chat;
    };

    // A chat of the role waits ahead, its program started and no word sent, while the role runs in a game going on: the coach with the helps on.
    const ahead = (shift: Shift): void => {
        const current = currentGame(context);

        if (shift.working !== undefined || shift.waiting !== undefined || current === undefined || endOf(current.game) !== undefined || !runs(shift.role)) {
            return;
        }

        if (shift.role === "coach" && !helpsIn(games())) {
            return;
        }

        shift.game = current.started;
        shift.waiting = chatOf(shift, current);
    };

    // A turn of the role: on the chat waiting ahead, else on a new one; while a turn works, the latest asked waits for it to end.
    const give = (shift: Shift, current: CurrentGame): void => {
        const plies = current.game.record.moves.length;

        if (shift.game !== current.started) {
            closeShift(shift);
            shift.game = current.started;
        }

        if (shift.working !== undefined) {
            if (shift.asked !== undefined) {
                options.log(`${shift.role} turn for ply ${shift.asked} replaced before it was sent, by ply ${plies}`);
            }

            shift.asked = plies;
            return;
        }

        const chat = shift.waiting ?? chatOf(shift, current);
        shift.waiting = undefined;

        if (chat !== undefined) {
            shift.working = { chat, plies, answered: false };
            chat.ask(promptOf(shift.role, chat.host));
        }
    };

    // The turn at work is over: its chat goes, and the role's next turn goes to a chat of its own, the one asked meanwhile, else one opened ahead.
    const finish = (shift: Shift): void => {
        shift.working?.chat.close();
        shift.working = undefined;
        const asked = shift.asked;
        shift.asked = undefined;

        if (shift.role === "ponder") {
            forgetPondering();
        }

        const current = currentGame(context);
        const stillAsked = asked !== undefined && current !== undefined && current.started === shift.game && runs(shift.role)
            && (shift.role === "coach" || (asked === current.game.record.moves.length && endOf(current.game) === undefined));

        if (stillAsked) {
            give(shift, current);
        } else {
            ahead(shift);
        }
    };

    // A chat of the role's turn ended, or failed. One waiting ahead ends only by failing: another waits in its place while the role runs.
    const shiftEnded = (shift: Shift, chat: HelperChat): void => {
        if (shift.waiting === chat) {
            shift.waiting = undefined;
            ahead(shift);
        } else if (shift.working?.chat === chat) {
            finish(shift);
        }
    };

    // A turn whose role's tool first answered that the player had moved was late: the log counts it, with its ply.
    const toolAnswered = (shift: Shift, chat: HelperChat, tool: string, result: unknown): void => {
        const turn = shift.working;

        if (turn?.chat !== chat || turn.answered || tool !== shift.role) {
            return;
        }

        turn.answered = true;

        if (playerMoved(result)) {
            skipped[shift.role] += 1;
            const now = currentGame(context)?.game.record.moves.length;
            const at = now === undefined ? "" : `, at ply ${now}`;
            options.log(`${shift.role} turn for ply ${turn.plies} skipped: ${shift.role} {} answered that the player had moved${at} (${skipped[shift.role]} skipped)`);
        }
    };

    // The player moved while the turn thought on their time: what it thought is kept, and its chat ends with its turn, or at once before it was sent.
    const stopThinking = (turn: Turn): void => {
        if (turn.chat.turnSince() === undefined) {
            finish(shifts.ponder);
        } else {
            turn.chat.interrupt();
        }
    };

    const think = (current: CurrentGame): void => {
        if (runs("ponder")) {
            give(shifts.ponder, current);
        }
    };

    const judge = (current: CurrentGame): void => {
        const key = `${current.started} ${current.game.record.moves.length}`;

        if (coached === key || !runs("coach") || !helpsIn(games())) {
            return;
        }

        coached = key;
        give(shifts.coach, current);
    };

    const analystEnded = (state: { chat: HelperChat; game: string; }, end: HelperEnd): void => {
        if (analyst !== state) {
            return;
        }

        closeAnalyst();

        if (end.reason === "failed") {
            return;
        }

        const said = end.reason === "done" && end.text !== "" ? `: ${end.text}` : ".";

        if (reviewed(context, state.game)) {
            options.tell(`The analyst has gone over ${state.game}${said} Its review is on the board page, and analyse_game {"game": "${state.game}"} gives it. Go over it with the player.`);
        } else {
            options.tell(`The analyst did not finish the review of ${state.game}${said} The board page shows it incomplete; the player can have it analysed again there.`);
        }
    };

    const analyse = (game: string, redo = false): boolean => {
        const opponent = options.opponent();

        if (opponent === undefined || !runs("analyst")) {
            return false;
        }

        if (analyst?.game === game && !redo) {
            return true;
        }

        closeAnalyst();
        // The game is the new analyst's to take, whoever held it before.
        forgetAnalyst(games());
        const state: { chat: HelperChat; game: string; } = { game, chat: open("analyst", opponent, { ended: (end) => analystEnded(state, end) }) };
        analyst = state;
        state.chat.ask(`Analyse ${game}. The player speaks ${speechOf(games(), context.language)?.language ?? "English"}.`);
        options.changed();
        return true;
    };

    const field: TableHelpers = { runs, analysing: () => analyst?.game, analyse: (game) => analyse(game) };

    if (options.switchedOn()) {
        forgetPondering();
    }

    return {
        field,
        afterMove: () => {
            const current = currentGame(context);

            if (current !== undefined) {
                if (endOf(current.game) === undefined) {
                    think(current);
                }

                judge(current);
            }
        },
        check: () => {
            if (!options.switchedOn()) {
                helpersOff();
            }

            const current = currentGame(context);
            const over = current === undefined || endOf(current.game) !== undefined;
            const { ponder, coach } = shifts;

            if (over || (ponder.game !== undefined && ponder.game !== current.started)) {
                closeShift(ponder);
            } else if (ponder.working !== undefined && ponder.working.plies !== current.game.record.moves.length) {
                stopThinking(ponder.working);
            }

            if (coach.game !== undefined && coach.game !== current?.started) {
                closeShift(coach);
            }

            if (current !== undefined && over && endingToCoach(games(), current)) {
                judge(current);
            }

            // The coach's turn at work ends by itself; one waiting has nothing more to judge once the game is over or the helps are off.
            if (over || !helpsIn(games())) {
                coach.waiting?.close();
                coach.waiting = undefined;
            }

            if (!over) {
                ahead(ponder);
                ahead(coach);
            }

            // A game going on stops the analysis: what was written of its review stays.
            if (analyst !== undefined && !over) {
                closeAnalyst();
            }
        },
        analyse,
        analysePending: () => {
            const analysis = gameInAnalysis(games());

            if (analysis !== undefined && (analysis.brought === true || analysis.redo === true) && !reviewed(context, analysis.game)) {
                analyse(analysis.game);
            }
        },
        stopAnalysis: () => closeAnalyst(false),
        opponentOpened: () => {
            falls.clear();
            signedOut = false;
        },
        opponentLeft: () => {
            helpersOff();
            closeAnalyst();
        },
        turnSince: () => {
            const chats = [shifts.ponder.working?.chat, shifts.coach.working?.chat, analyst?.chat];
            const times = chats.map((chat) => chat?.turnSince()?.getTime()).filter((time) => time !== undefined);
            return times.length === 0 ? undefined : new Date(Math.min(...times));
        },
        close: () => {
            helpersOff();
            closeAnalyst();
        },
    };
}

/** The helpers that take turns, each on a chat of its own. */
type TurnRole = "ponder" | "coach";

/** A turn given to a chat: the plies of the game when it was asked, and whether the role's tool has answered in it yet. */
interface Turn
{
    readonly chat: HelperChat;
    readonly plies: number;
    answered: boolean;
}

/** The chats of a role that takes turns: the game they serve, the turn at work, the chat waiting ahead, and the plies of a turn asked while one works. */
interface Shift
{
    readonly role: TurnRole;
    game?: string | undefined;
    working?: Turn | undefined;
    waiting?: HelperChat | undefined;
    asked?: number | undefined;
}

/** What each role is told at its turn: its tool gives it all the rest. */
const prompts: Readonly<Record<TurnRole, string>> = { ponder: "Ponder.", coach: "Coach." };

/** A role's turn, naming the tool to call where the host's model would search its tools for it first: the tool is named as the role. */
function promptOf(role: TurnRole, host: DrivenHost): string
{
    return host.helperTool === undefined ? prompts[role] : `${prompts[role]} Your tool: ${host.helperTool(role)}.`;
}

/** Whether a tool's result says the player had moved, or the game is over: its turn came too late. */
function playerMoved(result: unknown): boolean
{
    return typeof result === "object" && result !== null && (result as { stop?: unknown; }).stop === "moved";
}

/** The game going on or just over; none with no game, or when it cannot be read. */
function currentGame(context: Context): CurrentGame | undefined
{
    try {
        return loadGame(gameFolder(context.home()));
    } catch {
        return undefined;
    }
}

/** Whether the game has its review; one that cannot be read has none. */
function reviewed(context: Context, game: string): boolean
{
    try {
        return isReviewed(namedGame(context, game).record);
    } catch {
        return false;
    }
}
