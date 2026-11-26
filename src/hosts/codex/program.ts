// Codex on this computer, as the table starts it: its own program, the arguments of its app-server, and the environment it runs in.
import { fileOnPath, type FoundProgram, npmProgram } from "../program.ts";

// The npm package of Codex's program, and the name its bin gives the program.
const npmPackage = "@openai/codex";
const binName = "codex";

// What Codex sets in the commands it runs: a Codex started from one of them would take that thread's place and sandbox.
const dropped = /^CODEX_(THREAD_ID|SANDBOX|SANDBOX_NETWORK_DISABLED)$/i;

/** The arguments that ask for the models alone: the app-server on stdio, with no check for updates. */
export const modelArguments = ["app-server", "-c", "check_for_update_on_startup=false"];

/** Codex's own program, never a shim that needs a shell: the first found in a folder of the PATH, then as npm installed its package beside one. */
export function codexProgram(environment: NodeJS.ProcessEnv, platform: string): FoundProgram | undefined
{
    const found = fileOnPath(platform === "win32" ? "codex.exe" : "codex", environment, platform);
    return found === undefined ? npmProgram(npmPackage, binName, environment, platform) : { command: found, args: [] };
}

/**
 * The program's arguments after its own for a chat: the app-server on stdio, and the chat's folder trusted for this process alone, so that Codex reads
 * the folder's .codex/config.toml, which starts the chesspal server. A key of -c is cut at its dots: a folder with a dot is named in the value instead, as a
 * table of projects holding this folder alone, which for this process takes the place of the player's. The player's apps and plugins stay out of the chat.
 */
export function serverArguments(folder: string): string[]
{
    // A string of JSON is one of TOML too: its escapes are TOML's.
    const trust = folder.includes(".") ? `projects={${JSON.stringify(folder)}={trust_level="trusted"}}` : `projects.${folder}.trust_level="trusted"`;
    return ["app-server", "-c", trust, "-c", "check_for_update_on_startup=false", "-c", "features.apps=false", "-c", "features.plugins=false"];
}

/** The environment of Codex started by the table: the table's own, which is the player's, without what belongs to a Codex thread it may run in. */
export function codexEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv
{
    return Object.fromEntries(Object.entries(environment).filter(([name]) => !dropped.test(name)));
}
