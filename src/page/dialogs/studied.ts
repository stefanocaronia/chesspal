// The players of a game in analysis (D-69), as the page shows them: a game played here names them Player and AI, one played elsewhere by their names; the
// player's own, and another profile's, by their names on Lichess and chess.com (D-93), shown with the profile's name.
import { accountSide, type Side, type SiteNames } from "../../core/index.ts";

/** A side of the game in analysis: its player's name, and whose picture it takes: the player's, the AI's, another profile's, or none. */
export interface StudiedSide
{
    readonly name: string;
    readonly who: "player" | "ai" | "other";
    /** The id of another of the profiles here, whose name on a site this side bears. */
    readonly profile?: string;
}

/** The player's names on the sites they play on, from their profile. */
export type Accounts = SiteNames;

/** Another profile here, as the sides of a game look for it: its id, its name and its names on the sites. */
export interface OtherProfile
{
    readonly id: string;
    readonly name: string;
    readonly accounts?: Accounts;
}

/** The profiles here other than the one in use. */
export function othersOf<Profile extends OtherProfile>(profiles: readonly Profile[] | undefined, inUse: string | undefined): Profile[]
{
    return (profiles ?? []).filter(({ id }) => id !== inUse);
}

/** The player's side in a game in analysis: none when they played neither side, or both. */
export function playerIn(sides: Record<Side, StudiedSide>): Side | undefined
{
    const white = sides.white.who === "player";
    return white === (sides.black.who === "player") ? undefined : white ? "white" : "black";
}

/**
 * Both sides of a game in analysis, and the one at the bottom: the player's, when one of them is, else White. The player is the side named Player, or by
 * their name, or by their name on the site the game was played on (D-93); a side that is not theirs and bears another profile's name there is that profile.
 */
export function studiedSides(
    tags: Readonly<Record<string, string>>,
    you: string,
    ai: string,
    sides: Readonly<Record<Side, string>>,
    accounts?: Accounts,
    others: readonly OtherProfile[] = [],
): Record<Side, StudiedSide> & { bottom: Side; }
{
    const sideOf = (side: Side): StudiedSide => {
        const tag = (side === "white" ? tags.White : tags.Black)?.trim() ?? "";

        if (tag === "Player" || tag.toLowerCase() === you.trim().toLowerCase() || accountSide(tags, accounts) === side) {
            return { name: you, who: "player" };
        }

        const other = others.find((profile) => accountSide(tags, profile.accounts) === side);

        if (other !== undefined) {
            return { name: other.name, who: "other", profile: other.id };
        }

        // A tag PGN leaves unknown names the side.
        return tag === "AI" ? { name: ai, who: "ai" } : { name: /^[?\-\s]*$/.test(tag) ? sides[side] : tag, who: "other" };
    };

    const white = sideOf("white");
    const black = sideOf("black");
    return { white, black, bottom: black.who === "player" && white.who !== "player" ? "black" : "white" };
}
