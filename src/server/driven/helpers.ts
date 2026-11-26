// The opponent's helpers the table runs itself while the switch is on, a chat each, as Claude Code's own agents would: one that thinks on the player's time,
// the coach with the helps on, and the analyst of a game over, which the page may ask for with no chat at the table too.
import { type Context, endingToCoach, type HelperRole, namedGame, speechOf, type TableHelpers } from "../../commands/index.ts";
import { isReviewed, levelOf } from "../../core/index.ts";
import { type CurrentGame, endOf, forgetAnalyst, gameInAnalysis, loadGame } from "../../games/index.ts";
import { onQuickModel } from "../../host-files/index.ts";
import { gameFolder, helpsIn } from "../../profiles/index.ts";
import { chatStart } from "../table/index.ts";
import { type HelperChat, type HelperChatOptions, type HelperEnd, type HelperModel, openHelperChat } from "./helper-chat.ts";

/** What the helpers run with besides the table's context: how a chat opens, and what the table knows of the opponent's. */
export interface HelpersOptions extends Omit<HelperChatOptions, "context" | "helpers">
{
    /** Whether the profile in use has the switch on. */
    readonly switchedOn: () => boolean;
    /** The opponent's chat the table drives, once at the table, with the model and effort it runs; none otherwise. */
    readonly opponent: () => HelperModel | undefined;
    /** Whether no chat is at the table. */
    readonly tableFree: () => boolean;
    /** What the pages show may have changed: the analyst started or ended. */
    readonly changed: () => void;
    /** Tells the opponent's chat, when one is at the table, what the analyst found. */
    readonly tell: (line: string) => void;
}

/** The table's helpers, as the chat it drives and the page call them. */
export interface Helpers
{
    /** The field of a place's context that says which helpers the table runs. */
    readonly field: TableHelpers;
    /** The opponent moved: the one that thinks gets a turn while the game goes on, the coach with the helps on. */
    afterMove(): void;
    /** The game may have changed: the player's move stops the thinking, a game over ends it and has the coach judge the move that ended it, a new game ends them. */
    check(): void;
    /** The game in analysis the brought game or the start again asked for, if not yet reviewed, goes to the analyst. */
    analysePending(): void;
    /** The player stopped the analysis on the page. */
    stopAnalysis(): void;
    /** The opponent's chat left the table: the one that thinks and the coach go with it. */
    opponentLeft(): void;
    /** Ends every helper's chat, gently. */
    close(): void;
}

/** The helpers of a table serving `context`. */
export function tableHelpers(context: Context, options: HelpersOptions): Helpers
{
    const games = (): string => gameFolder(context.home());
    let ponder: { chat: HelperChat; game: string; plies?: number | undefined; } | undefined;
    let coach: { chat: HelperChat; game: string; } | undefined;
    let analyst: { chat: HelperChat; game: string; } | undefined;
    let coached: string | undefined;

    const runs = (role: HelperRole): boolean => options.switchedOn() && (options.opponent() !== undefined || (role === "analyst" && options.tableFree()));

    const open = (role: HelperRole, model: HelperModel, ended: (end: HelperEnd) => void): HelperChat => openHelperChat(role, model, { ...options, context, helpers: field }, ended);

    const closePonder = (): void => {
        ponder?.chat.close();
        ponder = undefined;
    };

    const closeCoach = (): void => {
        coach?.chat.close();
        coach = undefined;
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
            const state = { game: current.started, chat: open("ponder", model, (end) => lostHelper(end, ponder === state, closePonder)) };
            ponder = state;
        }

        ponder.plies = current.game.record.moves.length;
        ponder.chat.ask("Ponder.");
    };

    const judge = (current: CurrentGame): void => {
        const opponent = options.opponent();
        const key = `${current.started} ${current.game.record.moves.length}`;

        if (opponent === undefined || coached === key || !runs("coach") || !helpsIn(games())) {
            return;
        }

        coached = key;

        if (coach?.game !== current.started) {
            closeCoach();
            const state = { game: current.started, chat: open("coach", opponent, (end) => lostHelper(end, coach === state, closeCoach)) };
            coach = state;
        }

        coach.chat.ask("Coach.");
    };

    const analystEnded = (state: { chat: HelperChat; game: string; }, end: HelperEnd): void => {
        if (analyst !== state) {
            return;
        }

        analyst = undefined;
        state.chat.close();
        forgetAnalyst(games());
        options.changed();

        if (end.reason === "done") {
            options.tell(`The analyst has gone over ${state.game}${end.text === "" ? "." : `: ${end.text}`} Go over it with the player.`);
        }
    };

    const closeAnalyst = (): void => {
        analyst?.chat.close();
        analyst = undefined;
    };

    const analyse = (game: string): boolean => {
        if (!runs("analyst")) {
            return false;
        }

        if (analyst?.game === game) {
            return true;
        }

        closeAnalyst();
        // The game is the new analyst's to take, whoever held it before.
        forgetAnalyst(games());
        const model = options.opponent() ?? savedModel(context);
        const state = { game, chat: open("analyst", model, (end) => analystEnded(state, end)) };
        analyst = state;
        state.chat.ask(`Analyse ${game}. The player speaks ${speechOf(games(), context.language)?.language ?? "English"}.`);
        options.changed();
        return true;
    };

    const field: TableHelpers = { runs, analysing: () => analyst?.game, analyse };

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

            // A game going on stops the analysis: what was written of its review stays.
            if (analyst !== undefined && !over) {
                closeAnalyst();
                forgetAnalyst(games());
                options.changed();
            }
        },
        analysePending: () => {
            const analysis = gameInAnalysis(games());

            if (analysis !== undefined && (analysis.brought === true || analysis.redo === true) && !reviewed(context, analysis.game)) {
                analyse(analysis.game);
            }
        },
        stopAnalysis: () => {
            if (analyst !== undefined) {
                closeAnalyst();
                options.changed();
            }
        },
        opponentLeft: () => {
            closePonder();
            closeCoach();
        },
        close: () => {
            closePonder();
            closeCoach();
            closeAnalyst();
        },
    };
}

/** A helper that failed is let go, when it is still the one at work: the next turn asked of it opens another. */
function lostHelper(end: HelperEnd, current: boolean, letGo: () => void): void
{
    if (end.reason === "failed" && current) {
        letGo();
    }
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

/** The model and effort the player chose on the page for Claude Code: the host's own where none. */
function savedModel(context: Context): HelperModel
{
    try {
        const { choice } = chatStart(context, "claude");
        return { model: choice.model ?? "", effort: choice.effort };
    } catch {
        return { model: "" };
    }
}
