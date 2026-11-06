// The profiles on the board page (D-23, D-45, D-56): who plays and their picture, the first profile completed by the wizard (D-71), another put in use, the settings kept,
// and the data folder they are in, opened in the system's file manager (T-119).
import type { IncomingMessage, ServerResponse } from "node:http";
import { homedir } from "node:os";
import { isAbsolute, relative, sep } from "node:path";
import { chooseDrawnAvatar, GameGoingOn, newProfile, useProfile } from "../commands/profiles.ts";
import { inputProblems } from "../commands/registry.ts";
import { activeProfile, drawnAvatars, imageTypes, listProfiles, ownImage, ownImageStamp, type PageSettings, type PlayerProfile, profileSettings, saveOwnImage, saveProfileSettings, sentImageLimit, settingsOf } from "../profiles/index.ts";
import { bodyOf, bytesOf, isJson, jsonOf, send, sendJson } from "./http.ts";
import type { Refused, Served } from "./page.ts";

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
    /** The data folder as the player finds it, folder by folder from their own (T-119): OneDrive, Documenti, My Games, Chesspal. */
    readonly dataFolder: readonly string[];
}

/** The profiles of the data folder, as the page shows them. */
export function profilesShown(root: string, userFolder = homedir()): ProfilesShown
{
    const active = activeProfile(root);
    const profiles = listProfiles(root).map((profile) => shown(root, profile));
    const settings = profileSettings(root, active.id);
    const profile = profiles.find(({ id }) => id === active.id)!;
    const dataFolder = foldersOf(root, userFolder);
    return settings === undefined ? { profile, profiles, dataFolder } : { profile, profiles, settings, dataFolder };
}

/** Answers the page's requests about profiles: true when the request was one. A file that cannot be written is told to the page, and the server goes on. */
export function answerProfiles(request: IncomingMessage, response: ServerResponse, url: URL, served: Served): boolean
{
    const route = routes[`${request.method ?? ""} ${url.pathname}`];

    if (route === undefined) {
        return false;
    }

    Promise.resolve().then(() => route(request, response, served, url)).catch((error: unknown) => {
        if (response.headersSent) {
            response.end();
        } else {
            sendJson(response, 500, { error: (error as Error).message });
        }
    });
    return true;
}

type Route = (request: IncomingMessage, response: ServerResponse, served: Served, url: URL) => void | Promise<void>;

const routes: Readonly<Record<string, Route>> = {
    "POST /api/profile/new": newProfileFromPage,
    "POST /api/profile/use": useProfileFromPage,
    "POST /api/profile/avatar": drawnAvatarFromPage,
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

/** Another profile put in use from the menu, once the game going on has ended: the chat is not woken for it (D-66). */
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

/** The player's own image for the profile the page shows, as the page made it from their photo: a PNG, JPEG or WebP of 1 MB at most. */
async function imageFromPage(request: IncomingMessage, response: ServerResponse, served: Served, url: URL): Promise<void>
{
    const type = request.headers["content-type"] ?? "";

    // An image sent from another site would need the browser to ask first, which this server never allows.
    if (!Object.values(imageTypes).some((one) => type.startsWith(one))) {
        sendJson(response, 415, { error: "Send the picture as a PNG, JPEG or WebP image." });
        return;
    }

    const bytes = await bytesOf(request, sentImageLimit);
    const profile = profileInUse(served, url, response);

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
function sendImage(_request: IncomingMessage, response: ServerResponse, served: Served, url: URL): void
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

/** The data folder in the system's file manager (T-119): asked as JSON, which another site cannot send without the browser asking first. */
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

    if (!(await open(served.context.home()))) {
        sendJson(response, 500, { error: "No file manager could open the data folder: the page shows its path." });
        return;
    }

    sendJson(response, 200, { opened: true });
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

function shown(root: string, profile: PlayerProfile): ProfileShown
{
    const image = ownImageStamp(root, profile.id);
    return image === undefined ? profile : { ...profile, image };
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
