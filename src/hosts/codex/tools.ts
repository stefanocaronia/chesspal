// Codex's tools as the table reads them: the items of a thread and the approvals it asks, each a tool with its kind, and the answer to each approval.
import type { ToolKind } from "../chat.ts";
import { isObject, type Message } from "../lines.ts";

/** A tool for the table: its name, its kind, the MCP server it belongs to, the paths it reads where it is of kind read, and the permissions it asks as read. */
export interface CodexTool
{
    name: string;
    kind: ToolKind;
    server?: string;
    paths: unknown[];
    granted?: Message;
}

// The chesspal server, whose tools are Chesspal's commands; the actions Codex reads in a command that only read.
const chesspalServer = "chesspal";
const readingActions = ["read", "listFiles", "search"];

/** The tool an item of the thread is; undefined for an item that is no tool, as the AI's prose, its reasoning or the player's words. */
export function toolOfItem(item: Message): CodexTool | undefined
{
    switch (item.type) {
        case "mcpToolCall":
            return mcpTool(item.server, item.tool);
        case "commandExecution":
            return commandTool(item.commandActions, item.cwd);
        case "fileChange":
            return { name: "fileChange", kind: "write", paths: [] };
        case "webSearch":
            return { name: "webSearch", kind: isObject(item.action) && item.action.type === "openPage" ? "fetch" : "web", paths: [] };
        case "imageView":
            return { name: "imageView", kind: "read", paths: [item.path] };
        // A subagent the AI starts, which only its launch says, and the AI's calls to the subagents: any is of kind agent; what it does comes in its own
        // thread, held to the AI's limits.
        case "subAgentActivity":
            return item.kind === "started" ? { name: "subAgentActivity", kind: "agent", paths: [] } : undefined;
        case "collabAgentToolCall":
            return { name: "collabAgentToolCall", kind: "agent", paths: [] };
        // A picture Codex paints itself, kept in its own folder.
        case "imageGeneration":
            return { name: "imageGeneration", kind: "image", paths: [] };
        case "dynamicToolCall":
            return { name: "dynamicToolCall", kind: "other", paths: [] };
        default:
            return undefined;
    }
}

/** The tool a request of the host asks to use; undefined for a request that asks no approval of a tool. */
export function toolOfRequest(method: string, params: Message): CodexTool | undefined
{
    switch (method) {
        case "item/commandExecution/requestApproval":
            return commandTool(params.commandActions, params.cwd);
        case "execCommandApproval":
            return { name: "commandExecution", kind: "shell", paths: [] };
        case "item/fileChange/requestApproval":
        case "applyPatchApproval":
            return { name: "fileChange", kind: "write", paths: [] };
        case "item/permissions/requestApproval":
            return permissionsTool(params.permissions);
        case "mcpServer/elicitation/request":
            return isApproval(params) ? mcpTool(params.serverName, undefined) : undefined;
        default:
            return undefined;
    }
}

/** The answer to a request of approval, yes or no, in the shape its method takes: permissions granted are only those the table read. */
export function approvalAnswer(method: string, tool: CodexTool, allowed: boolean, refusal: string): Message
{
    switch (method) {
        case "execCommandApproval":
        case "applyPatchApproval":
            return { decision: allowed ? "approved" : { denied: { rejection: refusal } } };
        case "item/permissions/requestApproval":
            return { permissions: allowed ? tool.granted ?? {} : {}, scope: "turn" };
        case "mcpServer/elicitation/request":
            return { action: allowed ? "accept" : "decline", content: null, _meta: null };
        default:
            return { decision: allowed ? "accept" : "decline" };
    }
}

/** A tool of an MCP server: a command of the chesspal server by its own name; any other server's by its name and the tool's. */
export function mcpTool(server: unknown, tool: unknown): CodexTool
{
    const named = typeof tool === "string" && tool !== "" ? tool : undefined;

    if (server === chesspalServer) {
        return { name: named ?? chesspalServer, kind: "chesspal", server: chesspalServer, paths: [] };
    }

    return { name: `${String(server)}/${named ?? "?"}`, kind: "other", ...(typeof server === "string" ? { server } : {}), paths: [] };
}

/** A command: of kind read where Codex reads it as reading files alone, with the paths it reads and its folder; else a shell. */
function commandTool(actions: unknown, cwd: unknown): CodexTool
{
    const all = Array.isArray(actions) ? actions : [];
    const reads = all.length > 0 && all.every((action) => isObject(action) && readingActions.includes(String(action.type)));

    if (!reads) {
        return { name: "commandExecution", kind: "shell", paths: [] };
    }

    // A listing or a search with no path is of the command's own folder.
    const paths = all.filter(isObject).map((action) => action.path ?? ".");
    return { name: "commandExecution", kind: "read", paths: [...(cwd === undefined || cwd === null ? [] : [cwd]), ...paths] };
}

/**
 * More permissions asked for a command: the network alone is fetching, writing is writing, reading alone is a read of the paths asked. Anything in a shape
 * the table does not know, or more than one of these, is of kind other; what is granted is only what was read.
 */
function permissionsTool(permissions: unknown): CodexTool
{
    const other: CodexTool = { name: "permissions", kind: "other", paths: [] };
    const asked = fields(permissions, ["network", "fileSystem"]);
    const network = fields(asked?.network ?? {}, ["enabled"]);
    const files = fields(asked?.fileSystem ?? {}, ["read", "write", "entries", "globScanMaxDepth"]);

    if (asked === undefined || network === undefined || files === undefined || !(network.enabled === undefined || typeof network.enabled === "boolean")) {
        return other;
    }

    const [read, write, entries] = [paths(files.read), paths(files.write), Array.isArray(files.entries ?? []) ? (files.entries ?? []) as unknown[] : undefined];

    // Entries say neither reading nor writing in a shape the table knows: they are of another kind.
    if (read === undefined || write === undefined || entries === undefined || entries.length > 0 || [network.enabled === true, read.length > 0, write.length > 0].filter(Boolean).length > 1) {
        return other;
    }

    if (network.enabled === true) {
        return { name: "permissions", kind: "fetch", paths: [], granted: { network: { enabled: true } } };
    }

    if (write.length > 0) {
        return { name: "permissions", kind: "write", paths: [] };
    }

    return { name: "permissions", kind: "read", paths: read, granted: read.length === 0 ? {} : { fileSystem: { read } } };
}

/** An object's fields that hold a value, null being none; undefined where it is no object or has a field not among those known. */
function fields(value: unknown, known: string[]): Message | undefined
{
    const held = isObject(value) ? Object.entries(value).filter(([, field]) => field !== null && field !== undefined) : undefined;
    return held === undefined || held.some(([key]) => !known.includes(key)) ? undefined : Object.fromEntries(held);
}

/** A list of paths, none where it is missing; undefined where it is not a list of text. */
function paths(value: unknown): string[] | undefined
{
    if (value === undefined) {
        return [];
    }

    return Array.isArray(value) && value.every((path) => typeof path === "string") ? value : undefined;
}

/** Whether an MCP server's form asks the approval of a tool: Codex marks its own, and a form that asks no field is a yes or a no. */
function isApproval(params: Message): boolean
{
    const marked = isObject(params._meta) && typeof params._meta.codex_approval_kind === "string";
    const schema = isObject(params.requestedSchema) ? params.requestedSchema : undefined;
    const noFields = params.mode === "form" && schema !== undefined && (!isObject(schema.properties) || Object.keys(schema.properties).length === 0);
    return marked || noFields;
}
