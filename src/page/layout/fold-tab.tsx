// The tab on a side column's outer edge, a drawer's handle, that slides the column under the board and pulls it out again.
import type { ComponentChildren } from "preact";
import { type Column, foldKeys } from "./folds.ts";

/**
 * The tab of a column: open, on the column's outer edge; folded, peeking out from under the board, with a dot when the AI spoke meanwhile, and a mark in the
 * other corner, as the AI's thought cloud.
 */
export function FoldTab({ column, folded, label, unread = false, mark, onFold }: {
    column: Column;
    folded: boolean;
    label: string;
    unread?: boolean;
    mark?: ComponentChildren;
    onFold: (column: Column) => void;
})
{
    // The chevron points where a click moves the handle: in under the board, or out again.
    const left = (column === "talk") === folded;

    return (
        <div class={`fold-tab of-${column}${folded ? " folded" : ""}`}>
            <button
                id={`fold-${column}`}
                class={unread ? "unread" : undefined}
                type="button"
                title={`${label} (${foldKeys[column]})`}
                aria-label={label}
                aria-controls={column}
                aria-expanded={!folded}
                aria-keyshortcuts={foldKeys[column]}
                onClick={() => onFold(column)}
            >
                <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d={left ? "M14 7L9 12L14 17" : "M10 7L15 12L10 17"} />
                </svg>
                {mark}
            </button>
        </div>
    );
}
