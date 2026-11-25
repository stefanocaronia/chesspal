// A host's own program on this computer, as the table looks for it: in the folders of the PATH, in a folder of the player's home, or as npm installed it.
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** A program as the table starts it, with no shell: the command, and the arguments before the host's own. */
export interface FoundProgram
{
    command: string;
    args: string[];
}

/** The first file of that name in a folder of the PATH, then in the folders given; undefined where none has it. */
export function fileOnPath(file: string, environment: NodeJS.ProcessEnv, platform: string, others: string[] = []): string | undefined
{
    return [...pathFolders(environment, platform), ...others].map((folder) => join(folder, file)).find(isFile);
}

/**
 * The program an npm package names in its bin, installed beside a folder of the PATH: in its node_modules, as npm does on Windows, or in ../lib/node_modules
 * elsewhere. A script runs with this node; undefined where no folder has it.
 */
export function npmProgram(packageName: string, bin: string, environment: NodeJS.ProcessEnv, platform: string): FoundProgram | undefined
{
    const roots = pathFolders(environment, platform).flatMap((folder) => [join(folder, "node_modules"), join(folder, "..", "lib", "node_modules")]);

    for (const root of roots) {
        const file = packageBin(join(root, ...packageName.split("/")), bin);

        if (file !== undefined) {
            return /\.[cm]?js$/i.test(file) ? { command: process.execPath, args: [file] } : { command: file, args: [] };
        }
    }

    return undefined;
}

/** Whether a path is a file. */
export function isFile(path: string): boolean
{
    try {
        return statSync(path).isFile();
    } catch {
        return false;
    }
}

/** The folders of the PATH, whatever the case of its name, as Windows writes Path. */
function pathFolders(environment: NodeJS.ProcessEnv, platform: string): string[]
{
    const path = Object.entries(environment).find(([key]) => key.toUpperCase() === "PATH")?.[1] ?? "";
    return path.split(platform === "win32" ? ";" : ":").filter((folder) => folder.trim() !== "");
}

/** The file a package's bin names for a program, where the package and the file are there. */
function packageBin(packageFolder: string, bin: string): string | undefined
{
    try {
        const named = (JSON.parse(readFileSync(join(packageFolder, "package.json"), "utf8")) as { bin?: unknown; }).bin;
        const relative = typeof named === "string" ? named : typeof named === "object" && named !== null ? (named as Record<string, unknown>)[bin] : undefined;
        const file = typeof relative === "string" ? join(packageFolder, relative) : undefined;
        return file !== undefined && isFile(file) ? file : undefined;
    } catch {
        return undefined;
    }
}
