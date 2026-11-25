// Claude Code on this computer, as the table starts it: its own program where it was installed by itself, and the environment it runs in.
import { join } from "node:path";
import { fileOnPath } from "../program.ts";

/** The arguments that make the program speak stream-json by lines, without a terminal. */
export const streamArguments = ["-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose"];

/** The arguments that keep the program to the folder's own settings, with no MCP server but those given. */
export const settingArguments = ["--setting-sources", "project,local", "--strict-mcp-config"];

/** Claude Code's own program: the first found in a folder of the PATH, then in its own folder of the player's home; never a shim that needs a shell. */
export function claudeProgram(environment: NodeJS.ProcessEnv, platform: string, home: string): { command: string; args: string[]; } | undefined
{
    const found = fileOnPath(platform === "win32" ? "claude.exe" : "claude", environment, platform, [join(home, ".local", "bin")]);
    return found === undefined ? undefined : { command: found, args: [] };
}

/**
 * The environment of Claude Code started by the table: the table's own, which is the player's and holds what they set for Claude Code. Only a table started
 * from inside a Claude Code session loses that session's variables, Anthropic's and an MCP server's, which are the session's own, but for where the settings are.
 */
export function claudeEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv
{
    const inSession = Object.keys(environment).some((name) => name.toUpperCase() === "CLAUDECODE");

    if (!inSession) {
        return { ...environment };
    }

    const dropped = (name: string): boolean => {
        const upper = name.toUpperCase();
        return (upper.startsWith("CLAUDE") && upper !== "CLAUDE_CONFIG_DIR") || upper.startsWith("MCP_") || upper.startsWith("ANTHROPIC_");
    };

    return Object.fromEntries(Object.entries(environment).filter(([name]) => !dropped(name)));
}
