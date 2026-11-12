// A game read from a site (D-110): who played, their ratings and the result from its PGN's tags, read alike for both sites; the rest from the site's JSON.
import type { RatingSite } from "../../profiles/index.ts";

/** A finished game of the player's on a site, as the list gives it, with its PGN to study. */
export interface SiteGame
{
    readonly site: RatingSite;
    /** What the list calls it: lichess/HqjDTU4A, chess.com/live/186466981288. */
    readonly name: string;
    readonly white: string;
    readonly black: string;
    readonly whiteRating?: number;
    readonly blackRating?: number;
    /** As the Result tag writes it: 1-0, 0-1, 1/2-1/2. */
    readonly result: string;
    /** As the site names it: blitz, rapid, daily… */
    readonly speed: string;
    /** When the game ended, as an ISO time. */
    readonly played: string;
    /** How long it was, in full moves. */
    readonly moves: number;
    readonly pgn: string;
}

/** What a site said of a name: its latest games, or that it could not be reached, or has no player of that name. */
export type SiteGamesAnswer = readonly SiteGame[] | "unreached" | "unknown";

/** The most games a site gives. */
export const gamesASite = 20;

/** A site's game from what its JSON gives and its PGN's tags; none for a name the list cannot write, or a game without a result, as one aborted. */
export function siteGameOf(site: RatingSite, name: string, speed: string, played: Date, pgn: string): SiteGame | undefined
{
    const tags = tagsOf(pgn);
    const result = tags.Result;

    if (!isSiteGameName(name) || result === undefined || !results.has(result) || Number.isNaN(played.getTime())) {
        return undefined;
    }

    const whiteRating = ratingOf(tags.WhiteElo);
    const blackRating = ratingOf(tags.BlackElo);
    return {
        site,
        name,
        white: tags.White ?? "?",
        black: tags.Black ?? "?",
        ...(whiteRating === undefined ? {} : { whiteRating }),
        ...(blackRating === undefined ? {} : { blackRating }),
        result,
        speed,
        played: played.toISOString(),
        moves: fullMovesOf(pgn),
        pgn,
    };
}

/** Whether a text is a game's name exactly as the list writes it: lichess/HqjDTU4A, chess.com/live/186466981288. */
export function isSiteGameName(text: string): boolean
{
    return siteGameName(text) === text;
}

/** A game's name as the list writes it, from one given with spaces around or the site in other capitals (Lichess/HqjDTU4A); none for another text. */
export function siteGameName(text: string): string | undefined
{
    const [, site, rest = ""] = /^(lichess|chess\.com)\/(\S+)$/i.exec(text.trim()) ?? [];

    if (site?.toLowerCase() === "lichess" && /^[A-Za-z0-9]+$/.test(rest)) {
        return `lichess/${rest}`;
    }

    return site?.toLowerCase() === "chess.com" && /^[a-z]+\/\d+$/i.test(rest) ? `chess.com/${rest.toLowerCase()}` : undefined;
}

/** Whether a text points at a site's game without being a name the list writes: a link to Lichess or Chess.com, or a name gone wrong. */
export function pointsAtSite(text: string): boolean
{
    const trimmed = text.trim();
    return siteGameName(trimmed) === undefined && /^(?:https?:\/\/)?(?:www\.)?(?:lichess\.org|lichess\/|chess\.?com\b)/i.test(trimmed);
}

/** The latest games first. */
export function latestFirst(one: SiteGame, other: SiteGame): number
{
    return other.played.localeCompare(one.played);
}

const results = new Set(["1-0", "0-1", "1/2-1/2"]);

// The tags of a PGN, [White "Anna"]: the sites do not depend on the chess core, and need only these.
function tagsOf(pgn: string): Record<string, string>
{
    const tags: Record<string, string> = {};

    for (const [, key, value] of pgn.matchAll(/^\s*\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]\s*$/gm)) {
        tags[key!] = value!.replace(/\\(.)/g, "$1");
    }

    return tags;
}

/** The full moves of a PGN's movetext: its moves counted without the tags, comments, move numbers, annotations and result. */
function fullMovesOf(pgn: string): number
{
    const movetext = pgn.replace(/^\s*\[.*\]\s*$/gm, " ").replace(/\{[^}]*\}|;[^\n]*/g, " ");
    const plies = movetext.split(/\s+/).filter((token) => token !== "" && !/^(?:\d+\.+|\$\d+|1-0|0-1|1\/2-1\/2|\*)$/.test(token)).map((token) => token.replace(/^\d+\.+/, ""));
    return Math.ceil(plies.filter((token) => token !== "").length / 2);
}

function ratingOf(tag: string | undefined): number | undefined
{
    return tag !== undefined && /^\d+$/.test(tag) ? Number(tag) : undefined;
}
