// The tab's title names the game and the move shown, Stefano – Claude, 16. ♞f3, so that the player's bookmarks and tabs tell its games apart.
import { useEffect } from "preact/hooks";
import { figurinesOf } from "../../core/index.ts";
import type { Ply } from "../game/plies.ts";

/** The title of a game: its players by their first names, White first, so that the move fits in a tab (Zoe), and the move shown with its number, none before the first. */
export function tabTitle(white: string, black: string, shown: Ply | undefined): string
{
    const players = `${firstName(white)} – ${firstName(black)}`;
    return shown === undefined ? players : `${players}, ${shown.number}${shown.side === "white" ? "." : "..."} ${figurinesOf(shown.san)}`;
}

/** Keeps the tab's title, Chesspal's name while no game shows. */
export function useTabTitle(title: string | undefined): void
{
    useEffect(() => {
        document.title = title ?? "Chesspal";
    }, [title]);
}

function firstName(name: string): string
{
    return name.trim().split(/\s+/)[0] || name;
}
