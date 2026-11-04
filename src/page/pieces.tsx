// The pieces, drawn from a set: one vector map with a symbol for each piece, wK to bP (D-49): Nitida, the Torretta (T-9, D-46) or cburnett (D-52), as the
// settings choose (D-56). The pieces taken and the moves show the set's small pieces (T-94): one silhouette each, in fixed colours (D-50).
import { createContext } from "preact";
import { useContext } from "preact/hooks";
import type { PieceSet } from "./settings.ts";

/** The set the player chose, for every piece the page draws. */
export const ChosenSet = createContext<PieceSet>("nitida");

const folder = "/page/pieces/";

/**
 * A piece by its FEN letter, uppercase for White, drawn to fill its box from the chosen set, or from `set`; our sets take their colours from the settings.
 * A `small` piece is the set's silhouette, in plain white or black, for the sizes where the full drawing blurs.
 */
export function Piece({ letter, set, small = false }: { letter: string; set?: PieceSet; small?: boolean; })
{
    const chosen = useContext(ChosenSet);
    const white = letter === letter.toUpperCase();
    return <Drawing href={`${folder}${set ?? chosen}${small ? "-small" : ""}.svg#${white ? "w" : "b"}${letter.toUpperCase()}`} class={`piece ${white ? "white" : "black"}`} />;
}

/** A piece as the notation shows it (D-50): the chosen set's small piece, White's white and Black's black. */
export function Figurine({ letter, side }: { letter: string; side: "white" | "black"; })
{
    const chosen = useContext(ChosenSet);
    return <Drawing href={`${folder}${chosen}-small.svg#${side === "white" ? "w" : "b"}${letter.toUpperCase()}`} class={`figurine ${side}`} />;
}

function Drawing({ href, class: name }: { href: string; class: string; })
{
    if (!/#[wb][KQRBNP]$/.test(href)) {
        return null;
    }

    return (
        <svg class={name} viewBox="0 0 100 100" aria-hidden="true">
            <use href={href} />
        </svg>
    );
}
