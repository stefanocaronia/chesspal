// A program found on the PATH, as a shell would find it: on Windows with the extensions of PATHEXT, which npm's shims (.cmd) and installers (.exe) use.
import { existsSync, lstatSync } from "node:fs";
import { posix, win32 } from "node:path";

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
