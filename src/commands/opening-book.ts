// The book of the openings the build indexed (D-16), read once at the first lookup.
import { readFileSync } from "node:fs";
import { type GameRecord, type OpeningIndex, openingOf, outOfBookMove } from "../core/index.ts";

let book: OpeningIndex | null | undefined;
// Each record is looked up once: the live game keeps its record until a move changes it.
const lines = new WeakMap<GameRecord, string | null>();

/** The game's opening as the AI reads it: ECO and name, and the move it left the book at; none outside the book, or where the build made no index. */
export function openingLine(record: GameRecord): string | undefined
{
    let line = lines.get(record);

    if (line === undefined) {
        line = lineOf(record) ?? null;
        lines.set(record, line);
    }

    return line ?? undefined;
}

/** The opening a game reached, ECO and name, without where it left the book: for the games in the archive. */
export function openingName(record: GameRecord): string | undefined
{
    const index = openingIndex();
    const opening = index === undefined ? undefined : openingOf(record, index);
    return opening === undefined ? undefined : `${opening.eco} ${opening.name}`;
}

function lineOf(record: GameRecord): string | undefined
{
    const index = openingIndex();
    const opening = index === undefined ? undefined : openingOf(record, index);

    if (opening === undefined) {
        return undefined;
    }

    return `${opening.eco} ${opening.name}${opening.inBook ? "" : ` (out of book since move ${outOfBookMove(opening)})`}`;
}

function openingIndex(): OpeningIndex | undefined
{
    if (book === undefined) {
        try {
            book = JSON.parse(readFileSync(new URL("../../dist/core/openings.json", import.meta.url), "utf8")) as OpeningIndex;
        } catch {
            // Not built yet: the views go without the opening.
            book = null;
        }
    }

    return book ?? undefined;
}
