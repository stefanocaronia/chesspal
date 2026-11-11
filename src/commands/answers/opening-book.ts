// The book of the openings the build indexed (D-16), read once at the first lookup; the book's moves, only for a game at the master level (D-60).
import { readFileSync } from "node:fs";
import { bookMoves, Game, type GameRecord, inOpenings, type Opening, type OpeningBook, type OpeningIndex, openingOf, outOfBookMove } from "../../core/index.ts";

// The index of the named openings and the book of their moves, each read at its first lookup; null where the build made none.
let index: OpeningIndex | null | undefined;
let book: OpeningBook | null | undefined;
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

/** The moves the book knows from a position (D-15), for the AI at the master level; none out of the book, or where the build made no book. */
export function knownMoves(fen: string): readonly string[]
{
    const moves = openingBook();
    return moves === undefined ? [] : bookMoves(fen, moves);
}

/** How many plies from the start the book knows, to the last before the game left it (D-69); none from another position. */
export function bookPlies(record: GameRecord): number
{
    if (record.tags.FEN !== undefined) {
        return 0;
    }

    const game = new Game({ tags: record.tags, moves: [] });
    let plies = 0;

    for (const { san } of record.moves) {
        if (!game.playRecorded(san).played || !bookReaches(game.position.fen)) {
            break;
        }

        plies++;
    }

    return plies;
}

/** Whether a line of Lichess's openings reaches a position, by any order of moves (D-68); never where the build made no book. */
export function bookReaches(fen: string): boolean
{
    const named = openingIndex();
    const moves = openingBook();
    return named !== undefined && moves !== undefined && inOpenings(fen, named, moves);
}

/** The opening a game reached, ECO and name, without where it left the book: for the games in the archive. */
export function openingName(record: GameRecord): string | undefined
{
    const opening = bookOpening(record);
    return opening === undefined ? undefined : `${opening.eco} ${opening.name}`;
}

/** The last named opening a game reached, and at which ply; none outside the book, or where the build made no index. */
export function bookOpening(record: GameRecord): Opening | undefined
{
    const named = openingIndex();
    return named === undefined ? undefined : openingOf(record, named);
}

function lineOf(record: GameRecord): string | undefined
{
    const opening = bookOpening(record);

    if (opening === undefined) {
        return undefined;
    }

    return `${opening.eco} ${opening.name}${opening.inBook ? "" : ` (out of book since move ${outOfBookMove(opening)})`}`;
}

function openingBook(): OpeningBook | undefined
{
    if (book === undefined) {
        try {
            book = JSON.parse(readFileSync(new URL("../../../dist/core/book.json", import.meta.url), "utf8")) as OpeningBook;
        } catch {
            // Not built yet: the master goes without the book.
            book = null;
        }
    }

    return book ?? undefined;
}

function openingIndex(): OpeningIndex | undefined
{
    if (index === undefined) {
        try {
            index = JSON.parse(readFileSync(new URL("../../../dist/core/openings.json", import.meta.url), "utf8")) as OpeningIndex;
        } catch {
            // Not built yet: the views go without the opening.
            index = null;
        }
    }

    return index ?? undefined;
}
