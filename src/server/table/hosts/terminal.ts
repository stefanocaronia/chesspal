// A terminal window the table opens for a chat (D-104), in a folder, running a command: Windows Terminal, else the console Windows starts; macOS's Terminal;
// on Linux the terminal the desktop names, else a common one.
import { spawn } from "node:child_process";
import { programPath } from "./find.ts";

/** Opens a terminal window in `folder` running `command`, apart from the table, which it outlives: whether a terminal started. */
export async function openTerminal(folder: string, command: readonly string[], platform: string, env: NodeJS.ProcessEnv = process.env): Promise<boolean>
{
    for (const [program, ...args] of terminals(folder, command, platform, env)) {
        if (program !== undefined && await started(program, args, folder)) {
            return true;
        }
    }

    return false;
}

/** The terminals to try, in order, each as the program and its arguments; those not installed are left out. */
export function terminals(folder: string, command: readonly string[], platform: string, env: NodeJS.ProcessEnv, exists?: (path: string) => boolean): string[][]
{
    const installed = (name: string): string | undefined => programPath(name, platform, env, exists);

    if (platform === "win32") {
        const windowsTerminal = installed("wt");
        // start takes its first quoted word as the window's title, an empty one; cmd gets its line verbatim, each word quoted where it holds & or a space.
        const windowsConsole = ["cmd.exe", "/d", "/s", "/c", `"start "" /D ${[folder, ...command].map(cmdQuoted).join(" ")}"`];
        // wt splits its command line at every ;, and reads \; as one.
        const wtWords = [folder, ...command].map((word) => word.replaceAll(";", "\\;"));
        return windowsTerminal === undefined ? [windowsConsole] : [[windowsTerminal, "-w", "new", "-d", wtWords[0]!, "--title", "Chesspal", ...wtWords.slice(1)], windowsConsole];
    }

    if (platform === "darwin") {
        const script = `cd ${shellQuoted(folder)} && exec ${command.map(shellQuoted).join(" ")}`;
        return [["osascript", "-e", `tell application "Terminal" to do script "${appleQuoted(script)}"`, "-e", `tell application "Terminal" to activate`]];
    }

    const linux = [
        ["x-terminal-emulator", "-e", ...command],
        ["gnome-terminal", `--working-directory=${folder}`, "--", ...command],
        ["konsole", "--workdir", folder, "-e", ...command],
        ["xfce4-terminal", `--working-directory=${folder}`, "-x", ...command],
        ["xterm", "-e", ...command],
    ];
    return linux.flatMap(([name, ...args]) => {
        const path = installed(name ?? "");
        return path === undefined ? [] : [[path, ...args]];
    });
}

/** A word for cmd.exe's line, in double quotes when it holds a space or & | < > ^ ( ); cmd reads % and ! even inside them, which our words never hold. */
export function cmdQuoted(word: string): string
{
    return /[\s&|<>^()!%]/.test(word) ? `"${word}"` : word;
}

// A program started apart from the table: whether it started. cmd's line is quoted already.
function started(program: string, args: string[], folder: string): Promise<boolean>
{
    return new Promise((done) => {
        const opened = spawn(program, args, { cwd: folder, detached: true, stdio: "ignore", windowsVerbatimArguments: program === "cmd.exe" });
        opened.once("spawn", () => {
            opened.unref();
            done(true);
        });
        opened.once("error", () => done(false));
    });
}

// A word for the shell, in single quotes, a quote in it closed and escaped.
function shellQuoted(word: string): string
{
    return `'${word.replaceAll("'", "'\\''")}'`;
}

// Text inside an AppleScript string.
function appleQuoted(text: string): string
{
    return text.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}
