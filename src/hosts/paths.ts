// The paths a tool that reads asks for, held to the chat's folder: the AI reads its folder, nothing else on the player's computer.
import { isAbsolute, posix, win32 } from "node:path";

/**
 * Whether a path, a relative one from the folder, is the folder or within it; on Windows whatever the case of its letters. A path from the home (~) never
 * is, nor, off Windows, one written the Windows way, with a drive or a backslash.
 */
export function inside(path: string, folder: string, platform: string = process.platform): boolean
{
    if (path.startsWith("~")) {
        return false;
    }

    const windows = platform === "win32";

    // Off Windows such a path would be read as a file of the folder whose name holds a colon or a backslash: it is refused as one outside.
    if (!windows && (/^[a-zA-Z]:/.test(path) || path.includes("\\"))) {
        return false;
    }

    const { resolve, sep } = windows ? win32 : posix;
    const fold = (text: string): string => (windows ? text.toLowerCase() : text);
    // A host may name a file as a URL's path does, /F:/chat/page.md: on Windows no file is named so, and it is the path after the slash.
    const named = windows && /^[\\/][a-zA-Z]:[\\/]/.test(path) ? path.slice(1) : path;
    const base = fold(resolve(folder));
    const target = fold(resolve(base, named));
    return target === base || target.startsWith(base.endsWith(sep) ? base : `${base}${sep}`);
}

/** Whether a pattern of files stays in the path it is read from: neither absolute nor climbing out of it, nor with braces, whose choices may do either. */
export function staysInside(pattern: unknown): boolean
{
    return typeof pattern === "string" && !isAbsolute(pattern) && !/^([a-zA-Z]:|[\\/~])/.test(pattern) && !/[{}]/.test(pattern) && !pattern.split(/[\\/]/).includes("..");
}
