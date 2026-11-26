// The hosts the table drives itself, and what differs between them, in one place: the rest of the module is the same for each.
import { quickModels } from "../../host-files/index.ts";
import { type ChatServer, type HostId, hosts, type ToolKind } from "../../hosts/index.ts";
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
    /** The ponderer's turn carries its position, a request sooner than ponder {}: where a request costs seconds; Claude Code's quick model reasons longer on it. */
    readonly ponderInMessage?: true;
    /** The host loads the player's own chesspal server in every chat, whatever server it is given: that one takes the place, through the program's environment. */
    readonly ownServer?: true;
}

/**
 * The hosts whose driver takes its server and its instructions from the table. Never a subagent: the table runs the helpers itself. Codex merges a server
 * the table gives with one of the same name in the player's configuration, which may not start: the table's has a name of its own there. Its model finds a
 * tool by searching them first unless the turn names it, and its quick model reasons at medium unless asked. OpenCode reaches the server only through its
 * `execute`, which is Chesspal's while its code reaches that server alone. Antigravity's turn is not ended by the table: a request it cancelled was seen to
 * come back at the next turn. Antigravity starts the chesspal of the player's own configuration beside any server given, and that one wins: it is the one seated.
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
        ponderInMessage: true,
    },
    { name: "antigravity", driver: "antigravity", title: hosts.antigravity.name, allowed: ["chesspal"], client: hosts.antigravity.client, endsTurnAtMove: false, server: "chesspal", ownServer: true },
    { name: "opencode", driver: "openCode", title: hosts.openCode.name, allowed: ["chesspal"], client: hosts.openCode.client, endsTurnAtMove: true, server: "chesspal" },
];

/** The host the table drives by that name; none for a host it opens in a terminal. */
export function drivenHost(name: string | undefined): DrivenHost | undefined
{
    return driven.find((host) => host.name === name);
}

/**
 * The table's server for a chat of `host` at a place: given with the chat, the command `chesspal` names, with the place's environment; or, for a host that
 * starts the player's own server, that place's environment added to the program's, which that server inherits.
 */
export function placeServer(host: DrivenHost, chesspal: readonly string[], place: Readonly<Record<string, string>>, environment: NodeJS.ProcessEnv): { environment: NodeJS.ProcessEnv; server?: ChatServer; }
{
    if (host.ownServer === true) {
        return { environment: { ...environment, ...place } };
    }

    const [command, ...args] = chesspal;
    return { environment, server: { name: host.server, command: command ?? process.execPath, args: [...args, "mcp"], environment: { ...place } } };
}
