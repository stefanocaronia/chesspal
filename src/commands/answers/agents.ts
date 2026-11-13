// The agents that work beside the chat in Claude Code and Codex (D-98): the analyst that goes over a game over (D-89) and the coach that judges the player's moves (D-88).
import { isReviewed } from "../../core/index.ts";
import { archivedName, coachStarted, type CurrentGame, gameInAnalysis, lastChatStart } from "../../games/index.ts";
import { agentHosts, analystAgent, coachAgent, hasAgent, isCodex } from "../../host-files/index.ts";
import { gameFolder, helpsIn } from "../../profiles/index.ts";
import type { Context } from "../registry/index.ts";
import { namedGame } from "./study.ts";
import { type GameSummary, unplayed } from "./summary.ts";

/** Whether an analyst agent goes over a game over when the player wants: in Claude Code or Codex, with its agent in the player's folder (D-89, D-98). */
export function analystRuns(context: Context): boolean
{
    return agentRuns(context, analystAgent);
}

/**
 * The game over, with the analyst agent that goes over it when the player wants, where it runs (D-89); over, the game from status and ai_say, which come after
 * its end: once reviewed, or taken by the agent, the chat goes over that review and doesn't start the agent for it (Stefano).
 */
export function withAnalyst(summary: GameSummary, context: Context, over?: CurrentGame): GameSummary
{
    const { end } = summary;

    // A game closed before any move has nothing to go over.
    if (end === undefined || unplayed(summary) || !analystRuns(context)) {
        return summary;
    }

    const archived = over === undefined ? undefined : archivedName(gameFolder(context.home()), over);
    const analyst = archived !== undefined && goneOver(context, archived) ? "done" : "offer";
    return { ...summary, end: { ...end, analyst, ...(isCodex(context.host?.()) ? { codex: true } : {}) } };
}

/**
 * How the chat has a game over gone over by the analyst agent, on the player's yes or for the game they brought (D-89); in Codex with spawn_agent by name,
 * since a chat there called analyse_game itself instead (Priya).
 */
export function analystLine(game?: string, codex = false): string
{
    const prompt = `Analyse${game === undefined ? "" : ` ${game}`}. The player speaks <their language>.`;
    const start = codex
        ? `start the ${analystAgent} agent with spawn_agent {"agent_type": "${analystAgent}", "message": "${prompt}", "fork_turns": "none"}`
        : `start the ${analystAgent} agent in the background with the prompt "${prompt}"`;
    return `${start}: it writes its review on the board page, which shows it at work; tell the player in a word, talk the game over with them meanwhile whenever `
        + "they ask, and when it ends go over it with them from what it tells you.";
}

/**
 * The analyst's line for the chat that looks at the game in analysis with no review and no analyst at it, as after «Delete the analysis», which rings no
 * doorbell (Priya): once a change of the analysis, where the server keeps what it told.
 */
export function analystOnView(context: Context, game: string | undefined): string | undefined
{
    if (game === undefined || context.agent !== undefined || !analystRuns(context)) {
        return undefined;
    }

    const analysis = gameInAnalysis(gameFolder(context.home()));
    const key = `analyst on view ${game} ${analysis?.at ?? ""}`;

    if (analysis?.game !== game || context.told?.has(key) === true || goneOver(context, game)) {
        return undefined;
    }

    context.told?.add(key);
    return `${game} has no review. When the player wants it gone over, ${analystLine(game, isCodex(context.host?.()))}`;
}

/** How the chat goes over a game the analyst agent has reviewed, or is reviewing: from that review, never with another agent (Stefano). */
export function reviewedLine(game?: string): string
{
    return "The analyst agent has gone over this game, or is at it: don't start it for this review. When the player wants it gone over, go over it with them from what "
        + `it told you, or, in a chat without it, from its review on the board page, which analyse_game ${game === undefined ? "" : `{"game": "${game}"} `}gives.`;
}

/** Whether a coach judges the player's moves when the helps are on: in Claude Code or Codex, with its agent in the player's folder (D-80, D-88, D-98). */
export function coachRuns(context: Context): boolean
{
    return agentRuns(context, coachAgent);
}

/** Whether one of Chesspal's agents runs beside this chat: in a host that starts agents, with its file in the player's folder. */
export function agentRuns(context: Context, agent: string): boolean
{
    const host = context.host?.();
    return host !== undefined && agentHosts.includes(host) && hasAgent(context.folder, agent, host);
}

/**
 * Whether to start the coach once a move has ended the game on the board, with the helps on: it judges the player's last move, their own that ended it too
 * (D-88). Told again until it starts, since a chat busy telling the end may lose the line on its way to its words (Priya).
 */
export function coachOnEnd(context: Context, folder: string, current: CurrentGame): boolean
{
    return current.game.outcome.over && helpsIn(folder) && coachRuns(context) && !coachStarted(folder, current);
}

/**
 * How to start the coach on the player's move that ended the game: whatever the player asks, beside the analyst when the chat starts it too, since a chat on
 * a quick model started only the agent that answered the player (Priya).
 */
export const coachOnEndLine = `Coach the player: start the ${coachAgent} agent in the background with the prompt "Coach.", whatever the player asks: it judges `
    + "the move that ended the game, apart from the analyst; when you start the analyst too, start both in one message. Start it even when an agent of the move "
    + "before has just ended, and write nothing about it in the chat, now or when it ends.";

/**
 * How to start the agents, in one message, the one that thinks first, since it needs the time (Priya), and that the player sees nothing of
 * them: their end needs no answer either. The end of the last move's agents, told just after, must not take their place (Priya).
 */
export function agentsLine(agents: readonly string[]): string
{
    const prompt = (agent: string) => `the prompt "${agent === coachAgent ? "Coach." : "Ponder."}"`;
    const [first = "", second] = agents;

    if (second === undefined) {
        const why = first === coachAgent ? "Coach the player" : "Think on the player's time";
        return `${why}: start the ${first} agent in the background with ${prompt(first)}; start it even when an agent of the move before has just ended, `
            + "and write nothing about it in the chat, now or when it ends.";
    }

    return `Think on the player's time and coach them: in one message, start two agents in the background, ${first} with ${prompt(first)} and ${second} with `
        + `${prompt(second)}; start them even when an agent of the move before has just ended, and write nothing about them in the chat, now or when they end.`;
}

/**
 * Whether a game is gone over already: reviewed, or taken by an analyst at work on it, whatever the page opened since (Federico); not once its review is
 * deleted, for the analyst to write it again (Stefano).
 */
export function goneOver(context: Context, game: string): boolean
{
    if (analystOf(context, game) !== undefined) {
        return true;
    }

    try {
        return isReviewed(namedGame(context, game).record);
    } catch {
        // A game that cannot be read is offered as it would be: the analyst says what is wrong with it.
        return false;
    }
}

/**
 * The run of the analyst agent at work on a game: the one that took it last, unless its chat has started again since, not only summarized, and took the
 * agent with it, or it has written nothing for half an hour, as one long dead (D-109): a quiet minute proves nothing, since an analyst may think long.
 */
export function analystOf(context: Context, game: string): string | undefined
{
    const analysis = gameInAnalysis(gameFolder(context.home()));
    const taken = analysis?.analyst;
    const start = lastChatStart(context.folder);
    const restarted = taken !== undefined && start !== undefined && start.source !== "compact" && Date.parse(start.at) > Date.parse(taken.since);
    const quiet = analysis !== undefined && context.now().getTime() - Date.parse(analysis.at) > analystQuiet;
    return taken?.game === game && !restarted && !quiet ? taken.run : undefined;
}

/** How long an analyst may write nothing before it counts as gone. */
const analystQuiet = 30 * 60 * 1000;

/** What stops an analyst agent on a game another analyst has taken: the chat hears of the review from that one (Priya). */
export const anotherAnalyst = "Stop now: another analyst is reviewing this game. End with one line for the AI that started you: its review is on its way to the "
    + "board page, and its end comes to you by itself; meanwhile talk the game over with the player whenever they ask. Should it never come, the player has "
    + "the game analysed again from the board page's list of analyses.";
