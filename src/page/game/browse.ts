// Looking back through the game played (T-88): one step at a time or to either end, with the keys of Lichess and chess.com, only to look at it.

/** A step through the game's moves. */
export type Step = "first" | "back" | "forward" | "last";

/** The keys that step through the moves, as Lichess and chess.com have them: the arrows, and Home and End. */
export const stepKeys: Readonly<Record<string, Step>> = {
    ArrowLeft: "back",
    ArrowRight: "forward",
    ArrowUp: "first",
    Home: "first",
    ArrowDown: "last",
    End: "last",
};

/** The keys that turn the board round: f on Lichess, x on chess.com. */
export const flipKeys: readonly string[] = ["f", "x"];

/** How many moves are shown after a step from `at` of the game's `total`: never before the start nor past the last move. */
export function stepped(step: Step, at: number, total: number): number
{
    const to = { first: 0, back: at - 1, forward: at + 1, last: total }[step];
    return Math.max(0, Math.min(total, to));
}
