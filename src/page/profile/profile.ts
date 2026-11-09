// The player's profile on the page (D-23, D-45): as the server sends it, the choices the wizard offers, and the requests that change it.

/** How the player says they play, as the server keeps it. */
export const levels = ["learning", "casual", "regular", "tournament"] as const;
export type Level = (typeof levels)[number];

/** Where a rating comes from. */
export const ratingSites = ["lichess", "chess.com", "fide"] as const;
export type RatingSite = (typeof ratingSites)[number];

/** The lowest and highest rating the server takes. */
export const ratingLimits = { lowest: 100, highest: 3500 } as const;

/** The longest name the server keeps. */
export const nameLimit = 40;

/** The drawn avatars, by the ids the server keeps (D-45). */
export const avatarIds = ["short-hair", "bun", "glasses", "beanie", "beard", "curls", "moustache", "silver-bob", "cat", "owl"] as const;
export type AvatarId = (typeof avatarIds)[number];

/** A profile as the server sends it: its id, the player's name, how they play, their rating, a drawn avatar, and their own image's stamp when they have one. */
export interface ProfileShown
{
    readonly id: string;
    readonly name: string;
    /** Made by Chesspal at the first start, until the wizard completes it (D-71). */
    readonly new?: true;
    readonly level?: Level;
    readonly rating?: { readonly value: number; readonly site: RatingSite; };
    readonly avatar?: AvatarId;
    readonly image?: string;
    /** The player's names on Lichess and chess.com, written in profile.md (D-93). */
    readonly accounts?: { readonly lichess?: string; readonly chesscom?: string; };
}

/** What the wizard asks: the name, how the player plays, a rating and its site, a drawn avatar or a photo of theirs. */
export interface NewProfile
{
    readonly name: string;
    readonly level: Level;
    readonly rating?: number;
    readonly site: RatingSite;
    readonly avatar?: AvatarId;
    readonly photo?: File;
    /** False to make it without putting it in use, while a game goes on. */
    readonly use?: boolean;
}

/** A request the server refused: its words, and its code when the page says it in the player's language. */
export interface Refused
{
    readonly error: string;
    readonly refusal?: string;
}

/** The address of a profile's own image: it changes with the image. */
export function imageAddress(profile: ProfileShown): string | undefined
{
    return profile.image === undefined ? undefined : `/api/profile/image?profile=${encodeURIComponent(profile.id)}&v=${encodeURIComponent(profile.image)}`;
}

/** Makes a profile, in use unless `use` is false, with the photo after it, made small first so that a photo that cannot be read makes no profile: the refusal, or undefined. */
export async function makeProfile({ name, level, rating, site, avatar, photo, use }: NewProfile): Promise<Refused | undefined>
{
    const image = photo === undefined ? undefined : await shrunk(photo).catch(() => undefined);

    if (photo !== undefined && image === undefined) {
        return badImage;
    }

    const answer = await post("/api/profile/new", jsonOf({ name: name.trim(), level, ...(rating === undefined ? {} : { rating, site }), ...(avatar === undefined ? {} : { avatar }), ...(use === false ? { use } : {}) }));

    if ("refused" in answer) {
        return answer.refused;
    }

    return image === undefined ? undefined : refusalOf(await post(forProfile("/api/profile/image", String(answer.done.profile)), imageOf(image)));
}

/** Puts another profile in use: the server's refusal, or undefined. */
export async function useProfile(id: string): Promise<Refused | undefined>
{
    return refusalOf(await post("/api/profile/use", jsonOf({ profile: id })));
}

/** A drawn avatar for the profile the page shows: the server's refusal, or undefined. */
export async function chooseAvatar(profile: string, avatar: AvatarId): Promise<Refused | undefined>
{
    return refusalOf(await post(forProfile("/api/profile/avatar", profile), jsonOf({ avatar })));
}

/** The player's names on Lichess and chess.com for the profile the page shows, an empty one removed: the server's refusal, or undefined. */
export async function saveAccounts(profile: string, accounts: { readonly lichess: string; readonly chesscom: string; }): Promise<Refused | undefined>
{
    return refusalOf(await post(forProfile("/api/profile/accounts", profile), jsonOf({ lichess: accounts.lichess.trim(), chesscom: accounts.chesscom.trim() })));
}

/** Opens the data folder in the system's file manager, where the page runs: the server's refusal, or undefined. */
export async function openDataFolder(): Promise<Refused | undefined>
{
    return refusalOf(await post("/api/data-folder/open", jsonOf({})));
}

/** Keeps the page's settings in the profile the page shows, so that they follow the player; the browser keeps them too. */
export function keepSettings(profile: string, settings: object): void
{
    void post(forProfile("/api/settings", profile), jsonOf(settings));
}

/** A photo of the player's, made small and square in the browser, sent as the picture of the profile the page shows: the refusal, or undefined. */
export async function sendPhoto(profile: string, photo: File): Promise<Refused | undefined>
{
    const image = await shrunk(photo).catch(() => undefined);
    return image === undefined ? badImage : refusalOf(await post(forProfile("/api/profile/image", profile), imageOf(image)));
}

// The side of the square picture sent: twice the largest the page shows it.
const pictureSide = 192;

const badImage: Refused = { error: "", refusal: "bad-image" };

// What the server answered: what it sent back, or why it refused.
type Answer = { readonly done: Record<string, unknown>; } | { readonly refused: Refused; };

// The square taken from a photo: the middle across, and a third of the way down, where a face usually is.
async function shrunk(photo: File): Promise<Blob>
{
    const bitmap = await createImageBitmap(photo);
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = pictureSide;
    canvas.height = pictureSide;
    canvas.getContext("2d")!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 3, side, side, 0, 0, pictureSide, pictureSide);
    bitmap.close();
    // A browser that cannot write WebP writes PNG.
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/webp", 0.9));

    if (blob === null) {
        throw new Error("The picture could not be made.");
    }

    return blob;
}

// A request about the profile the page shows: the server refuses it when another is in use.
function forProfile(path: string, profile: string): string
{
    return `${path}?profile=${encodeURIComponent(profile)}`;
}

function jsonOf(body: object): RequestInit
{
    return { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function imageOf(image: Blob): RequestInit
{
    return { headers: { "Content-Type": image.type }, body: image };
}

async function post(path: string, request: RequestInit): Promise<Answer>
{
    let response: Response;

    try {
        response = await fetch(path, { method: "POST", ...request });
    } catch (error) {
        return { refused: { error: String(error) } };
    }

    const body = await response.json().catch(() => ({})) as Record<string, unknown>;

    if (response.ok) {
        return { done: body };
    }

    const error = typeof body.error === "string" ? body.error : response.statusText;
    return { refused: typeof body.refusal === "string" ? { error, refusal: body.refusal } : { error } };
}

function refusalOf(answer: Answer): Refused | undefined
{
    return "refused" in answer ? answer.refused : undefined;
}
