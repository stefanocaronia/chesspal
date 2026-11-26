// What whoever opens a chat gives it instead of the folder's files, written in the chat's folder for Claude Code: its MCP server and its instructions.
import { chmodSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ChatOptions, ChatServer } from "../chat.ts";

/** The server's name when the chat is given none: the one the folder's .mcp.json names. */
export const folderServer = "chesspal";

// A server's name as Claude Code keeps it whole in its tools' names: anything else it would change, and the table would not know its tools.
const serverName = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * The arguments of the chat's MCP servers and instructions, their files written first: the server given alone, from mcp.json, which holds its secret,
 * else the folder's .mcp.json; the instructions given in place of Claude Code's own.
 */
export function givenArguments(options: ChatOptions): string[]
{
    const server = options.server === undefined ? join(options.folder, ".mcp.json") : writeServer(options.folder, options.server);
    const instructions = options.instructions === undefined ? [] : ["--system-prompt-file", writeInstructions(options.folder, options.instructions)];
    return ["--mcp-config", server, ...instructions];
}

/** The name of the server whose tools are the table's commands: the one given, else the folder's. */
export function serverOf(options: ChatOptions): string
{
    const name = options.server?.name ?? folderServer;

    if (!serverName.test(name)) {
        throw new Error(`${JSON.stringify(name.slice(0, 100))} is no name of an MCP server: letters, digits, _ and - only, up to 64.`);
    }

    return name;
}

/** Writes the server's configuration, whole and readable by the player alone where the system has modes; its path. */
function writeServer(folder: string, server: ChatServer): string
{
    const path = join(folder, "mcp.json");
    const configuration = { mcpServers: { [server.name]: { command: server.command, args: server.args, env: server.environment } } };

    // A file already there keeps its mode when written again: it loses the others' rights before it holds the secret.
    if (existsSync(path)) {
        chmodSync(path, 0o600);
    }

    writeFileSync(path, `${JSON.stringify(configuration, undefined, 2)}\n`, { mode: 0o600 });
    return path;
}

function writeInstructions(folder: string, instructions: string): string
{
    const path = join(folder, "instructions.md");
    writeFileSync(path, instructions);
    return path;
}
