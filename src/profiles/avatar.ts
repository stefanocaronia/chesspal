// The player's own picture (D-45): an image in the profile's folder, put there by hand or sent from the page, which shows instead of a drawn avatar.
import { closeSync, openSync, readFileSync, readSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { writeAtomically } from "../games/index.ts";
import { profileFolder } from "./profiles.ts";

/** The types of image a profile takes, by the file names they have there. */
export const imageTypes = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" } as const;
export type ImageType = keyof typeof imageTypes;

/** The largest image the page may send: it sends a small one, made from the player's photo. */
export const sentImageLimit = 1024 * 1024;

/** The player's own image: its bytes, its type as its first bytes tell it, and a stamp that changes with it; undefined when there is none, or it is no image. */
export function ownImage(root: string, id: string): { bytes: Buffer; type: ImageType; stamp: string; } | undefined
{
    const found = ownImageFile(root, id);

    try {
        return found === undefined ? undefined : { bytes: readFileSync(found.path), type: found.type, stamp: found.stamp };
    } catch {
        return undefined;
    }
}

/** The stamp of the player's own image, which the page adds to its address; undefined when there is none. Only its first bytes are read. */
export function ownImageStamp(root: string, id: string): string | undefined
{
    return ownImageFile(root, id)?.stamp;
}

/** Saves an image the page sent as the player's own, in place of any other: a PNG, JPEG or WebP, as its first bytes tell, within the limit. */
export function saveOwnImage(root: string, id: string, bytes: Uint8Array): void
{
    const type = imageTypeOf(bytes);

    if (type === undefined) {
        throw new Error("The picture must be a PNG, JPEG or WebP image.");
    }

    if (bytes.length > sentImageLimit) {
        throw new Error(`The picture is ${Math.ceil(bytes.length / 1024)} KB: send one of ${sentImageLimit / 1024} KB at most.`);
    }

    const name = `avatar.${type}`;
    writeAtomically(join(profileFolder(root, id), name), bytes);
    removeOwnImage(root, id, name);
}

/** Removes the player's own images, but the one kept: a drawn avatar chosen on the page shows in their place. */
export function removeOwnImage(root: string, id: string, kept?: string): void
{
    for (const name of fileNames.filter((one) => one !== kept)) {
        rmSync(join(profileFolder(root, id), name), { force: true });
    }
}

/** An image's type by its first bytes: never by its name, which anything may have. */
export function imageTypeOf(bytes: Uint8Array): ImageType | undefined
{
    const starts = (signature: readonly number[], at = 0): boolean => signature.every((byte, index) => bytes[at + index] === byte);

    if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
        return "png";
    }

    if (starts([0xff, 0xd8, 0xff])) {
        return "jpg";
    }

    return starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8) ? "webp" : undefined;
}

function ownImageFile(root: string, id: string): { path: string; type: ImageType; stamp: string; } | undefined
{
    for (const name of fileNames) {
        const path = join(profileFolder(root, id), name);

        try {
            const { size, mtimeMs } = statSync(path);
            const type = size > keptImageLimit ? undefined : imageTypeOf(firstBytes(path));

            if (type !== undefined) {
                return { path, type, stamp: `${Math.trunc(mtimeMs)}-${size}` };
            }
        } catch {
            // No such file, or one that cannot be read: the next name.
        }
    }

    return undefined;
}

function firstBytes(path: string): Uint8Array
{
    const bytes = new Uint8Array(12);
    const file = openSync(path, "r");

    try {
        readSync(file, bytes, 0, bytes.length, 0);
    } finally {
        closeSync(file);
    }

    return bytes;
}

// The names the player's image may have in the profile's folder, the first found winning.
const fileNames = ["avatar.png", "avatar.jpg", "avatar.jpeg", "avatar.webp"];

// An image the player put in the folder by hand may be a photo as the camera took it, but not a huge file.
const keptImageLimit = 10 * 1024 * 1024;
