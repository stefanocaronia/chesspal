// The opponent's helpers the table runs itself beside the chat it drives, while the switch is on, a chat each, as Claude Code's own agents would: one that
// thinks on the player's time, the coach with the helps on, and the analyst of a game over.
import { type Context, endingToCoach, type HelperRole, namedGame, speechOf, type TableHelpers } from "../../commands/index.ts";
import { isReviewed, levelOf } from "../../core/index.ts";
import { type CurrentGame, endOf, forgetAnalyst, gameInAnalysis, loadGame } from "../../games/index.ts";
import { onQuickModel } from "../../host-files/index.ts";
import { gameFolder, helpsIn } from "../../profiles/index.ts";
import { type HelperChat, type HelperChatOptions, type HelperEnd, type HelperModel, openHelperChat } from "./helper-chat.ts";

/** What the helpers run with besides the table's context: how a chat opens, and what the table knows of the opponent's. */
export interface HelpersOptions extends Omit<HelperChatOptions, "context" | "helpers">
{
    /** Whether the profile in use has the switch on. */
    readonly switchedOn: () => boolean;
    /** The opponent's chat the table drives, from its opening to its close, with the model and effort it was opened with; none otherwise. */
    readonly opponent: () => HelperModel | undefined;
    /** What the pages show may have changed: the analyst started or ended. */
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
     * a new game, or the switch off, ends them.
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

/** The helpers of a table serving `context`. */
export function tableHelpers(context: Context, options: HelpersOptions): Helpers
{
    const games = (): string => gameFolder(context.home());
    let ponder: { chat: HelperChat; game: string; plies?: number | undefined; } | undefined;
    let coach: { chat: HelperChat; game: string; asked?: number | undefined; } | undefined;
    let analyst: { chat: HelperChat; game: string; } | undefined;
    let coached: string | undefined;
    // The falls in a row of each role, and whether the host said the player is not signed in: either stills helpers until the opponent opens again.
    const falls = new Map<HelperRole, number>();
    let signedOut = false;

    const runs = (role: HelperRole): boolean => options.switchedOn() && options.opponent() !== undefined && !signedOut && (falls.get(role) ?? 0) < 2;

    const open = (role: HelperRole, model: HelperModel, ended: (end: HelperEnd) => void): HelperChat =>
        openHelperChat(role, model, { ...options, context, helpers: field }, (end) => {
            if (end.reason === "failed") {
                fell(role, end);
            } else if (end.reason === "done") {
                falls.set(role, 0);
            }

            ended(end);
        });

    const closePonder = (): void => {
        ponder?.chat.close();
        ponder = undefined;
    };

    const closeCoach = (): void => {
        coach?.chat.close();
        coach = undefined;
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

    const fell = (role: HelperRole, end: Extract<HelperEnd, { reason: "failed"; }>): void => {
        const count = (falls.get(role) ?? 0) + 1;
        falls.set(role, count);

        if (end.signin && !signedOut) {
            signedOut = true;
            options.log("helpers stopped: the player is not signed in; they start again when the opponent's chat opens again");
            closePonder();
            closeCoach();
            closeAnalyst();
        } else if (count === 2) {
            options.log(`helper ${role} stopped: it fell twice in a row; it starts again when the opponent's chat opens again`);
        }
    };

    const think = (current: CurrentGame): void => {
        const opponent = options.opponent();

        if (opponent === undefined || !runs("ponder")) {
            return;
        }

        if (ponder?.game !== current.started) {
            closePonder();
            // On the quick model at the levels where the opponent's agent would be on it, as ponder's answers to the opponent say.
            const model = onQuickModel(levelOf(current.game.record)) ? { model: quickModel } : opponent;
            const state = { game: current.started, chat: open("ponder", model, (end) => lostPonder(state, end)) };
            ponder = state;
        }

        ponder.plies = current.game.record.moves.length;
        ponder.chat.ask("Ponder.");
    };

    const lostPonder = (state: NonNullable<typeof ponder>, end: HelperEnd): void => {
        if (end.reason === "failed" && ponder === state) {
            closePonder();
        }
    };

    // The coach that ended a turn goes once the game is over and nothing more is asked of it.
    const coachDone = (state: NonNullable<typeof coach>, end: HelperEnd): void => {
        if (coach !== state) {
            return;
        }

        const current = currentGame(context);

        if (end.reason === "failed" || ((current === undefined || endOf(current.game) !== undefined) && !state.chat.busy())) {
            closeCoach();
        }
    };

    const judge = (current: CurrentGame): void => {
        const opponent = options.opponent();
        const plies = current.game.record.moves.length;
        const key = `${current.started} ${plies}`;

        if (opponent === undefined || coached === key || !runs("coach") || !helpsIn(games())) {
            return;
        }

        coached = key;

        if (coach?.game !== current.started) {
            closeCoach();
            const state: NonNullable<typeof coach> = { game: current.started, chat: open("coach", opponent, (end) => coachDone(state, end)) };
            coach = state;
        }

        const state = coach;

        // One turn at a time: a move asked while the coach judges the one before takes the place of any other waiting.
        if (state.asked !== undefined) {
            options.log(`coach turn for ply ${state.asked} replaced before it was sent, by ply ${plies}`);
        }

        state.asked = plies;
        state.chat.ask("Coach.", () => {
            const now = currentGame(context)?.game.record.moves.length;
            state.asked = undefined;

            if (now !== undefined && now > plies) {
                options.log(`coach turn for ply ${plies} sent after the player moved, at ply ${now}`);
            }
        });
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
        const state = { game, chat: open("analyst", opponent, (end) => analystEnded(state, end)) };
        analyst = state;
        state.chat.ask(`Analyse ${game}. The player speaks ${speechOf(games(), context.language)?.language ?? "English"}.`);
        options.changed();
        return true;
    };

    const field: TableHelpers = { runs, analysing: () => analyst?.game, analyse: (game) => analyse(game) };

    const helpersOff = (): void => {
        closePonder();
        closeCoach();
    };

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

            if (ponder !== undefined && (over || ponder.game !== current?.started)) {
                closePonder();
            } else if (ponder?.plies !== undefined && ponder.plies !== current?.game.record.moves.length) {
                // The player moved: what it thought of their move is kept, and it waits for the next.
                ponder.plies = undefined;
                ponder.chat.interrupt();
            }

            if (coach !== undefined && coach.game !== current?.started) {
                closeCoach();
            }

            if (current !== undefined && over && endingToCoach(games(), current)) {
                judge(current);
            }

            if (coach !== undefined && over && !coach.chat.busy()) {
                closeCoach();
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
            const times = [ponder, coach, analyst].map((helper) => helper?.chat.turnSince()?.getTime()).filter((time) => time !== undefined);
            return times.length === 0 ? undefined : new Date(Math.min(...times));
        },
        close: () => {
            helpersOff();
            closeAnalyst();
        },
    };
}

/** The quick model Claude Code's agent thinks on at the lower levels. */
const quickModel = "haiku";

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
