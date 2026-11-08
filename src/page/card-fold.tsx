// The cards of the game's column the player folds to their title (Stefano): the opening, the helps and the moves, each as this browser remembers it, as
// the columns (T-84).
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import type { Text } from "./text.ts";

/** A card of the game's column that folds to its title. */
export type FoldingCard = "opening" | "helps" | "moves";

/** Whether the card is folded, as this browser left it, and what folds it or opens it again. */
export function useCardFold(card: FoldingCard): [folded: boolean, toggle: () => void]
{
    const [folded, setFolded] = useState(() => read(card));

    const toggle = (): void => {
        remember(card, !folded);
        setFolded(!folded);
    };

    return [folded, toggle];
}

/** A card's title as the button that folds the card and opens it again: its icon and name, then a chevron, down while the card is open. */
export function FoldButton({ folded, onFold, text, children }: { folded: boolean; onFold: () => void; text: Text; children: ComponentChildren; })
{
    return (
        <button type="button" class="card-fold" aria-expanded={!folded} title={folded ? text.openCard : text.foldCard} onClick={onFold}>
            {children}
            <svg class="chevron" viewBox="0 0 16 16" aria-hidden="true">
                <path d={folded ? "M6 4L10 8L6 12" : "M4 6L8 10L12 6"} />
            </svg>
        </button>
    );
}

function read(card: FoldingCard): boolean
{
    try {
        return localStorage.getItem(keyOf(card)) === "folded";
    } catch {
        // A browser that keeps nothing for the page: the card opens.
        return false;
    }
}

function remember(card: FoldingCard, folded: boolean): void
{
    try {
        if (folded) {
            localStorage.setItem(keyOf(card), "folded");
        } else {
            localStorage.removeItem(keyOf(card));
        }
    } catch {
        // The choice lasts as long as the page.
    }
}

function keyOf(card: FoldingCard): string
{
    return `chesspal-card-${card}`;
}
