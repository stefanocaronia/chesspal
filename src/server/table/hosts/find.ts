// A program found on the PATH, as a shell would find it: on Windows with the extensions of PATHEXT, which npm's shims (.cmd) and installers (.exe) use;
// a host's, also where its installer puts it.
import { existsSync, lstatSync } from "node:fs";
import { posix, win32 } from "node:path";
import { type HostName, hostPrograms } from "./hosts.ts";

/**
 * The host's program: on the PATH of `env`, else where its installer puts it, as Antigravity's, which a terminal opened before it was installed does not
 * find; none when it is not installed.
 */
export function hostProgramPath(host: HostName, platform: string, env: NodeJS.ProcessEnv, exists: (path: string) => boolean = present): string | undefined
{
    const found = programPath(hostPrograms[host], platform, env, exists);

    if (found !== undefined || host !== "antigravity") {
        return found;
    }

    const base = platform === "win32" ? env.LOCALAPPDATA : env.HOME;

    if (base === undefined || base.trim() === "") {
        return undefined;
    }

    const installed = platform === "win32" ? win32.join(base, "agy", "bin", "agy.exe") : posix.join(base, ".local", "bin", "agy");
    return exists(installed) ? installed : undefined;
}

/** The program's path on the PATH of `env`, the first found; none when it is not installed there. */
export function programPath(name: string, platform: string, env: NodeJS.ProcessEnv, exists: (path: string) => boolean = present): string | undefined
{
    const windows = platform === "win32";
    const path = windows ? win32 : posix;
    const folders = (env.PATH ?? env.Path ?? "").split(windows ? ";" : ":").filter((folder) => folder.trim() !== "");
    const extensions = windows ? (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter((extension) => extension !== "").map((extension) => extension.toLowerCase()) : [""];
    return folders.flatMap((folder) => extensions.map((extension) => path.join(folder.trim(), `${name}${extension}`))).find(exists);
}

// Windows' app execution aliases, such as wt.exe in WindowsApps, are links that stat cannot follow: existsSync calls them missing, lstat finds them.
function present(path: string): boolean
{
    try {
        return existsSync(path) || lstatSync(path, { throwIfNoEntry: false }) !== undefined;
    } catch {
        return false;
    }
}
