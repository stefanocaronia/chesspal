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
 * The environment of the chat's OpenCode at the table: its own tools denied where the kinds allowed do not hold theirs, since it runs them without asking,
 * and any folder outside the chat's always, given for this process alone beside the folder's opencode.json, so that a chat opened by hand keeps the player's; added to the
 * configuration the environment gives already, as the model chosen.
 */
export function allowedEnvironment(environment: NodeJS.ProcessEnv, allowed: ToolKind[]): NodeJS.ProcessEnv
{
    const denied = Object.fromEntries(Object.entries(permissionKinds).filter(([, kind]) => !allowed.includes(kind)).map(([tool]) => [tool, "deny"]));
    return { ...environment, OPENCODE_CONFIG_CONTENT: JSON.stringify({ ...givenConfig(environment), permission: { ...denied, external_directory: "deny" } }) };
}

/** The configuration the environment gives OpenCode already: none where it gives none, or no object. */
function givenConfig(environment: NodeJS.ProcessEnv): Record<string, unknown>
{
    try {
        const given = JSON.parse(environment.OPENCODE_CONFIG_CONTENT ?? "{}") as unknown;
        return typeof given === "object" && given !== null && !Array.isArray(given) ? given as Record<string, unknown> : {};
    } catch {
        return {};
    }
}

// OpenCode's own tools by their permission's names, and the kind of each.
const permissionKinds: Record<string, ToolKind> = {
    read: "read",
    glob: "read",
    grep: "read",
    list: "read",
    bash: "shell",
    edit: "write",
    webfetch: "fetch",
    websearch: "web",
    codesearch: "web",
    task: "agent",
    lsp: "read",
    skill: "other",
    todowrite: "other",
    todoread: "other",
    question: "other",
};

/** The environment of OpenCode in a folder: it takes the folder it works in from PWD, not from where its process starts. */
export function inFolder(environment: NodeJS.ProcessEnv, folder: string): NodeJS.ProcessEnv
{
    return { ...Object.fromEntries(Object.entries(environment).filter(([name]) => name.toUpperCase() !== "PWD")), PWD: folder };
}
