// The table's folder set up as init does, for the table and for `chesspal play` alike: when Codex's hooks were there and are written again, a note says so,
// which the next `chesspal play codex` takes, for the player to hear it whichever of the two wrote them.
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { writeAtomically } from "../../../games/index.ts";
import { codexHooksPath, setUpHosts } from "../../../host-files/index.ts";

/** Sets the table's folder up as init does, noting when Codex's hooks were there and Chesspal wrote them again: Codex then asks the player to trust them. */
export function setUpTable(folder: string, platform: string): void
{
    const hooks = codexHooksPath(folder);
    const hadHooks = existsSync(hooks);

    if (setUpHosts(folder, platform).includes(hooks) && hadHooks) {
        writeAtomically(join(folder, hooksChangedFile), `${JSON.stringify({ changed: true })}\n`);
    }
}

/** Whether Codex's hooks changed since the player last heard it; the note is taken. One that cannot be read is no note. */
export function takeHooksChanged(folder: string): boolean
{
    const path = join(folder, hooksChangedFile);
    let note: { changed?: unknown; } | undefined;

    try {
        note = JSON.parse(readFileSync(path, "utf8")) as { changed?: unknown; } | undefined;
    } catch {
        note = undefined;
    }

    rmSync(path, { force: true });
    return note?.changed === true;
}

const hooksChangedFile = "codex-hooks-changed.json";
