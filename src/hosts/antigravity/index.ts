// The chat in Antigravity: its program started with no terminal as `agy acp`, spoken to by the Agent Client Protocol, in the chat's folder. The
// chesspal server comes from the player's own .gemini/config/mcp_config.json, which `chesspal init` writes, or, given by who opens the chat, with the
// session.
import { homedir } from "node:os";
import { join } from "node:path";
import { type AcpHost, acpModels, kindOfCall, openAcp, pathsOfCall } from "../acp/index.ts";
import type { HostDriver, ToolKind } from "../chat.ts";
import { hosts } from "../names.ts";
import { fileOnPath, type FoundProgram, isFile } from "../program.ts";

// What belongs to another chat or shell, never to the AI's: the folders of a shell. Chesspal's own variables stay, as CHESSPAL_HOME, which the chat needs.
const dropped = /^(PWD|OLDPWD|INIT_CWD)$/i;

// A tool of the chesspal server, by the names a host gives one: mcp__chesspal__status, chesspal.status, chesspal_status, chesspal/status, or the title
// "chesspal: status"; and as Antigravity names the tools of a server given with the session, mcp_chesspal_status, with a suffix after the server's name
// where its process has several sessions, mcp_chesspal_db2ed3c2_status, as agy 1.5.17 was seen to. The server's name holds no sign a pattern reads.
function chesspalTool(server: string): RegExp
{
    return new RegExp(`^(?:(?:mcp__)?${server}(?:__|[._/]|:\\s*)|mcp_${server}_(?:[0-9a-f]{8}_)?)([a-z][\\w-]*)$`, "i");
}

// The protocol's kinds that change something on the computer: what such a call is named or titled never makes it a command of chesspal.
const actingKinds = ["execute", "edit", "delete", "move"];

// Antigravity's own tools, by the names the table saw it give; write_to_file is from its other modes, and of a kind never allowed. Any other is read by the
// protocol's kind. An MCP tool, a reading and the subagents are read from their input, by the name Antigravity gives, never by a title.
// read_url_content, a page of the web read, is so named by its fields, never seen in a recorded turn: to be confirmed.
const builtInKinds: Record<string, ToolKind> = { run_command: "shell", write_file: "write", write_to_file: "write", read_url_content: "fetch" };
const inputTools = ["call_mcp_tool", "invoke_subagent", "manage_subagents", "manage_task", "schedule", "read_file"];

// What the AI may do with the subagents it started; any subagent it starts is of kind agent, whatever its name.
const agentActions = ["list", "kill"];
// How the AI waits for a subagent it started, as agy 1.5.17 was seen to: a timer that wakes it once, its fields those alone (one that repeats would
// spend the player's quota by itself); and a look at a subagent's task, by the actions seen, which change nothing.
const timerFields = ["DurationSeconds", "Prompt"];
const taskActions = ["status"];

// The description of a tool of the chesspal server, which Antigravity keeps in its own folder and reads before it calls one.
function chesspalDescription(server: string): RegExp
{
    return new RegExp(`[\\\\/]antigravity-cli[\\\\/]mcp[\\\\/]${server}(?:_[0-9a-f]{8})?[\\\\/][\\w-]+\\.(?:json|md)$`, "i");
}

/** Antigravity as the protocol's client reads it: a tool by its own name where the table knows it, else by the protocol's kind; a command of chesspal by its name. */
export const antigravityAcp: AcpHost = {
    name: hosts.antigravity.name,
    args: ["acp"],
    toolOf: (call, session, server) => toolOf(call, session, server),
    pathsOf: pathsOfCall,
    innerTools: () => [],
    login: "open Antigravity on this computer and sign in there, then try again",
    // Its own error for a player not signed in was never seen: words that say so are taken as it until it is.
    signInWords: /authenticat/i,
};

/** Antigravity as the table drives it: the model a new chat proposes is the first Antigravity lists. */
export const antigravity: HostDriver = {
    open: (options) => openAcp(options, antigravityAcp),
    missing: () =>
        isFile(join(homedir(), ".gemini", "config", "mcp_config.json"))
            ? undefined
            : "Your home has no .gemini/config/mcp_config.json, which tells Antigravity how to start Chesspal's server: run `chesspal init` in this folder, then try again.",
    program: antigravityProgram,
    environment: (environment) => Object.fromEntries(Object.entries(environment).filter(([name]) => !dropped.test(name))),
    models: (options) => acpModels(options, antigravityAcp),
    model: "",
    efforts: [],
    effortsOnceChosen: true,
};

/** Antigravity's own program, never a shim that needs a shell: the first found in a folder of the PATH, then where its installer puts it in the player's home. */
function antigravityProgram(environment: NodeJS.ProcessEnv, platform: string, home: string): FoundProgram | undefined
{
    const installed = platform === "win32" ? join(home, "AppData", "Local", "agy", "bin") : join(home, ".local", "bin");
    const found = fileOnPath(platform === "win32" ? "agy.exe" : "agy", environment, platform, [installed]);
    return found === undefined ? undefined : { command: found, args: [] };
}

/**
 * A call's name for the table and its kind: a tool of Antigravity's read from its input, by the name it gives; else a call that changes something by
 * the protocol's kind, whatever its name or title; then a tool of Antigravity's own by its name; then a command of the chesspal server by its own name,
 * whether the host names it or titles it so.
 */
function toolOf(call: Record<string, unknown>, session: string | undefined, server: string): { name: string; kind: ToolKind; }
{
    const names = [call.name, call.title].filter((one) => typeof one === "string") as string[];
    const first = names[0] ?? "";

    if (typeof call.name === "string" && inputTools.includes(call.name)) {
        return toolOfInput(call.name, call, session, server);
    }

    if (typeof call.kind === "string" && actingKinds.includes(call.kind)) {
        return { name: first, kind: kindOfCall(call) };
    }

    const own = names.find((name) => Object.hasOwn(builtInKinds, name));

    if (own !== undefined) {
        return { name: own, kind: builtInKinds[own] ?? "other" };
    }

    for (const name of names) {
        const command = chesspalTool(server).exec(name.trim())?.[1];

        if (command !== undefined) {
            return { name: command, kind: "chesspal" };
        }
    }

    return { name: first, kind: kindOfCall(call) };
}

/**
 * A call of Antigravity's own read from its input, by the fields agy 1.5.17 gives: a tool of the chesspal server is chesspal's, any other server's of kind
 * other; reading a tool's description, or what a tool of this chat answered, which Antigravity keeps in its own folder, is chesspal's; any subagent,
 * listing or stopping them, a timer that wakes the AI once and a look at a subagent's task, are the agent's. Where its input names them otherwise, the
 * call is of kind other, never allowed.
 */
function toolOfInput(name: string, call: Record<string, unknown>, session: string | undefined, server: string): { name: string; kind: ToolKind; }
{
    const input = typeof call.rawInput === "object" && call.rawInput !== null ? call.rawInput as Record<string, unknown> : {};

    if (name === "call_mcp_tool") {
        return input.ServerName === server ? { name: typeof input.ToolName === "string" ? input.ToolName : name, kind: "chesspal" } : { name, kind: "other" };
    }

    if (name === "read_file") {
        const own = typeof input.Path === "string" && (chesspalDescription(server).test(input.Path) || isAnswerOf(input.Path, session));
        return { name, kind: own ? "chesspal" : "read" };
    }

    if (name === "invoke_subagent") {
        return { name, kind: "agent" };
    }

    if (name === "schedule") {
        const once = Object.keys(input).every((field) => timerFields.includes(field)) && typeof input.DurationSeconds === "number" && typeof input.Prompt === "string";
        return { name, kind: once ? "agent" : "other" };
    }

    const actions = name === "manage_task" ? taskActions : agentActions;
    return { name, kind: typeof input.Action === "string" && actions.includes(input.Action) ? "agent" : "other" };
}

/** Whether a path is where Antigravity keeps what a tool of the chat's session answered: .gemini/antigravity-cli/brain/<session>/.system_generated/steps/<n>/output.txt. */
function isAnswerOf(path: string, session: string | undefined): boolean
{
    const parts = path.split(/[\\/]/);
    const at = parts.length - 8;
    const expected = [".gemini", "antigravity-cli", "brain", session, ".system_generated", "steps"];
    return session !== undefined && at >= 0 && expected.every((part, index) => parts[at + index] === part) && /^\d+$/.test(parts[at + 6] ?? "") && parts[at + 7] === "output.txt";
}
