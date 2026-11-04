// The page's settings of a profile (D-56): settings.json in its folder, kept as the page sends them; the page checks each one as it reads them.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { writeAtomically } from "../games/index.ts";
import { profileFolder } from "./profiles.ts";

/** The page's settings, by name: text, numbers and flags. */
export type PageSettings = Readonly<Record<string, string | number | boolean>>;

/** A profile's settings, or undefined when it has none yet, or they cannot be read. */
export function profileSettings(root: string, id: string): PageSettings | undefined
{
    try {
        return settingsOf(JSON.parse(readFileSync(join(profileFolder(root, id), fileName), "utf8")));
    } catch {
        return undefined;
    }
}

/** Saves a profile's settings, over the ones before. */
export function saveProfileSettings(root: string, id: string, settings: PageSettings): void
{
    writeAtomically(join(profileFolder(root, id), fileName), `${JSON.stringify(settings, null, 2)}\n`);
}

/** Settings from what JSON gave: an object of text, numbers and flags, at most a few dozen; undefined for anything else. */
export function settingsOf(value: unknown): PageSettings | undefined
{
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return undefined;
    }

    const entries = Object.entries(value);
    const plain = entries.every(([, one]) => ["string", "number", "boolean"].includes(typeof one) && (typeof one !== "string" || one.length <= 64));
    return plain && entries.length <= 40 ? Object.fromEntries(entries) as PageSettings : undefined;
}

const fileName = "settings.json";
