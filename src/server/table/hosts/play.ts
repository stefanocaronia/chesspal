// `chesspal play claude` (D-104): the chat the table's button opens, in the terminal the table opened for it, or one the player typed it in: the host started
// in the table's folder with the start message, and the model and effort chosen on the page for the profile in use; started again for a new game.
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { win32 } from "node:path";
import type { Context } from "../../../commands/index.ts";
import { tableFolder } from "../../../home/index.ts";
import { setUpHosts } from "../../../host-files/index.ts";
import { activeProfile, gameFolder, languageIn, profileSettings } from "../../../profiles/index.ts";
import { programPath } from "./find.ts";
import { choiceIn, hostArgs, type HostChoice, type HostName, isHostName, startMessage } from "./hosts.ts";
import { askedAgain, leaveSeat, refreshSeat, seatTimes, takeSeat } from "./seat.ts";
import { cmdQuoted } from "./terminal.ts";

/**
 * What `chesspal play` starts: the host's program, its arguments, folder and environment, whether it needs cmd, as a .cmd shim does on Windows, and the
 * model and effort it is given, which the seat notes for the page (D-107).
 */
export interface HostLaunch
{
    readonly program: string;
    readonly args: readonly string[];
    readonly folder: string;
    readonly env: NodeJS.ProcessEnv;
    readonly shell: boolean;
    readonly choice: HostChoice;
}

/**
 * Runs the host in the table's folder, in this terminal, until it ends: its exit code; started again, clean, when the table asks for a new game (D-57),
 * or for another model or host, which then takes its place (D-107). Ctrl+C is the host's: this process ignores it, or the terminal would close with the chat.
 */
export async function playHost(context: Context, host: HostName): Promise<number>
{
    const folder = tableFolder(context.home());
    takeSeat(folder, { pid: process.pid, host });
    process.on("SIGINT", () => undefined);
    // A window closed with its X ends this process without its finally: the seat goes first.
    process.on("SIGHUP", () => {
        leaveSeat(folder, process.pid);
        process.exit(129);
    });
    const terminal = savedTerminal(context.platform);
    let playing = host;
    let next = host;
    // The host before one asked in its place, until that one has started: it goes on when the other does not start.
    let before: HostName | undefined;
    let refreshed = Date.now();

    const asked = (): boolean => {
        if (Date.now() - refreshed >= seatTimes.refresh) {
            refreshed = Date.now();
            refreshSeat(folder, process.pid);
        }

        const again = askedAgain(folder, process.pid);
        next = again?.host !== undefined && isHostName(again.host) ? again.host : playing;
        return again !== undefined;
    };

    try {
        for (;;) {
            // A request left from a second click while the host before was ending is not for this one.
            askedAgain(folder, process.pid);
            const ran = await started(context, playing, asked).catch((error: unknown) => {
                if (before === undefined) {
                    throw error;
                }

                process.stderr.write(`${(error as Error).message} ${hostTitle[before]} goes on.\n`);
                return undefined;
            });

            if (ran === undefined) {
                playing = before ?? playing;
                before = undefined;
                continue;
            }

            before = undefined;

            if (!ran.again) {
                return ran.code;
            }

            if (next !== playing) {
                before = playing;
                playing = next;
            }

            terminal.restore();
            process.stdout.write(cleanScreen);
        }
    } finally {
        leaveSeat(folder, process.pid);
    }
}

/**
 * Runs the host until it ends, or until `again`, asked every half second, says to start it again: then it is ended with what it started, killed when it
 * does not end. Its exit code, and whether to start it again.
 */
export function runHost(launch: HostLaunch, again: () => boolean, platform: string = process.platform, every = 500): Promise<{ code: number; again: boolean; }>
{
    return new Promise((done, failed) => {
        const words = [launch.program, ...launch.args];
        const command = launch.shell ? [words.map(cmdQuoted).join(" ")] : words;
        const chat = spawn(command[0]!, command.slice(1), { cwd: launch.folder, env: launch.env, stdio: "inherit", shell: launch.shell });
        let ended = false;
        let killing: NodeJS.Timeout | undefined;
        const watch = setInterval(() => {
            if (!ended && again()) {
                ended = true;
                endTree(chat, platform);
                killing = setTimeout(() => chat.kill("SIGKILL"), killAfter);
            }
        }, every);

        const stop = (): void => {
            clearInterval(watch);
            clearTimeout(killing);
        };

        chat.once("error", (error) => {
            stop();
            failed(error);
        });
        chat.once("exit", (code) => {
            stop();
            done({ code: code ?? 1, again: ended || again() });
        });
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
        return { program: process.execPath, args: [script, ...args], folder, env: childEnv, shell: false, choice };
    }

    return { program: found, args, folder, env: childEnv, shell: context.platform === "win32" && /\.(cmd|bat)$/i.test(found), choice };
}

const hostTitle: Record<HostName, string> = { claude: "Claude Code", codex: "Codex" };

// Runs the host as runHost does, the seat noting the model and effort it is given; one not installed, or that could not start, fails saying so.
async function started(context: Context, host: HostName, again: () => boolean): Promise<{ code: number; again: boolean; }>
{
    const launch = hostLaunch(context, host);
    takeSeat(launch.folder, { pid: process.pid, host, ...launch.choice });
    return runHost(launch, again, context.platform).catch((error: unknown) => {
        throw new Error(`${hostTitle[host]} did not start: ${(error as Error).message}`);
    });
}

// A host that has not ended this long after it was asked is killed.
const killAfter = 3_000;

// A host ended in the middle leaves the modes it set: colours, scroll region, synchronized output, bracketed paste, focus and mouse reports, kitty's
// keyboard flags, its own screen, a hidden cursor (Priya). All off, and the screen cleared, as a new chat.
const cleanScreen = "\x1b[0m\x1b[r\x1b[?2026l\x1b[?2004l\x1b[?1004l\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l\x1b[<99u\x1b[?1049l\x1b[?25h\x1b[2J\x1b[3J\x1b[H";

// The host and what it started, its MCP server among them: on Windows its whole tree, which taskkill ends, never the console (Priya); else the host,
// which ends its own. A taskkill that failed leaves it to the kill that follows.
function endTree(chat: ChildProcess, platform: string): void
{
    if (platform !== "win32" || chat.pid === undefined) {
        chat.kill("SIGTERM");
        return;
    }

    const taskkill = win32.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "taskkill.exe");
    const ended = spawnSync(taskkill, ["/T", "/F", "/PID", String(chat.pid)], { stdio: "ignore", windowsHide: true });

    if (ended.status !== 0) {
        chat.kill();
    }
}

/**
 * The terminal's settings before the first host, which one ended in the middle leaves raw, for the next to take as its own; stty keeps them on macOS and
 * Linux, while on Windows each host sets the console's itself.
 */
function savedTerminal(platform: string): { restore(): void; }
{
    const saved = platform === "win32" || !process.stdin.isTTY ? undefined : spawnSync("stty", ["-g"], { stdio: ["inherit", "pipe", "ignore"], encoding: "utf8" });
    const settings = saved?.status === 0 ? saved.stdout.trim() : undefined;
    return {
        restore: () => {
            if (settings !== undefined) {
                spawnSync("stty", [settings], { stdio: ["inherit", "ignore", "ignore"] });
            }
        },
    };
}

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
