// What Lichess and chess.com said of the player's names there (D-105, D-106): ratings.json in the profile's folder, written by Chesspal each time it reads
// them, never by hand; the rating that counts is chosen from it as the profile is read.
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { writeAtomically } from "../games/index.ts";

/** The sites a rating is read from, by the player's names there (D-105). */
export const ratingSites = ["lichess", "chess.com"] as const;
export type RatingSite = (typeof ratingSites)[number];

/** The speeds whose rating counts, in the order they count: the games with the AI are like a slow rapid (D-106). */
export const speeds = ["rapid", "classical", "blitz"] as const;
export type Speed = (typeof speeds)[number];

/** A rating a site gives: the number as it is, never converted, its speed, how sure the site is of it (its RD), and the day of the last game at that speed. */
export interface Rating
{
    readonly value: number;
    readonly site: RatingSite;
    readonly speed: Speed;
    readonly rd: number;
    /** YYYY-MM-DD. */
    readonly played?: string;
}

/** What a site said of the player's name there, the last time Chesspal asked. */
export interface SiteReading
{
    readonly account: string;
    /** False when the site has no player of that name; unknown while it has never answered. */
    readonly found?: boolean;
    /** The rating that counts there: none when the player has no established rating at a speed that counts. */
    readonly rating?: Rating;
    /** The last try did not reach the site: what it said before stays. */
    readonly unreached?: true;
}

/** What the sites said, and when Chesspal last asked them. */
export interface SiteReadings
{
    readonly read: string;
    readonly lichess?: SiteReading;
    readonly chesscom?: SiteReading;
}

/** The readings kept in a profile's folder; undefined when it has none, or they cannot be read. */
export function savedReadings(folder: string): SiteReadings | undefined
{
    try {
        return readingsOf(JSON.parse(readFileSync(join(folder, fileName), "utf8")));
    } catch {
        return undefined;
    }
}

/** Keeps the readings in a profile's folder, over the ones before; none removes them. */
export function saveReadings(folder: string, readings: SiteReadings | undefined): void
{
    if (readings === undefined) {
        rmSync(join(folder, fileName), { force: true });
    } else {
        writeAtomically(join(folder, fileName), `${JSON.stringify(readings, null, 2)}\n`);
    }
}

const fileName = "ratings.json";

// Readings as the file has them, each part checked: a file edited by hand never gives the AI a rating that is not one.
function readingsOf(value: unknown): SiteReadings | undefined
{
    const file = value as Partial<Record<keyof SiteReadings, unknown>> | null;

    if (typeof file?.read !== "string" || Number.isNaN(Date.parse(file.read))) {
        return undefined;
    }

    const lichess = readingOf(file.lichess, "lichess");
    const chesscom = readingOf(file.chesscom, "chess.com");
    return { read: file.read, ...(lichess === undefined ? {} : { lichess }), ...(chesscom === undefined ? {} : { chesscom }) };
}

function readingOf(value: unknown, site: RatingSite): SiteReading | undefined
{
    const reading = value as Partial<Record<keyof SiteReading, unknown>> | null | undefined;

    if (typeof reading?.account !== "string" || reading.account === "") {
        return undefined;
    }

    const rating = ratingOf(reading.rating, site);
    return {
        account: reading.account,
        ...(typeof reading.found === "boolean" ? { found: reading.found } : {}),
        ...(rating === undefined ? {} : { rating }),
        ...(reading.unreached === true ? { unreached: true as const } : {}),
    };
}

function ratingOf(value: unknown, site: RatingSite): Rating | undefined
{
    const rating = value as Partial<Record<keyof Rating, unknown>> | null | undefined;
    const speed = speeds.find((one) => one === rating?.speed);
    const plausible = (number: unknown): number is number => typeof number === "number" && Number.isInteger(number) && number > 0 && number < 4000;

    if (rating?.site !== site || speed === undefined || !plausible(rating.value) || !plausible(rating.rd)) {
        return undefined;
    }

    const played = typeof rating.played === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rating.played) ? rating.played : undefined;
    return { value: rating.value, site, speed, rd: rating.rd, ...(played === undefined ? {} : { played }) };
}
