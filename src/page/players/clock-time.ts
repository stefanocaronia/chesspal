// The clock as the board page shows it: minutes and seconds, and tenths in the last seconds, as Lichess does.
import { type Clock, clockText, type Side, timeLeft } from "../../core/index.ts";

/** Below this many milliseconds a clock shows tenths and turns red. */
export const lowTime = 20_000;

/** A clock as the server sends it: while the AI's is held, with the instant it stands at, the same for every page. */
export type ShownClock = Clock & { readonly held?: string; };

/**
 * The time a side's clock shows `now`: what it has left, less the time of its turn so far when it is `toMove`; a clock the server holds stands at the
 * instant it says, whenever the page was loaded.
 */
export function clockLeft(clock: ShownClock, side: Side, toMove: boolean, now: Date): number
{
    return toMove ? timeLeft(clock, side, clock.held === undefined ? now : new Date(clock.held))[side] : clock.left[side];
}

/** A time as the page's clock shows it: 4:32, 1:02:03, or 0:19.4 in the last seconds. */
export function timeShown(milliseconds: number): string
{
    if (milliseconds >= lowTime) {
        return clockText(milliseconds);
    }

    const tenths = Math.floor(milliseconds / 100);
    return `0:${String(Math.floor(tenths / 10)).padStart(2, "0")}.${tenths % 10}`;
}
