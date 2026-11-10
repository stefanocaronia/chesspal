// `chesspal play claude` (D-104): the chat the table's button opens, in the terminal the table opened for it, or one the player typed it in: the host started
// in the table's folder with the start message, and the model and effort chosen on the page for the profile in use.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { win32 } from "node:path";
import type { Context } from "../../../commands/index.ts";
import { tableFolder } from "../../../home/index.ts";
import { setUpHosts } from "../../../host-files/index.ts";
import { activeProfile, gameFolder, languageIn, profileSettings } from "../../../profiles/index.ts";
import { programPath } from "./find.ts";
import { choiceIn, hostArgs, type HostName, startMessage } from "./hosts.ts";
import { cmdQuoted } from "./terminal.ts";

/** What `chesspal play` starts: the host's program, its arguments, folder and environment, and whether it needs cmd, as a .cmd shim does on Windows. */
export interface HostLaunch
{
    readonly program: string;
    readonly args: readonly string[];
    readonly folder: string;
    readonly env: NodeJS.ProcessEnv;
    readonly shell: boolean;
}

/**
 * Runs the host in the table's folder, set up as init does, in this terminal, until it ends: its exit code. Ctrl+C is the host's, which stops its turn
 * with it: this process ignores it, or the terminal would close with the chat. It throws when the host is not installed.
 */
export async function playHost(context: Context, host: HostName): Promise<number>
{
    const launch = hostLaunch(context, host);
    process.on("SIGINT", () => undefined);

    return new Promise((done, failed) => {
        const words = [launch.program, ...launch.args];
        const command = launch.shell ? [words.map(cmdQuoted).join(" ")] : words;
        const chat = spawn(command[0]!, command.slice(1), { cwd: launch.folder, env: launch.env, stdio: "inherit", shell: launch.shell });
        chat.once("error", (error) => failed(new Error(`${hostTitle[host]} did not start: ${error.message}`)));
        chat.once("exit", (code) => done(code ?? 1));
    });
}

/** How the host starts for the profile in use: found on the PATH, with its choice; it throws, saying how to install it, when it is not there. */
export function hostLaunch(context: Context, host: HostName, env: NodeJS.ProcessEnv = process.env, exists?: (path: string) => boolean): HostLaunch
{
    const home = context.home();
    const folder = tableFolder(home);
    const found = programPath(host, context.platform, env, exists);

    if (found === undefined) {
        throw new Error(`${hostTitle[host]} is not installed on this computer, or not on its PATH: install it (${installHint[host]}), then try again.`);
    }

    setUpHosts(folder, context.platform);
    const choice = choiceIn(profileSettings(home, activeProfile(home).id), host);
    const args = hostArgs(host, startMessage(languageIn(gameFolder(home), context.language)), choice);
    // An effort the player set for every chat would win over the one chosen on the page: spawn leaves out a variable that is undefined.
    const effort = host === "claude" && choice.effort !== undefined ? { CLAUDE_CODE_EFFORT_LEVEL: undefined } : {};
    const childEnv = { ...env, ...Object.fromEntries(sessionMarks.map((name) => [name, undefined])), ...effort };
    const script = npmScript(host, found, context.platform, exists ?? existsSync);

    if (script !== undefined) {
        return { program: process.execPath, args: [script, ...args], folder, env: childEnv, shell: false };
    }

    return { program: found, args, folder, env: childEnv, shell: context.platform === "win32" && /\.(cmd|bat)$/i.test(found) };
}

const hostTitle: Record<HostName, string> = { claude: "Claude Code", codex: "Codex" };

// What marks a chat's own session, which a table started from inside a chat would hand down, and the host take for its own (Priya).
const sessionMarks = ["CLAUDECODE", "CLAUDE_CODE_SESSION_ID", "CLAUDE_CODE_CHILD_SESSION", "CLAUDE_CODE_SESSION_ATTENDED", "CLAUDE_PID", "CLAUDE_EFFORT", "AI_AGENT", "TRACEPARENT"];
const installHint: Record<HostName, string> = { claude: "https://claude.com/claude-code", codex: "npm install -g @openai/codex" };

/**
 * The script behind npm's Windows shim of Codex, which Node runs as the shim would, without cmd and its quoting of the start message (Priya); none for
 * another program, or when it is not beside the shim.
 */
function npmScript(host: HostName, program: string, platform: string, exists: (path: string) => boolean): string | undefined
{
    if (host !== "codex" || platform !== "win32" || !/\.cmd$/i.test(program)) {
        return undefined;
    }

    const script = win32.join(win32.dirname(program), "node_modules", "@openai", "codex", "bin", "codex.js");
    return exists(script) ? script : undefined;
}
