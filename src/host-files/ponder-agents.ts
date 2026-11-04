// The agents that think on the player's time in Claude Code (D-72): one on the host's quick model for the lower levels, one on the AI's own for the higher.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AiLevel } from "../core/index.ts";

/** The agent that thinks for the AI at a level: on the quick model at the beginner and club levels, on the AI's own above. */
export function ponderAgentFor(level: AiLevel): string
{
    return level === "beginner" || level === "club" ? quickAgent : ownAgent;
}

/** Whether the player's folder has the agent, as init writes it: a folder set up before it has none, and the AI then plays as before. */
export function hasPonderAgent(folder: string, agent: string): boolean
{
    return existsSync(agentPath(folder, agent));
}

/** The agents' files, as Claude Code reads them from .claude/agents: Chesspal's whole, rewritten by init. */
export function ponderAgentFiles(folder: string): { path: string; text: string; }[]
{
    const instructions = readFileSync(new URL("../../instructions/ponder.md", import.meta.url), "utf8").trim();
    return [{ agent: quickAgent, model: "haiku" }, { agent: ownAgent, model: "inherit" }].map(({ agent, model }) => ({
        path: agentPath(folder, agent),
        text: [
            "---",
            `name: ${agent}`,
            "description: Chesspal's opponent thinking on the player's time. Started by the AI in the background after its move, as ai_move says.",
            `tools: ${tools.join(", ")}`,
            `model: ${model}`,
            "---",
            "",
            instructions,
            "",
        ].join("\n"),
    }));
}

const quickAgent = "chesspal-ponder-quick";
const ownAgent = "chesspal-ponder";

// The chesspal tool it works with, and the tool search through which Claude Code may load it.
const tools = ["mcp__chesspal__ponder", "ToolSearch"];

function agentPath(folder: string, agent: string): string
{
    return join(folder, ".claude", "agents", `${agent}.md`);
}
