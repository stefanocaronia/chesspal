// The hosts the table drives itself, and what differs between them, in one place: the rest of the module is the same for each.
import { quickModels } from "../../host-files/index.ts";
import { type HostId, hosts, type ToolKind } from "../../hosts/index.ts";
import type { HostName } from "../table/index.ts";

// The table's server in Codex: no player names one so, and Codex keeps the name whole in its tools' names, which its code calls.
const codexServer = "chesspal_table";

/**
 * A host the table drives: its name as the page says it, its driver, its name for the player, the kinds of tools its chats may use, the quick model the
 * ponderer thinks on at the lower levels, none where the ponderer thinks on the chat's model, and the name its MCP client gives itself, by which the
 * opponent's answers say which model thought. `endsTurnAtMove`: the table ends the opponent's turn itself once its move asks nothing more of it.
 */
export interface DrivenHost
{
    readonly name: HostName;
    readonly driver: HostId;
    readonly title: string;
    readonly allowed: readonly ToolKind[];
    readonly quickModel?: string;
    readonly client: string;
    readonly endsTurnAtMove: boolean;
    /** The name of the table's MCP server in its chats. */
    readonly server: string;
    /** The name a helper's turn calls its tool by, where the host's model would search its tools for it first; none where the turn names no tool. */
    readonly helperTool?: (tool: string) => string;
    /** The effort the ponderer thinks with where none is chosen; none where the host's own is quick enough. */
    readonly ponderEffort?: string;
}

/**
 * The hosts whose driver takes its server and its instructions from the table. Never a subagent: the table runs the helpers itself. Codex merges a server
 * the table gives with one of the same name in the player's configuration, which may not start: the table's has a name of its own there. Its model finds a
 * tool by searching them first unless the turn names it, and its quick model reasons at medium unless asked. OpenCode reaches the server only through its
 * `execute`, which is Chesspal's while its code reaches that server alone. Antigravity's turn is not ended by the table: a request it cancelled was seen to
 * come back at the next turn.
 */
const driven: readonly DrivenHost[] = [
    {
        name: "claude",
        driver: "claudeCode",
        title: hosts.claudeCode.name,
        allowed: ["chesspal"],
        quickModel: quickModels.claude,
        client: hosts.claudeCode.client,
        endsTurnAtMove: true,
        server: "chesspal",
    },
    {
        name: "codex",
        driver: "codex",
        title: hosts.codex.name,
        allowed: ["chesspal"],
        quickModel: quickModels.codex,
        client: hosts.codex.client,
        endsTurnAtMove: true,
        server: codexServer,
        helperTool: (tool) => `tools.mcp__${codexServer}__${tool}`,
        ponderEffort: "low",
    },
    { name: "antigravity", driver: "antigravity", title: hosts.antigravity.name, allowed: ["chesspal"], client: hosts.antigravity.client, endsTurnAtMove: false, server: "chesspal" },
    { name: "opencode", driver: "openCode", title: hosts.openCode.name, allowed: ["chesspal"], client: hosts.openCode.client, endsTurnAtMove: true, server: "chesspal" },
];

/** The host the table drives by that name; none for a host it opens in a terminal. */
export function drivenHost(name: string | undefined): DrivenHost | undefined
{
    return driven.find((host) => host.name === name);
}
