// The players' profiles (D-23), on the command line and the board page: listed, made, put in use, with their picture (D-45). The AI reads only who plays.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { endOf } from "../games/index.ts";
import {
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
    ratingLimits,
    type RatingSite,
    ratingSites,
    removeOwnImage,
    saveOwnImage,
    updateProfile,
} from "../profiles/index.ts";
import { gameAt } from "./clock.ts";
import type { Context } from "./context.ts";
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
    description: "Lists the players' profiles in this folder, the one in use marked with *. Example: chesspal profiles.",
    input: z.object({}),
    cliOnly: true,
    readOnly: true,
    idempotent: true,
    run: (_input, context): { profiles: PlayerProfile[]; active?: string; } => {
        const active = activeProfile(context.folder)?.id;
        return active === undefined ? { profiles: [] } : { profiles: listProfiles(context.folder), active };
    },
    format: ({ profiles, active }) =>
        profiles.length === 0
            ? "No profile yet: make one with chesspal new_profile <name>, or on the board page."
            : profiles.map((profile) => `${profile.id === active ? "*" : " "} ${profile.id}: ${playerText(profile)}`).join("\n"),
});

/** A new profile, put in use: the first takes the games played before; another waits for the game going on to end. */
export const newProfile = defineCommand({
    name: "new_profile",
    description: "Makes a player's profile and puts it in use: their games, picture and page settings go in profiles/<id>/, and the first profile takes the "
        + "games played before. Example: chesspal new_profile Anna --level regular --rating 1450 --site lichess.",
    input: z.object({
        name: z.string().trim().min(1).max(nameLimit).regex(/^[^\p{Cc}]+$/u, "one line of text").describe("the player's name"),
        level: z.enum(levels).optional().describe("how they play: learning, casual, regular or tournament"),
        rating: z.int().min(ratingLimits.lowest).max(ratingLimits.highest).optional().describe("their rating, with site"),
        site: z.enum(ratingSites).optional().describe("where the rating comes from: lichess, chess.com or fide"),
        avatar: z.enum(drawnAvatars).optional().describe(`a drawn avatar: ${drawnAvatars.join(", ")}`),
    }),
    cliOnly: true,
    positionals: ["name"],
    run: ({ name, level, rating, site, avatar }, context): PlayerProfile => {
        if ((rating === undefined) !== (site === undefined)) {
            throw new Error("Give the rating and its site together, such as --rating 1450 --site lichess, or neither. Nothing changed.");
        }

        if (activeProfile(context.folder) !== undefined) {
            refuseWhilePlaying(context);
        }

        return createProfile(context.folder, {
            name,
            ...(level === undefined ? {} : { level }),
            ...(rating === undefined || site === undefined ? {} : { rating: { value: rating, site } }),
            ...(avatar === undefined ? {} : { avatar }),
        });
    },
    format: (profile) => `Profile ${profile.id} made, and in use: ${playerText(profile)}.`,
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
        const active = activeProfile(context.folder);

        if (active?.id === profile) {
            return active;
        }

        refuseWhilePlaying(context);
        return activateProfile(context.folder, profile);
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
        const profile = activeProfile(context.folder);

        if (profile === undefined) {
            throw new Error("There is no profile yet: make one with chesspal new_profile <name>. Nothing changed.");
        }

        const drawn = drawnAvatars.find((one) => one === avatar);

        if (drawn === undefined) {
            saveOwnImage(context.folder, profile.id, imageFile(resolve(context.folder, avatar)));
        } else {
            chooseDrawnAvatar(context, profile.id, drawn);
        }

        return { profile: profile.id, avatar };
    },
    format: ({ profile, avatar }) => `The picture of ${profile} is ${avatar}.`,
});

/** A drawn avatar chosen for a profile: the player's own image goes, or it would still show. */
export function chooseDrawnAvatar(context: Context, id: string, avatar: DrawnAvatar): void
{
    updateProfile(context.folder, id, { avatar });
    removeOwnImage(context.folder, id);
}

/** Who plays, as the AI reads it in status and new_game: their name, how they play and their rating; none without a profile. */
export function playerLine(context: Context): string | undefined
{
    const profile = activeProfile(context.folder);
    return profile === undefined ? undefined : `Player: ${playerText(profile)}.`;
}

/** Throws while a game goes on in the profile in use. */
export function refuseWhilePlaying(context: Context): void
{
    const current = gameAt(gameFolder(context.folder), context.now());

    if (current !== undefined && endOf(current.game) === undefined) {
        throw new GameGoingOn();
    }
}

const levelText: Readonly<Record<Level, string>> = { learning: "has just learned", casual: "plays now and then", regular: "plays often", tournament: "plays tournaments" };
const siteText: Readonly<Record<RatingSite, string>> = { "lichess": "Lichess", "chess.com": "Chess.com", "fide": "FIDE" };

function playerText({ name, level, rating }: PlayerProfile): string
{
    return [name, ...(level === undefined ? [] : [levelText[level]]), ...(rating === undefined ? [] : [`${siteText[rating.site]} ${rating.value}`])].join(", ");
}

function imageFile(path: string): Buffer
{
    try {
        return readFileSync(path);
    } catch (error) {
        throw new Error(`${path} cannot be read (${(error as Error).message}): give a drawn avatar's name, or the path of an image. Nothing changed.`, { cause: error });
    }
}
