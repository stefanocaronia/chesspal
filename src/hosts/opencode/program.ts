// OpenCode on this computer, as the table starts it: its own program, and the environment it runs in.
import { join } from "node:path";
import type { ToolKind } from "../chat.ts";
import { fileOnPath, type FoundProgram, npmProgram } from "../program.ts";

// The npm package of OpenCode's program, and the name its bin gives the program.
const npmPackage = "@opencode/cli";
const binName = "opencode";

// What would make OpenCode take another chat's place or configuration: the variables of an OpenCode chat the table may run in, and the folders of a shell.
const dropped = /^(OPENCODE_(SESSION_ID|CLIENT|CONFIG_CONTENT|DISABLE_PROJECT_CONFIG|SERVER_PASSWORD)|PWD|OLDPWD|INIT_CWD)$/i;

/**
 * OpenCode's own program, never a shim that needs a shell: the first found in a folder of the PATH, then in the folder its installer uses in the player's
 * home, then as npm installed its package beside a folder of the PATH.
 */
export function openCodeProgram(environment: NodeJS.ProcessEnv, platform: string, home: string): FoundProgram | undefined
{
    const found = fileOnPath(platform === "win32" ? "opencode.exe" : "opencode", environment, platform, [join(home, ".opencode", "bin")]);
    return found === undefined ? npmProgram(npmPackage, binName, environment, platform) : { command: found, args: [] };
}

/**
 * The environment of OpenCode started by the table: the table's own, which is the player's, without what belongs to another chat or shell, and without
 * Claude Code's own instructions of the player's, which OpenCode would read where it has none of its own.
 */
export function openCodeEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv
{
    return { ...Object.fromEntries(Object.entries(environment).filter(([name]) => !dropped.test(name))), OPENCODE_DISABLE_CLAUDE_CODE: "1" };
}

/**
 * The environment of the chat's OpenCode at the table: its own tools that read files denied where the kinds allowed hold no read, and any folder outside
 * the chat's always, given for this process alone beside the folder's opencode.json, so that a chat opened by hand keeps the player's.
 */
export function allowedEnvironment(environment: NodeJS.ProcessEnv, allowed: ToolKind[]): NodeJS.ProcessEnv
{
    const reading = allowed.includes("read") ? {} : Object.fromEntries(readingTools.map((tool) => [tool, "deny"]));
    return { ...environment, OPENCODE_CONFIG_CONTENT: JSON.stringify({ permission: { ...reading, external_directory: "deny" } }) };
}

// OpenCode's tools that read files, by their permission's names.
const readingTools = ["read", "glob", "grep", "list"];

/** The environment of OpenCode in a folder: it takes the folder it works in from PWD, not from where its process starts. */
export function inFolder(environment: NodeJS.ProcessEnv, folder: string): NodeJS.ProcessEnv
{
    return { ...Object.fromEntries(Object.entries(environment).filter(([name]) => name.toUpperCase() !== "PWD")), PWD: folder };
}
