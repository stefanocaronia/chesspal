// The page's settings of a profile (D-56): settings.json in its folder, kept as the page sends them; the page checks each one as it reads them.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type Notation, notationOf } from "../core/index.ts";
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

/** Whether the player has turned the helps on (D-78), in the settings of the profile whose games are in `folder`: off without them. */
export function helpsIn(folder: string): boolean
{
    return settingsIn(folder)?.helps === true;
}

/**
 * The pieces' letters the player of the profile whose games are in `folder` writes moves with (D-83): English when chosen in the settings, else those of the
 * page's language, or of the system's when the page follows the browser.
 */
export function notationIn(folder: string, systemLanguage: string | undefined): Notation
{
    const settings = settingsIn(folder);
    const language = settings?.language;
    return settings?.englishNotation === true ? "en" : notationOf(typeof language === "string" && language !== "auto" ? language : systemLanguage);
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

/** The settings of the profile whose games are in `folder`; undefined without them. */
function settingsIn(folder: string): PageSettings | undefined
{
    try {
        return settingsOf(JSON.parse(readFileSync(join(folder, fileName), "utf8")));
    } catch {
        return undefined;
    }
}
