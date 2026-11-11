// The profiles on the board page (D-23, D-45, D-56): who plays and their picture, the first profile completed by the wizard (D-71), the one in use changed, another put in use, the settings kept,
// and the data folder they are in, opened in the system's file manager.
import type { IncomingMessage, ServerResponse } from "node:http";
import { homedir } from "node:os";
import { isAbsolute, relative, sep } from "node:path";
import { chooseDrawnAvatar, editProfile, GameGoingOn, inputProblems, newProfile, ratingsAge, refreshRatings, useProfile } from "../../commands/index.ts";
import {
    activeProfile,
    drawnAvatars,
    imageTypes,
    listProfiles,
    ownImage,
    ownImageStamp,
    type PageSettings,
    type PlayerProfile,
    profileFolder,
    profileSettings,
    saveOwnImage,
    saveProfileSettings,
    sentImageLimit,
    settingsOf,
} from "../../profiles/index.ts";
import { bodyOf, bytesOf, isJson, jsonOf, type Refused, runRoute, send, sendJson } from "./http.ts";
import type { Served } from "./page.ts";

/** A profile as the page shows it: the player's own image by its stamp, which changes its address when it changes. */
export interface ProfileShown extends PlayerProfile
{
    readonly image?: string;
}

/** The profiles as the page reads them with the game: the one in use and its settings, all of them for the menu, and where they are. */
export interface ProfilesShown
{
    readonly profile: ProfileShown;
    readonly profiles: ProfileShown[];
    readonly settings?: PageSettings;
    /** Where the player's games are, folder by folder from their own: OneDrive, Documenti, My Games, Chesspal, profiles, stefano. */
    readonly dataFolder: readonly string[];
}

/** The profiles of the data folder, as the page shows them. */
export function profilesShown(root: string, userFolder = homedir()): ProfilesShown
{
    const active = activeProfile(root);
    const profiles = listProfiles(root).map((profile) => shown(root, profile));
    const settings = profileSettings(root, active.id);
    const profile = profiles.find(({ id }) => id === active.id)!;
    const dataFolder = foldersOf(playerFolder(root), userFolder);
    return settings === undefined ? { profile, profiles, dataFolder } : { profile, profiles, settings, dataFolder };
}

/** Answers the page's requests about profiles: true when the request was one. A file that cannot be written is told to the page, and the server goes on. */
export function answerProfiles(request: IncomingMessage, response: ServerResponse, url: URL, served: Served): boolean
{
    const route = routes[`${request.method ?? ""} ${url.pathname}`];

    if (route === undefined) {
        return false;
    }

    runRoute(response, () => route(request, response, served, url));
    return true;
}

type Route = (request: IncomingMessage, response: ServerResponse, served: Served, url: URL) => void | Promise<void>;

const routes: Readonly<Record<string, Route>> = {
    "POST /api/profile/new": newProfileFromPage,
    "POST /api/profile/use": useProfileFromPage,
    "POST /api/profile/avatar": drawnAvatarFromPage,
    "POST /api/profile/edit": editFromPage,
    "POST /api/profile/image": imageFromPage,
    "GET /api/profile/image": sendImage,
    "POST /api/settings": settingsFromPage,
    "POST /api/data-folder/open": openDataFolder,
};

/** A new profile from the menu, put in use, or the first completed by the wizard: the chat reads who plays at its next call, never woken for it (D-66). */
async function newProfileFromPage(request: IncomingMessage, response: ServerResponse, served: Served): Promise<void>
{
    const body = isJson(request) ? jsonOf(await bodyOf(request)) : undefined;
    const input = newProfile.input.safeParse(body ?? {});

    if (body === undefined || !input.success) {
        const problems = input.success ? "" : ` ${inputProblems("new_profile", input.error.issues, body ?? {}, (name) => name)}`;
        sendJson(response, 400, { error: `Send the profile as JSON, {"name": "…", "level": "regular"}.${problems}` });
        return;
    }

    try {
        const profile = await newProfile.run(input.data, served.context);
        sendJson(response, 200, { profile: profile.id });
    } catch (error) {
        sendJson(response, 409, refusalOf(error));
    }
}

/** Another profile put in use from the menu, once the game going on has ended: the chat is not woken for it (D-66); its ratings are read again after a day (D-106). */
async function useProfileFromPage(request: IncomingMessage, response: ServerResponse, served: Served): Promise<void>
{
    const profile = isJson(request) ? jsonOf(await bodyOf(request))?.profile : undefined;

    if (typeof profile !== "string") {
        sendJson(response, 400, { error: 'Send the profile as JSON: {"profile": "anna"}.' });
        return;
    }

    try {
        useProfile.run({ profile }, served.context);
    } catch (error) {
        sendJson(response, 409, refusalOf(error));
        return;
    }

    sendJson(response, 200, { profile });
    readRatingsOf(served, profile);
}

/** A drawn avatar for the profile the page shows, in place of the player's own image. */
async function drawnAvatarFromPage(request: IncomingMessage, response: ServerResponse, served: Served, url: URL): Promise<void>
{
    const avatar = isJson(request) ? jsonOf(await bodyOf(request))?.avatar : undefined;
    const drawn = drawnAvatars.find((one) => one === avatar);
    const profile = profileInUse(served, url, response);

    if (profile === undefined) {
        return;
    }

    if (drawn === undefined) {
        sendJson(response, 400, { error: `Send a drawn avatar as JSON: {"avatar": "owl"}, one of ${drawnAvatars.join(", ")}.` });
        return;
    }

    chooseDrawnAvatar(served.context, profile.id, drawn);
    sendJson(response, 200, { avatar: drawn });
}

/**
 * What the player changes in the profile window for the profile the page shows, in a game or in analysis too: their name, how they play, their names on
 * Lichess and chess.com (D-93), each saved once changed; the profile keeps its folder (D-106).
 */
async function editFromPage(request: IncomingMessage, response: ServerResponse, served: Served, url: URL): Promise<void>
{
    const body = isJson(request) ? jsonOf(await bodyOf(request)) : undefined;
    const input = editProfile.input.safeParse(body ?? {});
    const profile = profileInUse(served, url, response);

    if (profile === undefined) {
        return;
    }

    if (body === undefined || !input.success) {
        const problems = input.success ? "" : ` ${inputProblems("edit_profile", input.error.issues, body ?? {}, (name) => name)}`;
        sendJson(response, 400, { error: `Send the changes as JSON, {"name": "…", "level": "regular", "lichess": "…", "chesscom": "…"}.${problems}` });
        return;
    }

    const edited = await editProfile.run(input.data, served.context);
    sendJson(response, 200, { profile: shown(served.context.home(), edited) });
}

/**
 * The player's own image for a profile, as the page made it from their photo: a PNG, JPEG or WebP of 1 MB at most. The one in use, or one just added while a
 * game goes on, which waits for it to end.
 */
async function imageFromPage(request: IncomingMessage, response: ServerResponse, served: Served, url: URL): Promise<void>
{
    const type = request.headers["content-type"] ?? "";

    // An image sent from another site would need the browser to ask first, which this server never allows.
    if (!Object.values(imageTypes).some((one) => type.startsWith(one))) {
        sendJson(response, 415, { error: "Send the picture as a PNG, JPEG or WebP image." });
        return;
    }

    const bytes = await bytesOf(request, sentImageLimit);
    const profile = profileNamed(served, url, response);

    if (profile === undefined) {
        return;
    }

    if (bytes === undefined) {
        sendJson(response, 413, { error: `Send a picture of ${sentImageLimit / 1024} KB at most.` });
        return;
    }

    try {
        saveOwnImage(served.context.home(), profile.id, bytes);
    } catch (error) {
        sendJson(response, 400, { error: (error as Error).message });
        return;
    }

    sendJson(response, 200, { image: ownImageStamp(served.context.home(), profile.id) });
}

/** A profile's own image, by its id: only a profile of this folder's, only an image. */
function sendImage(request: IncomingMessage, response: ServerResponse, served: Served, url: URL): void
{
    const id = url.searchParams.get("profile");
    const profile = listProfiles(served.context.home()).find((one) => one.id === id);
    const image = profile === undefined ? undefined : ownImage(served.context.home(), profile.id);

    if (image === undefined) {
        send(response, 404, "text/plain; charset=utf-8", "No picture.");
        return;
    }

    // The address changes with the image: the browser may keep it.
    send(response, 200, imageTypes[image.type], image.bytes, { "Cache-Control": "max-age=31536000, immutable" });
}

/** The page's settings, kept in the profile the page shows so that they follow the player (D-56). */
async function settingsFromPage(request: IncomingMessage, response: ServerResponse, served: Served, url: URL): Promise<void>
{
    const settings = settingsOf(isJson(request) ? jsonOf(await bodyOf(request)) : undefined);
    const profile = profileInUse(served, url, response);

    if (profile === undefined) {
        return;
    }

    if (settings === undefined) {
        sendJson(response, 400, { error: "Send the settings as a JSON object." });
        return;
    }

    saveProfileSettings(served.context.home(), profile.id, settings);
    sendJson(response, 200, { saved: true });
}

/** The data folder in the system's file manager: asked as JSON, which another site cannot send without the browser asking first. */
async function openDataFolder(request: IncomingMessage, response: ServerResponse, served: Served): Promise<void>
{
    const asked = isJson(request) ? jsonOf(await bodyOf(request)) : undefined;
    const open = served.context.openFolder;

    if (asked === undefined) {
        sendJson(response, 400, { error: "Send {} as JSON to open the data folder." });
        return;
    }

    if (open === undefined) {
        sendJson(response, 501, { error: "This server opens no folder: the page shows its path." });
        return;
    }

    if (!(await open(playerFolder(served.context.home())))) {
        sendJson(response, 500, { error: "No file manager could open the data folder: the page shows its path." });
        return;
    }

    sendJson(response, 200, { opened: true });
}

/**
 * Reads the ratings of a profile, the one in use unless named, again a day after the last reading, while the page goes on: the pages hear of them from the
 * watcher (D-106).
 */
export function readRatingsOf(served: Served, id?: string): void
{
    try {
        void refreshRatings(served.context, id ?? activeProfile(served.context.home()).id, ratingsAge).catch(() => false);
    } catch {
        // No data folder yet: the page says why as it loads.
    }
}

/**
 * The profile in use, when it is the one the page shows (?profile=): a page that has not yet heard of another put in use elsewhere is refused, so that its
 * choices never go to the wrong player.
 */
function profileInUse(served: Served, url: URL, response: ServerResponse): PlayerProfile | undefined
{
    const active = activeProfile(served.context.home());
    const shownId = url.searchParams.get("profile");

    if (active.id === shownId) {
        return active;
    }

    sendJson(response, 409, { error: `The page shows the profile ${shownId ?? "of nobody"}, but ${active.id} is in use now: load the page again.` });
    return undefined;
}

/** The profile the request names (?profile=), in use or not: the page names it on purpose. */
function profileNamed(served: Served, url: URL, response: ServerResponse): PlayerProfile | undefined
{
    const id = url.searchParams.get("profile");
    const profile = listProfiles(served.context.home()).find((one) => one.id === id);

    if (profile === undefined) {
        sendJson(response, 404, { error: `There is no profile ${id ?? "named"}: load the page again.` });
    }

    return profile;
}

function shown(root: string, profile: PlayerProfile): ProfileShown
{
    const image = ownImageStamp(root, profile.id);
    return image === undefined ? profile : { ...profile, image };
}

/**
 * Where the player in use keeps their games, those played and those loaded: their profile's folder; the data folder while the first profile is new, since
 * its folder takes the player's name once they complete it (D-71).
 */
function playerFolder(root: string): string
{
    const active = activeProfile(root);
    return active.new === true ? root : profileFolder(root, active.id);
}

/** A folder's names from the user's own folder, as the file manager walks there; from its drive or root when it is elsewhere. */
function foldersOf(folder: string, userFolder: string): string[]
{
    const inside = relative(userFolder, folder);
    const outside = inside === "" || inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside);
    const walked = outside ? folder : inside;
    return walked.split(/[\\/]+/).filter((name) => name !== "");
}

function refusalOf(error: unknown): Refused
{
    const message = (error as Error).message;
    return error instanceof GameGoingOn ? { error: message, refusal: "profile-game" } : { error: message };
}
