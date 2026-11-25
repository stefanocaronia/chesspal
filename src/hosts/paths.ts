// The paths a tool that reads asks for, held to the chat's folder: the AI reads its folder, nothing else on the player's computer.
import { isAbsolute, resolve, sep } from "node:path";

/** Whether a path, a relative one from the folder, is the folder or within it; on Windows whatever the case of its letters. A path from the home (~) never is. */
export function inside(path: string, folder: string): boolean
{
    if (path.startsWith("~")) {
        return false;
    }

    const fold = (text: string): string => (process.platform === "win32" ? text.toLowerCase() : text);
    const base = fold(resolve(folder));
    const target = fold(resolve(base, path));
    return target === base || target.startsWith(base.endsWith(sep) ? base : `${base}${sep}`);
}

/** Whether a pattern of files stays in the path it is read from: neither absolute nor climbing out of it. */
export function staysInside(pattern: unknown): boolean
{
    return typeof pattern === "string" && !isAbsolute(pattern) && !/^([a-zA-Z]:|[\\/~])/.test(pattern) && !pattern.split(/[\\/]/).includes("..");
}
