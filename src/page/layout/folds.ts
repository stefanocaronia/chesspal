// The side columns the player folds: the talk on the left, which narrows to its two faces before it folds, the game on the right; each as this browser
// remembers it.

/** A side column: the talk or the game. */
export type Column = "talk" | "game";

/** How a column shows: open, narrowed to a card with the two faces (the talk only), or folded under the board. */
export type Fold = "open" | "rail" | "folded";

/** How each column shows. */
export type Folds = Readonly<Record<Column, Fold>>;

/** The key that folds each column, as in editors with two side bars. */
export const foldKeys: Readonly<Record<Column, string>> = { talk: "[", game: "]" };

/** The columns as this browser left them; else both open. */
export function startFolds(): Folds
{
    return { talk: read("talk"), game: read("game") === "folded" ? "folded" : "open" };
}

/** What a click on a column's tab makes of it: the talk narrows to its faces, then folds, then opens whole again; the game folds and opens. */
export function nextFold(column: Column, fold: Fold): Fold
{
    if (fold === "open") {
        return column === "talk" ? "rail" : "folded";
    }

    return fold === "rail" ? "folded" : "open";
}

/** Remembers how the player left a column. */
export function rememberFold(column: Column, fold: Fold): void
{
    try {
        localStorage.setItem(keys[column], fold);
    } catch {
        // The choice lasts as long as the page.
    }
}

/** Whether the game's column is under the board, where three columns would leave the board small, and does not fold. */
export function gameUnderBoard(): boolean
{
    return matchMedia("(max-width: 1099px)").matches;
}

/** Whether the page is in one column, as on a phone, where nothing folds. */
export function oneColumn(): boolean
{
    return matchMedia("(max-width: 840px)").matches;
}

const keys: Record<Column, string> = { talk: "chesspal-talk", game: "chesspal-column" };

function read(column: Column): Fold
{
    try {
        const fold = localStorage.getItem(keys[column]);
        return fold === "rail" || fold === "folded" ? fold : "open";
    } catch {
        // A browser that keeps nothing for the page: the defaults decide.
        return "open";
    }
}
