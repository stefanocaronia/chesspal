// The temporary folders of a test file, made in the system's and removed when its tests end.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { removeFolder } from "../folders.ts";

const made: string[] = [];

/** A new empty folder, removed by removeTempFolders. */
export function makeTempFolder(): string
{
    const folder = mkdtempSync(join(tmpdir(), "chesspal-hosts-"));
    made.push(folder);
    return folder;
}

/** Removes every folder makeTempFolder made, even after a test that failed half way. */
export async function removeTempFolders(): Promise<void>
{
    for (const folder of made.splice(0)) {
        await removeFolder(folder);
    }
}
