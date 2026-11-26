// The hosts the table drives itself, and what differs between them, in one place: the rest of the module is the same for each.
import { quickModels } from "../../host-files/index.ts";
import { type HostId, hosts, type ToolKind } from "../../hosts/index.ts";
import type { HostName } from "../table/index.ts";

/**
 * A host the table drives: its name as the page says it, its driver, its name for the player, the kinds of tools its chats may use, the quick model the
 * ponderer thinks on at the lower levels, and the name its MCP client gives itself, by which the opponent's answers say which model thought.
 */
export interface DrivenHost
{
    readonly name: HostName;
    readonly driver: HostId;
    readonly title: string;
    readonly allowed: readonly ToolKind[];
    readonly quickModel: string;
    readonly client: string;
}

/**
 * The hosts whose driver takes its server and its instructions from the table. Never a subagent: the table runs the helpers itself. Codex keeps its own
 * reads, which it runs without asking: of kind read, they are held to the chat's folder, where any other kind would fail the turn.
 */
const driven: readonly DrivenHost[] = [
    { name: "claude", driver: "claudeCode", title: hosts.claudeCode.name, allowed: ["chesspal"], quickModel: quickModels.claude, client: hosts.claudeCode.client },
    { name: "codex", driver: "codex", title: hosts.codex.name, allowed: ["chesspal", "read"], quickModel: quickModels.codex, client: hosts.codex.client },
];

/** The host the table drives by that name; none for a host it opens in a terminal. */
export function drivenHost(name: string | undefined): DrivenHost | undefined
{
    return driven.find((host) => host.name === name);
}
