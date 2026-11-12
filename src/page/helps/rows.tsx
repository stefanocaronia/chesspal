// What the helps' lines share, the tactics' and the strategy's: the pointer that lights a line's squares on the board, and the icon before a line.
import type { ComponentChildren } from "preact";

/** What the pointer on a line or a cell does: it lights the line's squares; a touch keeps them lit until the position changes, as a square in the AI's words. */
export function pointing(onPoint: (squares: readonly string[]) => void): (squares: readonly string[]) => Pointing
{
    return (squares) => ({
        onPointerEnter: () => onPoint(squares),
        onPointerLeave: (event: PointerEvent) => event.pointerType === "mouse" && onPoint([]),
    });
}

/** What a line or a cell does with the pointer. */
export interface Pointing
{
    onPointerEnter: () => void;
    onPointerLeave: (event: PointerEvent) => void;
}

/** The icon before a line of facts, in its kind's colour (Stefano): a pin's link, nothing at risk's tick, a check's plus, the loose pieces' i. */
export function RowIcon({ children }: { children: ComponentChildren; })
{
    return (
        <span class="row-icon" aria-hidden="true">
            <svg viewBox="0 0 16 16">{children}</svg>
        </span>
    );
}

/** An i in a ring, before the loose pieces and the strategy's notes. */
export function InfoIcon()
{
    return (
        <RowIcon>
            <circle cx="8" cy="8" r="6.5" />
            <path d="M8 7.3V11M8 4.9v.1" />
        </RowIcon>
    );
}
