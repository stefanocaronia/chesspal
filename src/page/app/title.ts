// The tab's title names the game and the move shown, then Chesspal, Stefano – Claude, 16. ♞f3 · Chesspal, so that the player's bookmarks and tabs tell its
// games apart and the window says whose it is. The table's window script knows the window by Chesspal's name (server/table/window.ts): change both together.
import { useEffect } from "preact/hooks";
import { figurinesOf } from "../../core/index.ts";
import type { Ply } from "../game/plies.ts";

/**
 * The title of a game: its players by their first names, White first, so that the move fits in a tab (Zoe), and the move shown with its number, none before
 * the first; a move of a variation in analysis after its fork, ⑂ (D-116); then Chesspal's name.
 */
export function tabTitle(white: string, black: string, shown: Pick<Ply, "san" | "side" | "number"> | undefined, line = false): string
{
    const players = `${firstName(white)} – ${firstName(black)}`;
    const game = shown === undefined ? players : `${players}, ${line ? "⑂ " : ""}${shown.number}${shown.side === "white" ? "." : "..."} ${figurinesOf(shown.san)}`;
    return `${game} · ${appName}`;
}

/** Keeps the tab's title, Chesspal's name while no game shows. */
export function useTabTitle(title: string | undefined): void
{
    useEffect(() => {
        document.title = title ?? appName;
    }, [title]);
}

const appName = "Chesspal";

function firstName(name: string): string
{
    return name.trim().split(/\s+/)[0] || name;
}
