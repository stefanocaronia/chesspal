// Codex's tools as the table reads them: the items of a thread and the approvals it asks, each a tool with its kind, and the answer to each approval.
import type { ToolKind } from "../chat.ts";
import { isObject, type Message } from "./protocol.ts";

/** A tool for the table: its name, its kind, the MCP server it belongs to, and the paths it reads where it is of kind read. */
export interface CodexTool
{
    name: string;
    kind: ToolKind;
    server?: string;
    paths: unknown[];
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
        case "dynamicToolCall":
        case "collabAgentToolCall":
        case "imageGeneration":
            return { name: String(item.type), kind: "other", paths: [] };
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

/** The answer to a request of approval, yes or no, in the shape its method takes. */
export function approvalAnswer(method: string, params: Message, allowed: boolean, refusal: string): Message
{
    switch (method) {
        case "execCommandApproval":
        case "applyPatchApproval":
            return { decision: allowed ? "approved" : { denied: { rejection: refusal } } };
        case "item/permissions/requestApproval":
            return { permissions: allowed && isObject(params.permissions) ? params.permissions : {}, scope: "turn" };
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

/** More permissions asked for a command: the network is fetching, writing is writing, reading alone is a read of the paths asked. */
function permissionsTool(permissions: unknown): CodexTool
{
    const asked = isObject(permissions) ? permissions : {};
    const files = isObject(asked.fileSystem) ? asked.fileSystem : {};
    const listed = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

    if (isObject(asked.network) && asked.network.enabled === true) {
        return { name: "permissions", kind: "fetch", paths: [] };
    }

    // Entries say neither reading nor writing in a shape the table knows: they are of another kind.
    if (listed(files.write).length > 0 || listed(files.entries).length > 0) {
        return { name: "permissions", kind: listed(files.write).length > 0 ? "write" : "other", paths: [] };
    }

    return { name: "permissions", kind: "read", paths: listed(files.read) };
}

/** Whether an MCP server's form asks the approval of a tool: Codex marks its own, and a form that asks no field is a yes or a no. */
function isApproval(params: Message): boolean
{
    const marked = isObject(params._meta) && typeof params._meta.codex_approval_kind === "string";
    const schema = isObject(params.requestedSchema) ? params.requestedSchema : undefined;
    const noFields = params.mode === "form" && schema !== undefined && (!isObject(schema.properties) || Object.keys(schema.properties).length === 0);
    return marked || noFields;
}
