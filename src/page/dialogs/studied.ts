// The players of a game in analysis (D-69), as the page shows them: a game played here names them Player and AI, one played elsewhere by their names; the
// player's own, by their names on Lichess and chess.com (D-93).
import type { Side } from "../../core/index.ts";

/** A side of the game in analysis: its player's name, and whose picture it takes: the player's, the AI's, or none. */
export interface StudiedSide
{
    readonly name: string;
    readonly who: "player" | "ai" | "other";
}

/** The player's names on the sites they play on, from their profile. */
export interface Accounts
{
    readonly lichess?: string;
    readonly chesscom?: string;
}

/** The player's side in a game in analysis: none when they played neither side, or both. */
export function playerIn(sides: Record<Side, StudiedSide>): Side | undefined
{
    const white = sides.white.who === "player";
    return white === (sides.black.who === "player") ? undefined : white ? "white" : "black";
}

/**
 * Both sides of a game in analysis, and the one at the bottom: the player's, when one of them is, else White. The player is the side named Player, or by
 * their name, or by their name on the site the game was played on (D-93).
 */
export function studiedSides(
    tags: Readonly<Record<string, string>>,
    you: string,
    ai: string,
    sides: Readonly<Record<Side, string>>,
    accounts?: Accounts,
): Record<Side, StudiedSide> & { bottom: Side; }
{
    const sideOf = (side: Side): StudiedSide => {
        const tag = (side === "white" ? tags.White : tags.Black)?.trim() ?? "";

        if (tag === "Player" || tag.toLowerCase() === you.trim().toLowerCase()) {
            return { name: you, who: "player" };
        }

        if (accountSide(tags, accounts) === side) {
            return { name: tag, who: "player" };
        }

        // A tag PGN leaves unknown names the side.
        return tag === "AI" ? { name: ai, who: "ai" } : { name: /^[?\-\s]*$/.test(tag) ? sides[side] : tag, who: "other" };
    };

    const white = sideOf("white");
    const black = sideOf("black");
    return { white, black, bottom: black.who === "player" && white.who !== "player" ? "black" : "white" };
}

/**
 * The side a game loaded from elsewhere names by one of the player's names on the sites (D-93): the one of its site when the Site tag says Lichess or
 * chess.com, either otherwise; none when neither side, or both, has one.
 */
export function accountSide(tags: Readonly<Record<string, string>>, accounts: Accounts | undefined): Side | undefined
{
    const site = (tags.Site ?? "").toLowerCase();
    const names = [
        site.includes("chess.com") ? undefined : accounts?.lichess,
        site.includes("lichess") ? undefined : accounts?.chesscom,
    ].filter((name) => name !== undefined).map((name) => name.trim().toLowerCase());
    const white = names.includes(tags.White?.trim().toLowerCase() ?? "");
    const black = names.includes(tags.Black?.trim().toLowerCase() ?? "");
    return white === black ? undefined : white ? "white" : "black";
}
