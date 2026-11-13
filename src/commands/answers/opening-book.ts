// The book of the openings the build indexed (D-16), read once at the first lookup: where a game is in it (D-68) at every level, its moves for the master (D-60).
import { readFileSync } from "node:fs";
import { bookMoves, type BookPlace, bookPlaceOf, Game, type GameRecord, type Opening, type OpeningBook, type OpeningIndex, outOfBookMove, positionKeysOf } from "../../core/index.ts";

// The index of the named openings and the book of their moves, each read at its first lookup; null where the build made none.
let index: OpeningIndex | null | undefined;
let book: OpeningBook | null | undefined;
// Each record is looked up once: the live game keeps its record until a move changes it.
const places = new WeakMap<GameRecord, BookPlace | null>();

/**
 * The game's opening as the AI reads it: ECO and name, and the move it left the book at (D-68); none outside the book, or where the build made no index.
 * A live game gives the positions it went through; a record alone is replayed.
 */
export function openingLine(game: Game | GameRecord): string | undefined
{
    const place = bookPlace(game);

    if (place?.opening === undefined) {
        return undefined;
    }

    const left = outOfBookMove(recordOf(game).moves.length, place.plies);
    return `${place.opening.eco} ${place.opening.name}${left === undefined ? "" : ` (out of book since move ${left})`}`;
}

/** The moves the book knows from a position (D-15), for the AI at the master level; none out of the book, or where the build made no book. */
export function knownMoves(fen: string): readonly string[]
{
    const moves = openingBook();
    return moves === undefined ? [] : bookMoves(fen, moves);
}

/** How many plies from the start the book knows, to the last before the game left it (D-68, D-69); none from another position. */
export function bookPlies(game: Game | GameRecord): number
{
    return bookPlace(game)?.plies ?? 0;
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
    return bookPlace(record)?.opening;
}

/**
 * Where a game stands in the book, its opening and its plies the book knows, once per record: from the positions a live game went through, or a record
 * replayed; none from another position, or where the build made no index.
 */
export function bookPlace(game: Game | GameRecord): BookPlace | undefined
{
    const record = recordOf(game);
    let place = places.get(record);

    if (place === undefined) {
        const named = openingIndex();
        const keys = game instanceof Game ? game.positionKeys : positionKeysOf(record);
        place = named === undefined ? null : bookPlaceOf(keys, named, openingBook()) ?? null;
        places.set(record, place);
    }

    return place ?? undefined;
}

function recordOf(game: Game | GameRecord): GameRecord
{
    return game instanceof Game ? game.record : game;
}

function openingBook(): OpeningBook | undefined
{
    if (book === undefined) {
        try {
            book = JSON.parse(readFileSync(new URL("../../../dist/core/book.json", import.meta.url), "utf8")) as OpeningBook;
        } catch {
            // Not built yet: no game is in the book, and the master goes without its moves.
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
