// A list of games as one stop of the Tab: the arrows move between its rows, and between a row's buttons, as in a menu; the Tab goes on past the list.
import type { RefObject } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";

/** What the list's element takes: its ref, and what it does with the keys and the focus. */
export interface RowKeys
{
    readonly ref: RefObject<HTMLUListElement>;
    onKeyDown(event: KeyboardEvent): void;
    onFocusIn(event: FocusEvent): void;
}

/**
 * Makes the list's rows one stop of the Tab: the row's button focused last, or the first row's, takes the Tab, the others only the arrows. Up and down go
 * to the row above and below, Home and End to the first and the last, left and right between a row's own buttons. A row that asks a question in its place
 * keeps its buttons in the Tab's order.
 */
export function useRowKeys(): RowKeys
{
    const ref = useRef<HTMLUListElement>(null);
    const current = useRef<HTMLButtonElement | undefined>(undefined);

    // After each render the rows may have changed, by a search or a game deleted: the one stop is the button focused last, if still there, or the first.
    useLayoutEffect(() => {
        if (ref.current !== null) {
            setStop(rowsOf(ref.current).flat(), current.current);
        }
    });

    const onFocusIn = (event: FocusEvent): void => {
        const buttons = ref.current === null ? [] : rowsOf(ref.current).flat();

        if (buttons.includes(event.target as HTMLButtonElement)) {
            current.current = event.target as HTMLButtonElement;
            setStop(buttons, current.current);
        }
    };

    const onKeyDown = (event: KeyboardEvent): void => {
        const rows = ref.current === null ? [] : rowsOf(ref.current);
        const row = rows.findIndex((buttons) => buttons.includes(event.target as HTMLButtonElement));

        if (row === -1) {
            return;
        }

        const next = target(event.key, rows, row, rows[row]!.indexOf(event.target as HTMLButtonElement));

        if (next !== undefined) {
            event.preventDefault();
            next.focus();
        }
    };

    return { ref, onKeyDown, onFocusIn };
}

/** Gives the Tab to the button wanted, if it is still in the list, else to the first. */
function setStop(buttons: readonly HTMLButtonElement[], wanted: HTMLButtonElement | undefined): void
{
    const stop = wanted !== undefined && buttons.includes(wanted) ? wanted : buttons[0];

    for (const button of buttons) {
        button.tabIndex = button === stop ? 0 : -1;
    }
}

/** The button a key goes to from the row and column focused, or none for a key the list leaves to the page. */
function target(key: string, rows: readonly (readonly HTMLButtonElement[])[], row: number, column: number): HTMLButtonElement | undefined
{
    const at = (index: number): HTMLButtonElement | undefined => {
        const buttons = rows[Math.max(0, Math.min(rows.length - 1, index))]!;
        return buttons[Math.min(column, buttons.length - 1)];
    };

    switch (key) {
        case "ArrowDown":
            return at(row + 1);
        case "ArrowUp":
            return at(row - 1);
        case "Home":
            return at(0);
        case "End":
            return at(rows.length - 1);
        case "ArrowRight":
            return rows[row]![Math.min(column + 1, rows[row]!.length - 1)];
        case "ArrowLeft":
            return rows[row]![Math.max(column - 1, 0)];
        default:
            return undefined;
    }
}

/** The rows' own buttons, row by row, those that can take the focus: the row's, and its menu's button, never a menu's or a question's. */
function rowsOf(list: HTMLUListElement): HTMLButtonElement[][]
{
    return [...list.querySelectorAll<HTMLLIElement>(":scope > li:not([role])")]
        .map((row) => [...row.querySelectorAll<HTMLButtonElement>(":scope > button, :scope > .row-actions > button")].filter((button) => !button.disabled))
        .filter((buttons) => buttons.length > 0);
}
