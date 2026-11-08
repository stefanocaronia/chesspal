// The agents that work on the player's time in Claude Code: those that think for the opponent (D-72), one on the host's quick model for the lower levels,
// one on the AI's own for the higher; and the coach, with the helps on, on the AI's own model (D-88).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AiLevel } from "../core/index.ts";

const quickAgent = "chesspal-ponder-quick";
const ownAgent = "chesspal-ponder";

/** The agents that think for the AI, by their names. */
export const ponderAgents: readonly string[] = [quickAgent, ownAgent];

/** The coach's agent (D-88). */
export const coachAgent = "chesspal-coach";

/** The agent that thinks for the AI at a level: on the quick model at the beginner and club levels, on the AI's own above. */
export function ponderAgentFor(level: AiLevel): string
{
    return onQuickModel(level) ? quickAgent : ownAgent;
}

/** Whether the AI's thoughts on the player's time come from a quicker model than its own at a level. */
export function onQuickModel(level: AiLevel): boolean
{
    return level === "beginner" || level === "club";
}

/** Whether the player's folder has the agent, as init writes it: a folder set up before it has none, and the AI then plays as before. */
export function hasAgent(folder: string, agent: string): boolean
{
    return existsSync(agentPath(folder, agent));
}

/** The agents' files, as Claude Code reads them from .claude/agents: Chesspal's whole, rewritten by init. */
export function agentFiles(folder: string): { path: string; text: string; }[]
{
    const instructions = (name: string) => readFileSync(new URL(`../../instructions/${name}.md`, import.meta.url), "utf8").trim();
    const ponder = instructions("ponder");
    const thinking = "Chesspal's opponent thinking on the player's time. Started by the AI in the background after its move, as ai_move says.";
    return [
        { agent: quickAgent, model: "haiku", description: thinking, tool: "ponder", text: ponder },
        { agent: ownAgent, model: "inherit", description: thinking, tool: "ponder", text: ponder },
        // Its description tells the chat it starts the agent only as ai_move says, never to ask it about the game (Priya, review of T-112).
        { agent: coachAgent, model: "inherit", description: "Chesspal's coach. Started only as Chesspal's answers say, in the background, never to answer the player.", tool: "coach", text: instructions("coach") },
    ].map(({ agent, model, description, tool, text }) => ({
        path: agentPath(folder, agent),
        // The one tool it works with: Claude Code gives an agent its MCP tools loaded, with no search first (Priya, round of T-109).
        text: ["---", `name: ${agent}`, `description: ${description}`, `tools: mcp__chesspal__${tool}`, `model: ${model}`, "---", "", text, ""].join("\n"),
    }));
}

function agentPath(folder: string, agent: string): string
{
    return join(folder, ".claude", "agents", `${agent}.md`);
}
