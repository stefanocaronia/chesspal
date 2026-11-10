// The player's data folder (D-71): Documents\My Games\Chesspal on Windows, wherever the system keeps Documents, OneDrive too; Documents/Chesspal
// elsewhere, where Linux's XDG user dirs put Documents; CHESSPAL_HOME in its place, for the tests and the playtests.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, posix, win32 } from "node:path";

/** What the data folder is found from: the environment, the system, the user's own folder, and where the system says Documents is. */
export interface System
{
    readonly env: Readonly<Record<string, string | undefined>>;
    readonly platform: string;
    readonly home: string;
    /** What `reg query` prints of Documents' place, or undefined when it cannot run. */
    readonly registry: () => string | undefined;
    /** A file's text, or undefined when it cannot be read: the XDG user dirs on Linux. */
    readonly readText: (path: string) => string | undefined;
}

/** The player's data folder: CHESSPAL_HOME when set, else the system's Documents with Chesspal's folder in it. */
export function dataFolder(system: System = thisSystem()): string
{
    const chosen = system.env.CHESSPAL_HOME?.trim();
    const path = system.platform === "win32" ? win32 : posix;

    if (chosen !== undefined && chosen !== "") {
        return path.resolve(chosen);
    }

    if (system.platform === "win32") {
        return win32.join(windowsDocuments(system), "My Games", "Chesspal");
    }

    return posix.join(system.platform === "darwin" ? posix.join(system.home, "Documents") : xdgDocuments(system), "Chesspal");
}

/** The table's folder inside the data folder: one for every profile, where the chats the table opens start (D-104). */
export function tableFolder(home: string): string
{
    return join(home, "table");
}

// Where Windows keeps Documents for this user, as Explorer's known folder does: the registry names it, with variables such as %USERPROFILE%.
const shellFolders = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders";

function thisSystem(): System
{
    return { env: process.env, platform: process.platform, home: homedir(), registry: readRegistry, readText };
}

function readText(path: string): string | undefined
{
    try {
        return readFileSync(path, "utf8");
    } catch {
        return undefined;
    }
}

/** Documents as the XDG user dirs name it, in the system's language, such as ~/Documenti, as GLib reads them; ~/Documents when they say nothing usable. */
function xdgDocuments({ env, home, readText }: System): string
{
    const config = env.XDG_CONFIG_HOME?.startsWith("/") === true ? env.XDG_CONFIG_HOME : posix.join(home, ".config");
    const named = /^\s*XDG_DOCUMENTS_DIR\s*=\s*"([^"]*)"/m.exec(readText(posix.join(config, "user-dirs.dirs")) ?? "")?.[1];
    const filled = named?.replace(/^\$HOME(?=\/|$)/, home);
    return filled !== undefined && posix.isAbsolute(filled) ? posix.normalize(filled) : posix.join(home, "Documents");
}

// About 40 ms, once a process: PowerShell would say the same in 270. reg writes in the console's code page, which breaks a folder with accents: UTF-8 first.
function readRegistry(): string | undefined
{
    const command = `"chcp 65001 >nul & reg query "${shellFolders}" /v Personal"`;
    const answer = spawnSync("cmd.exe", ["/d", "/s", "/c", command], { encoding: "utf8", windowsHide: true, windowsVerbatimArguments: true, timeout: 5_000 });
    return answer.status === 0 ? answer.stdout : undefined;
}

/** Documents as the registry names it, with its variables filled in; the user's own Documents when the registry says nothing usable. */
function windowsDocuments({ env, home, registry }: System): string
{
    const named = /^\s*Personal\s+REG_(?:EXPAND_)?SZ\s+(.+?)\s*$/m.exec(registry() ?? "")?.[1];
    const filled = named?.replace(/%([^%]+)%/g, (whole, name: string) => valueOf(env, name) ?? whole);
    return filled !== undefined && win32.isAbsolute(filled) && !/[%�]/.test(filled) ? filled : win32.join(valueOf(env, "USERPROFILE") ?? home, "Documents");
}

// Windows's variables, whatever their case.
function valueOf(env: System["env"], name: string): string | undefined
{
    const key = Object.keys(env).find((one) => one.toLowerCase() === name.toLowerCase());
    return key === undefined ? undefined : env[key];
}
