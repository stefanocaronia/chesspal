// The player's side in a game played on a site, by their names there (D-93): the rule the commands and the page share.
import type { Side } from "./game.ts";

/** The player's names on the sites they play on, from their profile. */
export interface SiteNames
{
    readonly lichess?: string;
    readonly chesscom?: string;
}

/**
 * The side a game loaded from elsewhere names by one of the player's names on the sites (D-93): the one of its site when the Site tag says Lichess or
 * chess.com, either otherwise; none when neither side, or both, has one.
 */
export function accountSide(tags: Readonly<Record<string, string | undefined>>, names: SiteNames | undefined): Side | undefined
{
    const site = (tags.Site ?? "").toLowerCase();
    const known = [
        site.includes("chess.com") ? undefined : names?.lichess,
        site.includes("lichess") ? undefined : names?.chesscom,
    ].filter((name) => name !== undefined).map((name) => name.trim().toLowerCase());
    const white = known.includes(tags.White?.trim().toLowerCase() ?? "");
    const black = known.includes(tags.Black?.trim().toLowerCase() ?? "");
    return white === black ? undefined : white ? "white" : "black";
}
