// The table's folder set up as init does, for the table and for `chesspal play` alike: when Chesspal writes Codex's hooks, the first time or again over
// older ones, a note says so, which the next `chesspal play codex` takes, for the player to hear it whichever of the two wrote them.
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { writeAtomically } from "../../../games/index.ts";
import { codexHooksPath, setUpHosts } from "../../../host-files/index.ts";

/** Codex's hooks as Chesspal last wrote them, which Codex asks the player to trust: the first time, or changed over ones trusted before. */
export type HooksNews = "new" | "changed";

/** Sets the table's folder up as init does, noting when Chesspal wrote Codex's hooks: Codex then asks the player to trust them. */
export function setUpTable(folder: string, platform: string): void
{
    const hooks = codexHooksPath(folder);
    const hadHooks = existsSync(hooks);

    if (setUpHosts(folder, platform).includes(hooks)) {
        // Hooks never trusted stay new, whatever Chesspal wrote over them before Codex asked.
        const news: HooksNews = hadHooks && readNote(folder) !== "new" ? "changed" : "new";
        writeAtomically(join(folder, hooksNoteFile), `${JSON.stringify({ hooks: news })}\n`);
    }
}

/** What Chesspal wrote of Codex's hooks since the player last heard it; the note is taken. One that cannot be read is no note. */
export function takeHooksNews(folder: string): HooksNews | undefined
{
    const news = readNote(folder);
    rmSync(join(folder, hooksNoteFile), { force: true });
    return news;
}

const hooksNoteFile = "codex-hooks-note.json";

// The note's news, none when there is no note or it cannot be read.
function readNote(folder: string): HooksNews | undefined
{
    try {
        const hooks = (JSON.parse(readFileSync(join(folder, hooksNoteFile), "utf8")) as { hooks?: unknown; } | undefined)?.hooks;
        return hooks === "new" || hooks === "changed" ? hooks : undefined;
    } catch {
        return undefined;
    }
}
