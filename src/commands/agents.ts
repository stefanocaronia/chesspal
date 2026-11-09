// The agents that work beside the chat in Claude Code and Codex (D-98): the analyst that goes over a game over (D-89) and the coach that judges the player's moves (D-88).
import { isReviewed } from "../core/index.ts";
import { archivedGame, archivedName, coachStarted, type CurrentGame, gameInAnalysis } from "../games/index.ts";
import { agentHosts, analystAgent, coachAgent, hasAgent } from "../host-files/index.ts";
import { gameFolder, helpsIn } from "../profiles/index.ts";
import type { Context } from "./context.ts";
import type { GameSummary } from "./game-summary.ts";

/** Whether an analyst agent goes over a game over when the player wants: in Claude Code or Codex, with its agent in the player's folder (D-89, D-98). */
export function analystRuns(context: Context): boolean
{
    return agentRuns(context, analystAgent);
}

/**
 * The game over, with the analyst agent that goes over it when the player wants, where it runs (D-89); over, the game from status and ai_say, which come after
 * its end: once it is in analysis, by the agent or the chat, or reviewed, the chat goes over that review and never starts the agent again (Stefano).
 */
export function withAnalyst(summary: GameSummary, context: Context, over?: CurrentGame): GameSummary
{
    const { end } = summary;

    if (end === undefined || !analystRuns(context)) {
        return summary;
    }

    return { ...summary, end: { ...end, analyst: over !== undefined && goneOver(context, over) ? "done" : "offer" } };
}

/** How the chat has a game over gone over by the analyst agent, on the player's yes or for the game they brought (D-89). */
export function analystLine(game?: string): string
{
    return `start the chesspal-analyst agent in the background with the prompt "Analyse${game === undefined ? "" : ` ${game}`}. The player speaks <their language>.": it writes its review on the board `
        + "page, which shows it at work; tell the player in a word, and when it ends go over the game with them from what it tells you.";
}

/** How the chat goes over a game the analyst agent has reviewed, or is reviewing: from that review, never with another agent (Stefano). */
export function reviewedLine(game?: string): string
{
    return "The analyst agent has gone over this game, or is at it: never start it again. When the player wants it gone over, go over it with them from what "
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
 * Whether to start the coach after the player's own move has ended the game on the board, with the helps on: it judges that move too (D-88). Told again
 * until it starts, since a chat woken by the page may lose the line on its way to its words (Priya).
 */
export function coachOnEnd(context: Context, folder: string, current: CurrentGame): boolean
{
    const { game, ai } = current;
    return game.outcome.over && game.position.turn === ai && helpsIn(folder) && coachRuns(context) && !coachStarted(folder, current);
}

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

/** Whether the game over is gone over already: in analysis now, by the analyst agent or the chat, or reviewed, whatever the page opened since (Federico). */
function goneOver(context: Context, over: CurrentGame): boolean
{
    const folder = gameFolder(context.home());
    const archived = archivedName(folder, over);

    if (archived === undefined || gameInAnalysis(folder)?.game === archived) {
        return archived !== undefined;
    }

    try {
        return isReviewed(archivedGame(folder, archived));
    } catch {
        // A game the archive cannot read is offered as it would be: the analyst says what is wrong with it.
        return false;
    }
}
