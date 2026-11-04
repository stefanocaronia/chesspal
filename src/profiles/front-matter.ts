// A flat YAML front matter (D-9): one field a line, key: value, between two lines of ---, then the text below it, which stays as it was.

/** The fields of a markdown file's front matter, as text, and the text below it. */
export interface FrontMatter
{
    readonly fields: Readonly<Record<string, string>>;
    readonly body: string;
}

/** Reads a flat front matter: a value in double quotes as JSON writes it, any other as it stands; lines that are not key: value are left out. */
export function readFrontMatter(text: string): FrontMatter
{
    // An editor may begin the file with a byte-order mark.
    const match = /^﻿?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);

    if (match === null) {
        return { fields: {}, body: text };
    }

    const fields: Record<string, string> = {};

    for (const line of match[1]!.split(/\r?\n/)) {
        const field = /^([A-Za-z][\w-]*):\s*(.*?)\s*$/.exec(line);

        if (field !== null && field[2] !== "") {
            fields[field[1]!] = valueOf(field[2]!);
        }
    }

    return { fields, body: text.slice(match[0].length) };
}

/** Writes a flat front matter, its text values in double quotes so that any name reads back as it was, and the text below it. */
export function writeFrontMatter(fields: Readonly<Record<string, string | number | undefined>>, body = ""): string
{
    const lines = Object.entries(fields).flatMap(([key, value]) => (value === undefined ? [] : [`${key}: ${typeof value === "number" ? value : JSON.stringify(value)}`]));
    return `---\n${lines.join("\n")}\n---\n${body}`;
}

function valueOf(written: string): string
{
    if (written.startsWith('"')) {
        try {
            return String(JSON.parse(written));
        } catch {
            return written;
        }
    }

    return written.startsWith("'") && written.endsWith("'") && written.length > 1 ? written.slice(1, -1).replaceAll("''", "'") : written;
}
