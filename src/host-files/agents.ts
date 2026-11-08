// The agents that work in the background in Claude Code: those that think for the opponent on the player's time (D-72), one on the host's quick model for the
// lower levels, one on the AI's own for the higher; the coach, with the helps on (D-88), and the analyst of a game over (D-89), on the AI's own model.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AiLevel } from "../core/index.ts";

const quickAgent = "chesspal-ponder-quick";
const ownAgent = "chesspal-ponder";

/** The agents that think for the AI, by their names. */
export const ponderAgents: readonly string[] = [quickAgent, ownAgent];

/** The coach's agent (D-88). */
export const coachAgent = "chesspal-coach";

/** The analyst's agent, which reviews a game over on the board page when the player wants it (D-89). */
export const analystAgent = "chesspal-analyst";

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
    const ponder = instructions("ponder");
    const thinking = "Chesspal's opponent thinking on the player's time. Started by the AI in the background after its move, as ai_move says.";
    return [
        { agent: quickAgent, model: "haiku", description: thinking, tools: ["ponder"], text: ponder },
        { agent: ownAgent, model: "inherit", description: thinking, tools: ["ponder"], text: ponder },
        // Its description tells the chat it starts the agent only as ai_move says, never to ask it about the game (Priya, review of T-112).
        { agent: coachAgent, model: "inherit", description: "Chesspal's coach. Started only as Chesspal's answers say, in the background, never to answer the player.", tools: ["coach"], text: instructions("coach") },
        {
            agent: analystAgent,
            model: "inherit",
            description: "Chesspal's analyst. Started only as Chesspal's answers say, in the background, to review a game over on the board page; never to answer the player.",
            tools: ["analyse_game", "annotate_game", "look", "position"],
            text: `${instructions("analyst-agent")}\n${instructions("analysis")}`,
        },
    ].map(({ agent, model, description, tools, text }) => ({
        path: agentPath(folder, agent),
        // The tools it works with: Claude Code gives an agent its MCP tools loaded, with no search first (Priya, round of T-109).
        text: ["---", `name: ${agent}`, `description: ${description}`, `tools: ${tools.map((tool) => `mcp__chesspal__${tool}`).join(", ")}`, `model: ${model}`, "---", "", text, ""].join("\n"),
    }));
}

/** Instructions for the AI, by their file's name in the package's instructions folder. */
export function instructions(name: string): string
{
    return readFileSync(new URL(`../../instructions/${name}.md`, import.meta.url), "utf8").trim();
}

function agentPath(folder: string, agent: string): string
{
    return join(folder, ".claude", "agents", `${agent}.md`);
}
