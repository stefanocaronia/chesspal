// The players' profiles (D-23), on the command line and the board page: listed, made, changed, put in use, with their picture (D-45). The AI reads only who plays.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { endOf } from "../games/index.ts";
import {
    type Accounts,
    activateProfile,
    activeProfile,
    createProfile,
    type DrawnAvatar,
    drawnAvatars,
    gameFolder,
    type Level,
    levels,
    listProfiles,
    nameLimit,
    type PlayerProfile,
    type Rating,
    type RatingSite,
    removeOwnImage,
    saveOwnImage,
    updateProfile,
} from "../profiles/index.ts";
import { gameAt } from "./clock.ts";
import type { Context } from "./context.ts";
import { refreshRatings } from "./ratings.ts";
import { defineCommand } from "./registry.ts";

/** A change of profile refused while a game goes on: the page says it in the player's language. */
export class GameGoingOn extends Error
{
    constructor()
    {
        super("A game is going on in this profile: finish it, or resign, before changing profile. Nothing changed.");
    }
}

/** The profiles, the one in use first. */
export const profiles = defineCommand({
    name: "profiles",
    description: "Lists the players' profiles, the one in use marked with *. Example: chesspal profiles.",
    input: z.object({}),
    cliOnly: true,
    readOnly: true,
    idempotent: true,
    run: (input, context): { profiles: PlayerProfile[]; active: string; } => ({ profiles: listProfiles(context.home()), active: activeProfile(context.home()).id }),
    format: ({ profiles, active }) => profiles.map((profile) => `${profile.id === active ? "*" : " "} ${profile.id}: ${playerText(profile)}`).join("\n"),
});

/**
 * A new profile, put in use unless asked not to; while a game goes on it is made all the same and waits, the player in use staying. The one Chesspal made at
 * the first start, while new, becomes it, game and all (D-71). With the player's names on Lichess and Chess.com, their ratings are read there (D-106).
 */
export const newProfile = defineCommand({
    name: "new_profile",
    description: "Makes a player's profile and puts it in use, unless --use false or a game is going on: their games, picture and page settings go in "
        + "profiles/<id>/ of Chesspal's data folder; the profile Chesspal made at the first start becomes this one, its folder renamed, while nobody has completed "
        + "it; their rating is read from their names on Lichess and Chess.com. Example: chesspal new_profile Anna --level regular --lichess anna_k.",
    input: z.object({
        name: playerName().describe("the player's name"),
        level: z.enum(levels).optional().describe("how they play: learning, casual, regular or tournament"),
        lichess: accountName().optional().describe("the player's name on Lichess"),
        chesscom: accountName().optional().describe("the player's name on Chess.com"),
        avatar: z.enum(drawnAvatars).optional().describe(`a drawn avatar: ${drawnAvatars.join(", ")}`),
        use: z.boolean().optional().describe("false to make it without putting it in use"),
    }),
    cliOnly: true,
    positionals: ["name"],
    run: async ({ name, level, lichess, chesscom, avatar, use }, context): Promise<PlayerProfile & { readonly inUse: boolean; }> => {
        const first = activeProfile(context.home()).new === true;
        const inUse = first || (use !== false && !isPlaying(context));
        const made = createProfile(context.home(), { name, ...(level === undefined ? {} : { level }), ...(avatar === undefined ? {} : { avatar }) }, inUse);
        const accounts = accountsOf(lichess ?? "", chesscom ?? "");
        const profile = Object.keys(accounts).length === 0 ? made : await withRatings(context, updateProfile(context.home(), made.id, { accounts }));
        return { ...profile, inUse };
    },
    format: (profile) => `Profile ${profile.id} made${profile.inUse ? ", and in use" : ", not in use"}: ${playerText(profile)}.`,
});

/** Another profile put in use, once the game going on has ended. */
export const useProfile = defineCommand({
    name: "use_profile",
    description: "Puts another player's profile in use, with its games; refused while a game is going on. Example: chesspal use_profile anna.",
    input: z.object({ profile: z.string().min(1).describe("the profile, as chesspal profiles lists it") }),
    cliOnly: true,
    idempotent: true,
    positionals: ["profile"],
    run: ({ profile }, context): PlayerProfile => {
        const active = activeProfile(context.home());

        if (active.id === profile) {
            return active;
        }

        refuseWhilePlaying(context);
        return activateProfile(context.home(), profile);
    },
    format: (profile) => `Profile ${profile.id} in use: ${playerText(profile)}.`,
});

/** The picture of the profile in use: a drawn avatar, or an image of the player's, which replaces any before. */
export const setAvatar = defineCommand({
    name: "set_avatar",
    description: `Sets the picture of the profile in use: a drawn avatar (${drawnAvatars.join(", ")}) or the path of a PNG, JPEG or WebP image of `
        + "1 MB at most. Example: chesspal set_avatar owl.",
    input: z.object({ avatar: z.string().min(1).describe("a drawn avatar, or the path of an image") }),
    cliOnly: true,
    idempotent: true,
    positionals: ["avatar"],
    run: ({ avatar }, context): { profile: string; avatar: string; } => {
        const profile = activeProfile(context.home());
        const drawn = drawnAvatars.find((one) => one === avatar);

        if (drawn === undefined) {
            saveOwnImage(context.home(), profile.id, imageFile(resolve(context.folder, avatar)));
        } else {
            chooseDrawnAvatar(context, profile.id, drawn);
        }

        return { profile: profile.id, avatar };
    },
    format: ({ profile, avatar }) => `The picture of ${profile} is ${avatar}.`,
});

/**
 * What the player tells of themselves in the profile in use: their name, how they play, and their names on Lichess and Chess.com, by which the games they
 * load are theirs (D-93). Each one given is written, an empty one goes; the profile's folder keeps its name (D-106).
 */
export const editProfile = defineCommand({
    name: "edit_profile",
    description: "Changes the profile in use: the player's name, how they play, and their names on Lichess and Chess.com, by which a game loaded from there is "
        + "theirs; an empty level or site name removes it, and the profile keeps its folder. Example: chesspal edit_profile --name Anna --level regular --lichess anna_k.",
    input: z.object({
        name: playerName().optional().describe("the player's name"),
        level: z.union([z.enum(levels), z.literal("")]).optional().describe("how they play: learning, casual, regular or tournament; empty to remove it"),
        lichess: accountName().optional().describe("the player's name on Lichess"),
        chesscom: accountName().optional().describe("the player's name on Chess.com"),
    }),
    cliOnly: true,
    idempotent: true,
    run: async ({ name, level, lichess, chesscom }, context): Promise<PlayerProfile> => {
        const profile = activeProfile(context.home());
        const named = lichess !== undefined || chesscom !== undefined;
        const edited = updateProfile(context.home(), profile.id, {
            ...(name === undefined ? {} : { name }),
            ...(level === undefined ? {} : { level: level === "" ? undefined : level }),
            ...(named ? { accounts: accountsOf(lichess ?? profile.accounts?.lichess ?? "", chesscom ?? profile.accounts?.chesscom ?? "") } : {}),
        });
        return named ? withRatings(context, edited) : edited;
    },
    format: (profile) => `Profile ${profile.id}: ${playerText(profile)}; ${accountsText(profile.accounts)}.`,
});

/** A drawn avatar chosen for a profile: the player's own image goes, or it would still show. */
export function chooseDrawnAvatar(context: Context, id: string, avatar: DrawnAvatar): void
{
    updateProfile(context.home(), id, { avatar });
    removeOwnImage(context.home(), id);
}

/**
 * Who plays, as the AI reads it in status and new_game: their name, how they play and their rating; nothing while the profile is new, named after the
 * system's account until the player completes it (D-71).
 */
export function playerLine(context: Context): string | undefined
{
    const profile = activeProfile(context.home());
    return profile.new === true ? undefined : `Player: ${playerText(profile)}.`;
}

/** How the AI reads a rating: the number as the site gives it, its speed and site, and the month of the last game there (D-106). */
export function ratingText({ value, speed, site, played }: Rating): string
{
    return `${value} ${speed} on ${siteText[site]}${played === undefined ? "" : ` (last game ${played.slice(0, 7)})`}`;
}

/** Throws while a game goes on in the profile in use. */
function refuseWhilePlaying(context: Context): void
{
    if (isPlaying(context)) {
        throw new GameGoingOn();
    }
}

function isPlaying(context: Context): boolean
{
    const current = gameAt(gameFolder(context.home()), context.now());
    return current !== undefined && endOf(current.game) === undefined;
}

const levelText: Readonly<Record<Level, string>> = { learning: "has just learned", casual: "plays now and then", regular: "plays often", tournament: "plays tournaments" };
const siteText: Readonly<Record<RatingSite, string>> = { "lichess": "Lichess", "chess.com": "Chess.com" };

function playerText({ name, level, rating }: PlayerProfile): string
{
    return [name, ...(level === undefined ? [] : [levelText[level]]), ...(rating === undefined ? [] : [`rated ${ratingText(rating)}`])].join(", ");
}

/** The profile once its names on the sites have been read, when they changed: the command line and the page wait for the sites, at most a few seconds. */
async function withRatings(context: Context, profile: PlayerProfile): Promise<PlayerProfile>
{
    const read = await refreshRatings(context, profile.id);
    return read ? listProfiles(context.home()).find(({ id }) => id === profile.id) ?? profile : profile;
}

/** The player's name: one line of text. */
function playerName(): z.ZodString
{
    return z.string().trim().min(1).max(nameLimit).regex(/^[^\p{Cc}]+$/u, "one line of text");
}

/** A name on Lichess or Chess.com: their letters, digits, underscores and hyphens; empty to remove it. */
function accountName(): z.ZodString
{
    return z.string().trim().max(nameLimit).regex(/^[\w-]*$/, "A name on Lichess or Chess.com has only letters, digits, underscores and hyphens.");
}

function accountsOf(lichess: string, chesscom: string): Accounts
{
    return { ...(lichess === "" ? {} : { lichess }), ...(chesscom === "" ? {} : { chesscom }) };
}

function accountsText(accounts: Accounts | undefined): string
{
    const named = [...(accounts?.lichess === undefined ? [] : [`${accounts.lichess} on Lichess`]), ...(accounts?.chesscom === undefined ? [] : [`${accounts.chesscom} on Chess.com`])];
    return named.length === 0 ? "on neither Lichess nor Chess.com" : named.join(" and ");
}

function imageFile(path: string): Buffer
{
    try {
        return readFileSync(path);
    } catch (error) {
        throw new Error(`${path} cannot be read (${(error as Error).message}): give a drawn avatar's name, or the path of an image. Nothing changed.`, { cause: error });
    }
}
