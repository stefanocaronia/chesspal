// The player's profiles (D-23): profiles/<id>/ in the player's folder, each with its profile.md, its games and its page settings, and the one in use.
import { existsSync, readdirSync, readFileSync, rmdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { makeFolder, moveGames, writeAtomically } from "../games/index.ts";
import { readFrontMatter, writeFrontMatter } from "./front-matter.ts";

/** How the player says they play, from who has just learned to who plays tournaments. */
export const levels = ["learning", "casual", "regular", "tournament"] as const;
export type Level = (typeof levels)[number];

/** Where a rating comes from. */
export const ratingSites = ["lichess", "chess.com", "fide"] as const;
export type RatingSite = (typeof ratingSites)[number];

/** The lowest and highest rating a profile takes. */
export const ratingLimits = { lowest: 100, highest: 3500 } as const;

/** The longest name a profile keeps. */
export const nameLimit = 40;

/** The avatars Zoe drew, for a player without an image of their own (D-45). */
export const drawnAvatars = ["short-hair", "bun", "glasses", "beanie", "beard", "curls", "cat", "owl"] as const;
export type DrawnAvatar = (typeof drawnAvatars)[number];

/** A rating and where it comes from. */
export interface Rating
{
    readonly value: number;
    readonly site: RatingSite;
}

/** What the player tells of themselves: their name, how they play, their rating, the avatar they chose. */
export interface ProfileFields
{
    readonly name: string;
    readonly level?: Level;
    readonly rating?: Rating;
    readonly avatar?: DrawnAvatar;
}

/** A profile: its folder's name, and what profile.md says; a folder without one is named by the folder. */
export interface PlayerProfile extends ProfileFields
{
    readonly id: string;
}

/** The profiles in the player's folder, by their folders' names. */
export function listProfiles(root: string): PlayerProfile[]
{
    return profileIds(root).map((id) => readProfile(root, id));
}

/** The profile in use: the one active.json names, else the first; none before the first is made. */
export function activeProfile(root: string): PlayerProfile | undefined
{
    const id = activeId(root);
    return id === undefined ? undefined : readProfile(root, id);
}

/** Where the games are: the folder of the profile in use, or the player's folder itself while there is no profile. */
export function gameFolder(root: string): string
{
    const id = activeId(root);
    return id === undefined ? root : profileFolder(root, id);
}

/** A profile's folder. */
export function profileFolder(root: string, id: string): string
{
    return join(root, folderName, id);
}

/** Makes a profile, named from the player's name, and puts it in use: the first takes the games played before there were profiles. */
export function createProfile(root: string, fields: ProfileFields): PlayerProfile
{
    const first = profileIds(root).length === 0;
    const id = freeId(root, slugOf(fields.name));
    const folder = profileFolder(root, id);
    makeFolder(folder);

    try {
        writeProfile(root, id, fields);

        if (first) {
            moveGames(root, folder);
        }
    } catch (error) {
        removeHalfMade(folder);
        throw error;
    }

    writeActive(root, id);
    return readProfile(root, id);
}

/** Every folder that may hold games: the player's own, and each profile's. */
export function gameFolders(root: string): string[]
{
    return [root, ...profileIds(root).map((id) => profileFolder(root, id))];
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
export function updateProfile(root: string, id: string, changes: Partial<ProfileFields>): PlayerProfile
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
    const value = Number(fields.rating);
    const site = oneOf(ratingSites, fields.site);
    const level = oneOf(levels, fields.level);
    const avatar = oneOf(drawnAvatars, fields.avatar);
    const rated = Number.isInteger(value) && value >= ratingLimits.lowest && value <= ratingLimits.highest && site !== undefined;
    // A name written by hand is cut as the page and the CLI cut it: the AI reads it.
    return {
        id,
        name: fields.name?.trim().slice(0, nameLimit).trim() || id,
        ...(level === undefined ? {} : { level }),
        ...(rated ? { rating: { value, site } } : {}),
        ...(avatar === undefined ? {} : { avatar }),
    };
}

// Writes the fields that change, and keeps the others as the file has them, even those this version does not read.
function writeProfile(root: string, id: string, changes: Partial<ProfileFields>): void
{
    const { fields, body } = readFrontMatter(profileText(root, id));
    const written: Record<string, string | number | undefined> = { ...fields };

    if (changes.name !== undefined) {
        written.name = changes.name;
    }

    if ("level" in changes) {
        written.level = changes.level;
    }

    if ("rating" in changes) {
        written.rating = changes.rating?.value;
        written.site = changes.rating?.site;
    }

    if ("avatar" in changes) {
        written.avatar = changes.avatar;
    }

    writeAtomically(join(profileFolder(root, id), profileFile), writeFrontMatter(written, body));
}

// A profile that could not be made: its profile.md goes, and its folder only when nothing else is in it, such as games that could not go back.
function removeHalfMade(folder: string): void
{
    rmSync(join(folder, profileFile), { force: true });

    try {
        rmdirSync(folder);
    } catch {
        // Not empty: what it holds stays where the error says.
    }
}

function profileText(root: string, id: string): string
{
    try {
        return readFileSync(join(profileFolder(root, id), profileFile), "utf8");
    } catch {
        return "";
    }
}

/** A folder's name from the player's name: plain letters and digits, lower case, words joined by hyphens. */
function slugOf(name: string): string
{
    const slug = name.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+/, "").slice(0, 32).replace(/-+$/, "");
    return slug === "" ? "player" : slug;
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
