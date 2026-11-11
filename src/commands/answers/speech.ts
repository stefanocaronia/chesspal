// The player's language, which the AI is told once a chat when it is not English: the moves stay in SAN (D-87).
import { languageIn } from "../../profiles/index.ts";

/** The player's language by its English name when it is not English. */
export interface Speech
{
    language: string;
}

/** The player's speech, from the page's settings or the system's language; undefined in English, which the AI speaks unless told. */
export function speechOf(folder: string, systemLanguage: string | undefined): Speech | undefined
{
    const language = languageName(languageIn(folder, systemLanguage));
    return language === undefined ? undefined : { language };
}

/** What the AI is told of the player's speech once a chat (Priya); the moves are SAN in every language (D-87). */
export function speechLine({ language }: Speech): string
{
    return `The player speaks ${language}.`;
}

/** A language by its English name when it is not English (Italian), from the way the system or the page names it (it-IT, it). */
function languageName(language: string | undefined): string | undefined
{
    const code = language?.split(/[-_]/)[0]?.toLowerCase() ?? "";

    if (!/^[a-z]{2,3}$/.test(code) || code === "en" || code === "und") {
        return undefined;
    }

    const name = new Intl.DisplayNames(["en"], { type: "language" }).of(code);
    return name === undefined || name === code ? undefined : name;
}
