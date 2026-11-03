// The pieces, drawn from a set: one vector map with a symbol for each piece, wK to bP (D-49). The page shows Nitida, Codex's set; the Torretta (T-9, D-46)
// and cburnett (D-52) wait for the settings to be chosen (D-48). The moves always show the Torretta's figures, in the colour of the text (D-50).
const folder = "/page/pieces/";
const set = "nitida";

/** A piece by its FEN letter, uppercase for White, drawn to fill its box; the set takes its colours from the theme. */
export function Piece({ letter }: { letter: string; })
{
    const white = letter === letter.toUpperCase();
    return <Drawing href={`${folder}${set}.svg#${white ? "w" : "b"}${letter.toUpperCase()}`} class={`piece ${white ? "white" : "black"}`} />;
}

/** A piece as the notation shows it (D-50): one figure for both sides, in the colour of the text around it. */
export function Figurine({ letter }: { letter: string; })
{
    return <Drawing href={`${folder}torretta.svg#w${letter.toUpperCase()}`} class="figurine" />;
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
