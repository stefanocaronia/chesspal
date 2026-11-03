// The pieces, drawn from a set: one vector map with a symbol for each piece, wK to bP (D-49): Nitida, the Torretta (T-9, D-46) or cburnett (D-52), as the
// settings choose (D-56). The moves always show the Torretta's figures, in the colour of the text (D-50).
import { createContext } from "preact";
import { useContext } from "preact/hooks";
import type { PieceSet } from "./settings.ts";

/** The set the player chose, for every piece the page draws. */
export const ChosenSet = createContext<PieceSet>("nitida");

const folder = "/page/pieces/";

/** A piece by its FEN letter, uppercase for White, drawn to fill its box from the chosen set, or from `set`; our sets take their colours from the settings. */
export function Piece({ letter, set }: { letter: string; set?: PieceSet; })
{
    const chosen = useContext(ChosenSet);
    const white = letter === letter.toUpperCase();
    return <Drawing href={`${folder}${set ?? chosen}.svg#${white ? "w" : "b"}${letter.toUpperCase()}`} class={`piece ${white ? "white" : "black"}`} />;
}

/** A piece as the notation shows it (D-50): White's white and Black's black, edged in the colour of the text around it. */
export function Figurine({ letter, side }: { letter: string; side: "white" | "black"; })
{
    return <Drawing href={`${folder}torretta.svg#w${letter.toUpperCase()}`} class={`figurine ${side}`} />;
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
