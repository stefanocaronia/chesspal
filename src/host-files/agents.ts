// The agents that work in the background in Claude Code and Codex (D-98): those that think for the opponent on the player's time (D-72), one on the host's
// quick model for the lower levels, one on the AI's own for the higher; the coach, with the helps on (D-88), and the analyst of a game over (D-89), on the AI's own.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AiLevel } from "../core/index.ts";

const quickAgent = "chesspal-ponder-quick";
const ownAgent = "chesspal-ponder";
const codexHost = "codex-mcp-client";

/** The hosts whose chat starts Chesspal's agents, by the names they give the server (D-98). */
export const agentHosts: readonly string[] = ["claude-code", codexHost];

/** Whether the host is Codex, which runs each agent in a process of its own and gives it every tool (D-98). */
export function isCodex(host: string | undefined): boolean
{
    return host === codexHost;
}

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

/** Whether the player's folder has the agent for the host, as init writes it: a folder set up before it has none, and the AI then plays as before. */
export function hasAgent(folder: string, agent: string, host: string | undefined): boolean
{
    return existsSync(isCodex(host) ? codexAgentPath(folder, agent) : claudeAgentPath(folder, agent));
}

/** The tools of one of Chesspal's agents, by its name; undefined for another agent. Codex gives its agents every tool, so the server keeps them to theirs (D-98). */
export function agentTools(agent: string): readonly string[] | undefined
{
    return toolsOf[agent];
}

/** The agents' files, as Claude Code reads them from .claude/agents and Codex from .codex/agents: Chesspal's whole, rewritten by init, for both hosts. */
export function agentFiles(folder: string): { path: string; text: string; }[]
{
    const agents = agentSpecs();
    return [...agents.map((agent) => claudeAgentFile(folder, agent)), ...agents.map((agent) => codexAgentFile(folder, agent))];
}

/** Instructions for the AI, by their file's name in the package's instructions folder. */
export function instructions(name: string): string
{
    return readFileSync(new URL(`../../instructions/${name}.md`, import.meta.url), "utf8").trim();
}

/** An agent as init writes it, with its model in each host: the AI's own unless one is given. */
interface AgentSpec
{
    agent: string;
    claudeModel: string;
    codexModel?: string;
    description: string;
    text: string;
}

const toolsOf: Readonly<Record<string, readonly string[]>> = {
    [quickAgent]: ["ponder"],
    [ownAgent]: ["ponder"],
    [coachAgent]: ["coach"],
    [analystAgent]: ["analyse_game", "annotate_game", "look", "position"],
};

// Codex's quick model for the lower levels: written in its agent, since Codex ignores a model the chat names when it starts one that has it (Priya).
const codexQuickModel = "gpt-6-luna";

function agentSpecs(): AgentSpec[]
{
    const ponder = instructions("ponder");
    const thinking = "Chesspal's opponent thinking on the player's time. Started by the AI in the background after its move, as ai_move says.";
    return [
        { agent: quickAgent, claudeModel: "haiku", codexModel: codexQuickModel, description: thinking, text: ponder },
        { agent: ownAgent, claudeModel: "inherit", description: thinking, text: ponder },
        // Its description tells the chat it starts the agent only as ai_move says, never to ask it about the game (Priya).
        {
            agent: coachAgent,
            claudeModel: "inherit",
            description: "Chesspal's coach. Started only as Chesspal's answers say, in the background, never to answer the player.",
            text: instructions("coach"),
        },
        {
            agent: analystAgent,
            claudeModel: "inherit",
            description: "Chesspal's analyst. Started only as Chesspal's answers say, in the background, to review a game over on the board page; never to answer the player.",
            text: `${instructions("analyst-agent")}\n${instructions("analysis")}`,
        },
    ];
}

function claudeAgentFile(folder: string, { agent, claudeModel, description, text }: AgentSpec): { path: string; text: string; }
{
    // The tools it works with: Claude Code gives an agent its MCP tools loaded, with no search first (Priya).
    const tooled = `tools: ${(toolsOf[agent] ?? []).map((tool) => `mcp__chesspal__${tool}`).join(", ")}`;
    return { path: claudeAgentPath(folder, agent), text: ["---", `name: ${agent}`, `description: ${description}`, tooled, `model: ${claudeModel}`, "---", "", text, ""].join("\n") };
}

/**
 * Codex's agent: its instructions in a literal string; no effort, which the chat could no longer change, and no model but the quick one's, so that the
 * others play on the AI's own (Priya). Codex gives an agent all the chat's MCP servers: its instructions name its own tools.
 */
function codexAgentFile(folder: string, { agent, codexModel, description, text }: AgentSpec): { path: string; text: string; }
{
    if (text.includes("'''")) {
        throw new Error(`The instructions of ${agent} hold ''', which would end Codex's literal string early: write them another way.`);
    }

    const model = codexModel === undefined ? [] : [`model = ${JSON.stringify(codexModel)}`];
    // Its tools by the names Codex gives them, which spare the agent a search for them first (Priya).
    const tools = (toolsOf[agent] ?? []).map((tool) => `tools.mcp__chesspal__${tool}`).join(", ");
    const lines = [`name = ${JSON.stringify(agent)}`, `description = ${JSON.stringify(description)}`, ...model, "developer_instructions = '''", text, "", `Your tools: ${tools}.`, "'''", ""];
    return { path: codexAgentPath(folder, agent), text: lines.join("\n") };
}

function claudeAgentPath(folder: string, agent: string): string
{
    return join(folder, ".claude", "agents", `${agent}.md`);
}

function codexAgentPath(folder: string, agent: string): string
{
    return join(folder, ".codex", "agents", `${agent}.toml`);
}
