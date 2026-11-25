// The chat in Antigravity: its program started with no terminal as `agy acp`, spoken to by the Agent Client Protocol, in the chat's folder. The
// chesspal server comes from the player's own .gemini/config/mcp_config.json, which `chesspal init` writes: the table passes none of its own.
import { homedir } from "node:os";
import { join } from "node:path";
import { type AcpHost, acpModels, kindOfCall, openAcp, pathsOfCall } from "../acp/index.ts";
import type { HostDriver, ToolKind } from "../chat.ts";
import { fileOnPath, type FoundProgram, isFile } from "../program.ts";

// What belongs to another chat or shell, never to the AI's: the folders of a shell. Chesspal's own variables stay, as CHESSPAL_HOME, which the chat needs.
const dropped = /^(PWD|OLDPWD|INIT_CWD)$/i;

// A tool of the chesspal server, by the names a host gives one: mcp__chesspal__status, chesspal.status, chesspal_status, chesspal/status, or the title "chesspal: status".
const chesspalTool = /^(?:mcp__)?chesspal(?:__|[._/]|:\s*)([a-z][\w-]*)$/i;

/** Antigravity as the protocol's client reads it: its own names of tools are not known, so a tool is read by the protocol's kinds, a command of chesspal by its name. */
export const antigravityAcp: AcpHost = {
    args: ["acp"],
    toolOf: (call) => toolOf(call),
    pathsOf: pathsOfCall,
    innerTools: () => [],
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
};

/** Antigravity's own program, never a shim that needs a shell: the first found in a folder of the PATH, then where its installer puts it in the player's home. */
function antigravityProgram(environment: NodeJS.ProcessEnv, platform: string, home: string): FoundProgram | undefined
{
    const installed = platform === "win32" ? join(home, "AppData", "Local", "agy", "bin") : join(home, ".local", "bin");
    const found = fileOnPath(platform === "win32" ? "agy.exe" : "agy", environment, platform, [installed]);
    return found === undefined ? undefined : { command: found, args: [] };
}

/** A call's name for the table and its kind: a command of the chesspal server by its own name, whether the host names it or titles it so. */
function toolOf(call: Record<string, unknown>): { name: string; kind: ToolKind; }
{
    const names = [call.name, call.title].filter((one) => typeof one === "string") as string[];

    for (const name of names) {
        const command = chesspalTool.exec(name.trim())?.[1];

        if (command !== undefined) {
            return { name: command, kind: "chesspal" };
        }
    }

    return { name: names[0] ?? "", kind: kindOfCall(call) };
}
