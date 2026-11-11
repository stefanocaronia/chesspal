// The player's profiles (D-23): profiles/<id>/ in the data folder (D-71), each with its profile.md, its games and its page settings, and the one in use;
// there is always one, the first made by Chesspal.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { makeFolder, renameOver, writeAtomically } from "../games/index.ts";
import { readFrontMatter, writeFrontMatter } from "./front-matter.ts";
import { type Rating, savedReadings, type SiteReading, type SiteReadings } from "./ratings.ts";

/** How the player says they play, from who has just learned to who plays tournaments. */
export const levels = ["learning", "casual", "regular", "tournament"] as const;
export type Level = (typeof levels)[number];

/** The longest name a profile keeps. */
export const nameLimit = 40;

/** The avatars Zoe drew, for a player without an image of their own (D-45). */
export const drawnAvatars = ["short-hair", "bun", "glasses", "beanie", "beard", "curls", "moustache", "silver-bob", "cat", "owl"] as const;
export type DrawnAvatar = (typeof drawnAvatars)[number];

/** The FIDE ratings Chesspal takes: whole numbers from FIDE's lowest, 1400 since 2024, to 3000. */
export const fideLowest = 1400;
export const fideHighest = 3000;

/** What the player tells of themselves: their name, how they play, the avatar they chose, their FIDE rating, typed since FIDE has no API (D-106). */
export interface ProfileFields
{
    readonly name: string;
    readonly level?: Level;
    readonly avatar?: DrawnAvatar;
    readonly fide?: number;
}

/** The player's names on the sites they play on. */
export interface Accounts
{
    readonly lichess?: string;
    readonly chesscom?: string;
}

/** A profile: its folder's name, and what profile.md says; a folder without one is named by the folder. */
export interface PlayerProfile extends ProfileFields
{
    readonly id: string;
    /** Made by Chesspal at the first start, until the player completes it: the board page's wizard does (D-71). */
    readonly new?: true;
    /** The player's names on Lichess and chess.com, written in profile.md by hand or from the page, by which the games they load are theirs (D-93). */
    readonly accounts?: Accounts;
    /** What Lichess and chess.com said of those names, the last time Chesspal asked (D-105). */
    readonly sites?: SiteReadings;
    /** The rating that counts, of the names the profile has now: of two, the one the sites are surer of (D-106). */
    readonly rating?: Rating;
}

/** What may change in a profile: what the player tells of themselves, and their names on the sites, each one written whole. */
export type ProfileChanges = Partial<ProfileFields> & { readonly accounts?: Accounts; };

/** The profiles in the data folder, by their folders' names. */
export function listProfiles(root: string): PlayerProfile[]
{
    return profileIds(root).map((id) => readProfile(root, id));
}

/**
 * Makes the first profile when there is none, named after the system's account and new until the player completes it (D-71). Two processes starting
 * together make one: the second finds its folder taken.
 */
export function ensureProfile(root: string, account: string): void
{
    const id = freeId(root, slugOf(account));

    if (profileIds(root).length === 0 && claimed(root, id)) {
        fillProfile(root, id, { name: account }, true);
    }
}

/** The profile in use: the one active.json names, else the first. */
export function activeProfile(root: string): PlayerProfile
{
    return readProfile(root, activeIdOf(root));
}

/** Where the games are: the folder of the profile in use. */
export function gameFolder(root: string): string
{
    return profileFolder(root, activeIdOf(root));
}

/** A profile's folder. */
export function profileFolder(root: string, id: string): string
{
    return join(root, folderName, id);
}

/**
 * Makes a profile, its folder named from the player's name, and puts it in use unless told not to; the one Chesspal made, while new, becomes it instead,
 * with its games, and its folder takes the player's name too (D-71).
 */
export function createProfile(root: string, fields: ProfileFields, use = true): PlayerProfile
{
    const id = activeId(root);

    if (id !== undefined && readProfile(root, id).new === true) {
        const { level, avatar, fide } = fields;
        const named = renamed(root, id, fields.name);
        writeProfile(root, named, { name: fields.name, level, avatar, fide, new: false });
        return readProfile(root, named);
    }

    let made = freeId(root, slugOf(fields.name));

    // Another process may take the same id between the look and the folder: the next free one, then.
    while (!claimed(root, made)) {
        made = freeId(root, slugOf(fields.name));
    }

    return fillProfile(root, made, fields, false, use);
}

/** Every profile's folder, where games may be. */
export function gameFolders(root: string): string[]
{
    return profileIds(root).map((id) => profileFolder(root, id));
}

/** Puts a profile in use. */
export function activateProfile(root: string, id: string): PlayerProfile
{
    const ids = profileIds(root);

    if (!ids.includes(id)) {
        throw new Error(ids.length === 0 ? "There is no profile yet: make one first." : `There is no profile ${id}: the profiles are ${ids.join(", ")}.`);
    }

    writeActive(root, id);
    return readProfile(root, id);
}

/** Changes what a profile says of the player, keeping the rest of profile.md as it was written: its other fields and the text below them. */
export function updateProfile(root: string, id: string, changes: ProfileChanges): PlayerProfile
{
    writeProfile(root, id, changes);
    return readProfile(root, id);
}

const folderName = "profiles";
const profileFile = "profile.md";
const activeFile = "active.json";

// Names Windows keeps for devices: no folder may take them.
const reserved = /^(con|prn|aux|nul|com\d|lpt\d)$/;

function profileIds(root: string): string[]
{
    try {
        return readdirSync(join(root, folderName), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    } catch {
        return [];
    }
}

function activeId(root: string): string | undefined
{
    const named = activeNamed(root);
    const ids = profileIds(root);
    return named !== undefined && ids.includes(named) ? named : ids[0];
}

function activeIdOf(root: string): string
{
    const id = activeId(root);

    if (id === undefined) {
        throw new Error(`There is no profile in ${join(root, folderName)}: run any Chesspal command, and it makes one.`);
    }

    return id;
}

/** Takes a profile's folder for this call alone: false when another process has made it already. */
function claimed(root: string, id: string): boolean
{
    makeFolder(join(root, folderName));
    const folder = profileFolder(root, id);

    try {
        mkdirSync(folder);
        return true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
            return false;
        }

        throw new Error(`${folder} could not be made (${(error as Error).message}): check that it is a folder, and can be written.`, { cause: error });
    }
}

/** Writes a profile in the folder this call claimed and puts it in use when asked; on a failure the folder goes, which holds nothing of another's. */
function fillProfile(root: string, id: string, fields: ProfileFields, made: boolean, use = true): PlayerProfile
{
    try {
        writeProfile(root, id, made ? { ...fields, new: true } : fields);

        if (use) {
            writeActive(root, id);
        }
    } catch (error) {
        rmSync(profileFolder(root, id), { recursive: true, force: true });
        throw error;
    }

    return readProfile(root, id);
}

/**
 * The folder of the profile Chesspal made, named after the account, moved to the player's name and put in use; it keeps the account's for a name without
 * letters or digits, and where it cannot move, as with a file held open in it.
 */
function renamed(root: string, id: string, name: string): string
{
    const plain = plainName(name);

    if (plain === "" || id === plain || (id.startsWith(`${plain}-`) && /^\d+$/.test(id.slice(plain.length + 1)))) {
        return id;
    }

    const target = freeId(root, plain);

    // On Linux and macOS a folder another process made between the look and the move would be replaced: two profiles made in the same instant.
    try {
        renameOver(profileFolder(root, id), profileFolder(root, target));
    } catch {
        return id;
    }

    try {
        writeActive(root, target);
    } catch (error) {
        // Moved back, or the first folder would be put in use in its place.
        renameOver(profileFolder(root, target), profileFolder(root, id));
        throw error;
    }

    return target;
}

function activeNamed(root: string): string | undefined
{
    try {
        const { profile } = JSON.parse(readFileSync(join(root, folderName, activeFile), "utf8")) as { profile?: unknown; };
        return typeof profile === "string" && /^[^/\\.][^/\\]*$/.test(profile) ? profile : undefined;
    } catch {
        return undefined;
    }
}

function writeActive(root: string, id: string): void
{
    writeAtomically(join(root, folderName, activeFile), `${JSON.stringify({ profile: id }, null, 2)}\n`);
}

function readProfile(root: string, id: string): PlayerProfile
{
    const { fields } = readFrontMatter(profileText(root, id));
    const level = oneOf(levels, fields.level);
    const avatar = oneOf(drawnAvatars, fields.avatar);
    const fide = fideIn(fields.fide);
    const { accounts } = accountsIn(fields);
    const sites = savedReadings(profileFolder(root, id));
    const rating = sites === undefined ? undefined : surest([ofAccount(sites.lichess, accounts?.lichess), ofAccount(sites.chesscom, accounts?.chesscom)]);
    // A name written by hand is cut as the page and the CLI cut it: the AI reads it.
    return {
        id,
        name: fields.name?.trim().slice(0, nameLimit).trim() || id,
        ...(level === undefined ? {} : { level }),
        ...(avatar === undefined ? {} : { avatar }),
        ...(fide === undefined ? {} : { fide }),
        ...(fields.new === "true" ? { new: true as const } : {}),
        ...(accounts === undefined ? {} : { accounts }),
        ...(sites === undefined ? {} : { sites }),
        ...(rating === undefined ? {} : { rating }),
    };
}

/** A site's rating, when it was read for the name the profile has there now. */
function ofAccount(reading: SiteReading | undefined, account: string | undefined): Rating | undefined
{
    return account !== undefined && reading?.account.toLowerCase() === account.toLowerCase() ? reading.rating : undefined;
}

/** Of the ratings, the one its site is surest of: the lowest RD (D-106). */
function surest(ratings: readonly (Rating | undefined)[]): Rating | undefined
{
    return ratings.reduce<Rating | undefined>((best, one) => (one !== undefined && (best === undefined || one.deviation < best.deviation) ? one : best), undefined);
}

/** The FIDE rating of profile.md's fide line: none when it is not a whole number in FIDE's range, as one written by hand may not be. */
function fideIn(text: string | undefined): number | undefined
{
    const fide = Number(text?.trim());
    return Number.isInteger(fide) && fide >= fideLowest && fide <= fideHighest ? fide : undefined;
}

/** The player's names on the sites, from profile.md's lichess and chesscom lines; none without either. */
function accountsIn(fields: Readonly<Record<string, string>>): { accounts?: Accounts; }
{
    const named = (site: string): string | undefined => fields[site]?.trim().slice(0, nameLimit).trim() || undefined;
    const lichess = named("lichess");
    const chesscom = named("chesscom");

    if (lichess === undefined && chesscom === undefined) {
        return {};
    }

    return { accounts: { ...(lichess === undefined ? {} : { lichess }), ...(chesscom === undefined ? {} : { chesscom }) } };
}

// Writes the fields that change, and keeps the others as the file has them, even those this version does not read.
function writeProfile(root: string, id: string, changes: ProfileChanges & { readonly new?: boolean; }): void
{
    const { fields, body } = readFrontMatter(profileText(root, id));
    const written: Record<string, string | number | undefined> = { ...fields };

    if (changes.name !== undefined) {
        written.name = changes.name;
    }

    if ("level" in changes) {
        written.level = changes.level;
    }

    if ("avatar" in changes) {
        written.avatar = changes.avatar;
    }

    if ("fide" in changes) {
        written.fide = changes.fide;
    }

    if ("accounts" in changes) {
        written.lichess = changes.accounts?.lichess;
        written.chesscom = changes.accounts?.chesscom;
    }

    if ("new" in changes) {
        written.new = changes.new === true ? "true" : undefined;
    }

    writeAtomically(join(profileFolder(root, id), profileFile), writeFrontMatter(written, body));
}

function profileText(root: string, id: string): string
{
    try {
        return readFileSync(join(profileFolder(root, id), profileFile), "utf8");
    } catch {
        return "";
    }
}

/** A folder's name from the player's name: its plain letters and digits, or player for a name without any. */
function slugOf(name: string): string
{
    return plainName(name) || "player";
}

/** A name in plain letters and digits, lower case, words joined by hyphens; empty for a name without any. */
function plainName(name: string): string
{
    return name.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+/, "").slice(0, 32).replace(/-+$/, "");
}

function freeId(root: string, slug: string): string
{
    const taken = (id: string): boolean => reserved.test(id) || existsSync(profileFolder(root, id));
    let id = slug;

    for (let number = 2; taken(id); number++) {
        id = `${slug}-${number}`;
    }

    return id;
}

// A value of a list, as a hand may write it: in capitals too.
function oneOf<Value extends string>(values: readonly Value[], value: string | undefined): Value | undefined
{
    return values.find((one) => one === value?.toLowerCase());
}
