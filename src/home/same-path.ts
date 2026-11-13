import { realpathSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

/** Whether two paths name the same folder: as written, or through the links and junctions on their way; without regard to case on Windows. */
export function samePath(one: string, other: string): boolean
{
    // The same path as written needs no disk: only two different names may be one folder.
    return sameText(resolve(one), resolve(other)) || sameText(realPath(one), realPath(other));
}

/**
 * A path with the links and junctions on its way followed, as a page's ports are counted from it: two names of one folder give one path. Case, drive
 * letters and short names stay as written, so a path with no link stays as it was. A folder not made yet keeps the rest of its path as written.
 */
export function realPath(path: string): string
{
    const written = resolve(path);

    try {
        return realpathSync(written);
    } catch {
        const parent = dirname(written);
        return parent === written ? written : join(realPath(parent), basename(written));
    }
}

function sameText(one: string, other: string): boolean
{
    return process.platform === "win32" ? one.toLowerCase() === other.toLowerCase() : one === other;
}
