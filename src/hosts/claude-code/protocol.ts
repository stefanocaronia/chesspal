// What the table writes to Claude Code, and the kinds of its tools.
import type { ToolKind } from "../chat.ts";
import type { Message } from "../lines.ts";

/** The host's built-in tools the table may give the AI, by kind; `--tools` lists those whose kind is allowed. */
export const builtInTools: { name: string; kind: ToolKind; }[] = [
    { name: "Read", kind: "read" },
    { name: "Glob", kind: "read" },
    { name: "Grep", kind: "read" },
    { name: "WebSearch", kind: "web" },
    { name: "WebFetch", kind: "fetch" },
    { name: "Task", kind: "agent" },
    { name: "Bash", kind: "shell" },
    { name: "PowerShell", kind: "shell" },
    { name: "Write", kind: "write" },
    { name: "Edit", kind: "write" },
    { name: "NotebookEdit", kind: "write" },
];

/** The host's tools that only load the others, which it runs without asking: never a reason to stop a turn. */
export const toolLoaders = ["ToolSearch"];

// The subagent tool by its names old and new.
const agentTools = ["Task", "Agent"];

/**
 * A tool's name for the table and its kind: a command of the chesspal server, or of the server given by that name, by its own name; any subagent is of kind
 * agent.
 */
export function toolOf(name: string, input: unknown, server = "chesspal"): { name: string; kind: ToolKind; }
{
    const chesspalPrefix = `mcp__${server}__`;

    if (name.startsWith(chesspalPrefix) && name.length > chesspalPrefix.length) {
        return { name: name.slice(chesspalPrefix.length), kind: "chesspal" };
    }

    if (agentTools.includes(name)) {
        return { name, kind: "agent" };
    }

    return { name, kind: builtInTools.find((tool) => tool.name === name)?.kind ?? "other" };
}

export function userMessage(text: string): Message
{
    return { type: "user", message: { role: "user", content: [{ type: "text", text }] } };
}

export function controlRequest(id: string, request: Message): Message
{
    return { type: "control_request", request_id: id, request };
}

export function controlAnswer(id: unknown, response: Message): Message
{
    return { type: "control_response", response: { subtype: "success", request_id: id, response } };
}

export function controlError(id: unknown, error: string): Message
{
    return { type: "control_response", response: { subtype: "error", request_id: id, error } };
}
