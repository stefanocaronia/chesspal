// The clock as the board page shows it (T-37): minutes and seconds, and tenths in the last seconds, as Lichess does.
import { clockText } from "../../core/index.ts";

/** Below this many milliseconds a clock shows tenths and turns red. */
export const lowTime = 20_000;

/** A time as the page's clock shows it: 4:32, 1:02:03, or 0:19.4 in the last seconds. */
export function timeShown(milliseconds: number): string
{
    if (milliseconds >= lowTime) {
        return clockText(milliseconds);
    }

    const tenths = Math.floor(milliseconds / 100);
    return `0:${String(Math.floor(tenths / 10)).padStart(2, "0")}.${tenths % 10}`;
}
