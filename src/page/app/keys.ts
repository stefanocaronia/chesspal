// The page's keys and wheel: [ and ] fold the side columns, M holds the helps' map (D-78), ? opens the legend (D-99), the arrows, Home and End step
// through the moves and f and x turn the board, Esc closes a variation, Esc and Space stop the voice, and the wheel over the board steps too.
import { useEffect, useRef } from "preact/hooks";
import { flipKeys, type Step, stepKeys } from "../game/browse.ts";
import { type Column, foldKeys, gameUnderBoard, oneColumn } from "../layout/folds.ts";
import { hush, talking } from "../talk/voice.ts";

/**
 * `[` and `]` fold the talk and the game, as in editors with two side bars; never while the player types or drags a piece, nor in one column, nor the game
 * under the board.
 */
export function useFoldKeys(fold: (column: Column) => void): void
{
    useEffect(() => {
        const press = (event: KeyboardEvent): void => {
            if (!forThePage(event) || oneColumn()) {
                return;
            }

            const column = (Object.keys(foldKeys) as Column[]).find((key) => foldKeys[key] === event.key);

            if (column !== undefined && !(column === "game" && gameUnderBoard())) {
                event.preventDefault();
                fold(column);
            }
        };

        window.addEventListener("keydown", press);
        return () => window.removeEventListener("keydown", press);
    });
}

/** M held shows the control map while the helps are on (D-78); it goes off when M is let go or the page loses the focus. */
export function useMapKey(helping: boolean, map: (held: boolean) => void): void
{
    useEffect(() => {
        if (!helping) {
            map(false);
            return;
        }

        const down = (event: KeyboardEvent): void => {
            if (forThePage(event) && event.key.toLowerCase() === "m") {
                event.preventDefault();
                map(true);
            }
        };

        const up = (event: KeyboardEvent): void => {
            if (event.key.toLowerCase() === "m") {
                map(false);
            }
        };

        const away = (): void => map(false);

        window.addEventListener("keydown", down);
        window.addEventListener("keyup", up);
        window.addEventListener("blur", away);

        return () => {
            window.removeEventListener("keydown", down);
            window.removeEventListener("keyup", up);
            window.removeEventListener("blur", away);
        };
    }, [helping]);
}

/** ? opens the legend of the marks on the board and closes it, while the page shows its ? (D-99). */
export function useLegendKey(toggle: () => void): void
{
    useEffect(() => {
        const press = (event: KeyboardEvent): void => {
            const shown = [...document.querySelectorAll(".legend-button")].some((button) => button.getClientRects().length > 0);

            if (shown && forThePage(event) && event.key === "?") {
                event.preventDefault();
                toggle();
            }
        };

        window.addEventListener("keydown", press);
        return () => window.removeEventListener("keydown", press);
    });
}

/** The keys of Lichess and chess.com: the arrows, Home and End step through the moves, f and x turn the board round. */
export function useBrowseKeys(step: (to: Step) => void, flip: () => void): void
{
    useEffect(() => {
        const press = (event: KeyboardEvent): void => {
            const to = stepKeys[event.key];
            const flips = flipKeys.includes(event.key.toLowerCase());

            if (!forThePage(event) || (to === undefined && !flips)) {
                return;
            }

            event.preventDefault();

            if (to === undefined) {
                flip();
            } else {
                step(to);
            }
        };

        window.addEventListener("keydown", press);
        return () => window.removeEventListener("keydown", press);
    });
}

/** Esc closes what `close` closes, a variation in analysis (D-116), when nothing else on the page takes it: none while it is undefined. */
export function useEscapeKey(close: (() => void) | undefined): void
{
    useEffect(() => {
        if (close === undefined) {
            return;
        }

        const press = (event: KeyboardEvent): void => {
            if (event.key === "Escape" && forThePage(event)) {
                close();
            }
        };

        window.addEventListener("keydown", press);
        return () => window.removeEventListener("keydown", press);
    });
}

/**
 * Esc stops the voice reading the AI's words, with the bubbles waiting, and leaves the key to what else takes it, a dialog or a variation; Space too, while
 * the voice reads, unless the player types or Space presses what has the focus.
 */
export function useHushKeys(): void
{
    useEffect(() => {
        const press = (event: KeyboardEvent): void => {
            if (!talking() || !hushes(event.key, focusOf(event))) {
                return;
            }

            if (event.key === " ") {
                event.preventDefault();
            }

            hush();
        };

        // Before the dialogs and the board see it, which may stop it going further.
        window.addEventListener("keydown", press, true);
        return () => window.removeEventListener("keydown", press, true);
    }, []);
}

/** Where a key goes: a box the player types in, a control that Space presses, or the page. */
export type KeyFocus = "typing" | "control" | "page";

/** Whether a key stops the voice: Esc wherever it goes, Space only on the page itself. */
export function hushes(key: string, focus: KeyFocus): boolean
{
    return key === "Escape" || (key === " " && focus === "page");
}

/** The mouse wheel over the board steps through the moves, as on Lichess: down forward, a step a notch, however finely a touchpad turns it. */
export function useWheelSteps(step: (to: Step) => void): (event: WheelEvent) => void
{
    const turned = useRef(0);

    return (event) => {
        event.preventDefault();
        turned.current += event.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? event.deltaY : event.deltaY * notch;

        while (Math.abs(turned.current) >= notch) {
            step(turned.current > 0 ? "forward" : "back");
            turned.current -= Math.sign(turned.current) * notch;
        }
    };
}

// How far a wheel turns in one notch, in pixels.
const notch = 100;

/** Where a key goes: typed in a box, to a control or anything else with the focus, or to the page. */
function focusOf(event: KeyboardEvent): KeyFocus
{
    const target = event.target as HTMLElement;

    if (event.isComposing || target.closest("input, textarea, select, [contenteditable]") !== null) {
        return "typing";
    }

    return target.matches(controls) ? "control" : "page";
}

// What Space presses, or scrolls, when it has the focus: buttons, links, the board's squares and anything else the focus reaches.
const controls = "button, a[href], summary, label, [role], [tabindex]";

/** Whether a key is the page's: not one the player types into a box or the settings, nor with a modifier, nor while a piece is in the air. */
function forThePage(event: KeyboardEvent): boolean
{
    const typing = (event.target as HTMLElement).closest("input, textarea, select, [contenteditable], dialog") !== null;
    return !(event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey || typing || document.documentElement.classList.contains("dragging"));
}
