// The openings by position (D-15, D-16): Lichess's names, indexed by the position each line reaches, so transpositions find them too.
import { Chess } from "chess.js";
import type { GameRecord } from "./record.ts";

/** The openings by position: the position's key (its FEN without the move counters) to its ECO code and name. */
export type OpeningIndex = Readonly<Record<string, readonly [eco: string, name: string]>>;

/** The opening a game is in, or the last one it was in: its ECO code, its name split in family and variation, and the ply that reached it. */
export interface Opening
{
    readonly eco: string;
    /** The whole name, as Lichess writes it: Sicilian Defense: Najdorf Variation, English Attack. */
    readonly name: string;
    /** The name before the colon: Sicilian Defense. */
    readonly family: string;
    /** The name after the colon, when there is one: Najdorf Variation, English Attack. */
    readonly variation?: string;
    /** How many plies the game had when it reached the opening's position. */
    readonly ply: number;
}

/** Where a game from the standard position stands in the book: the last named opening it reached, and how many of its first plies a line of the book reaches (D-68). */
export interface BookPlace
{
    readonly opening?: Opening;
    readonly plies: number;
}

/** No line of the book is longer: past it, no position is looked up. */
const bookDepth = 40;
const standardStart = positionKey(new Chess().fen());

/** The book's moves: each position on a line of Lichess's files to the moves its lines play from it, the theory the AI knows at the master level (D-15, D-60). */
export type OpeningBook = Readonly<Record<string, readonly string[]>>;

/** The index of the openings in Lichess's TSV files (eco, name, pgn), each line keyed by the position its moves reach. */
export function indexOpenings(tsv: string): Record<string, [string, string]>
{
    const index: Record<string, [string, string]> = {};

    for (const { eco, name, moves } of linesOf(tsv)) {
        const chess = new Chess();
        moves.forEach((move) => chess.move(move));
        index[positionKey(chess.fen())] = [eco, name];
    }

    return index;
}

/**
 * The book of Lichess's TSV files: every position on their lines, keyed as the index keys them, to the moves the lines play from it, the move most lines go
 * through first: how much theory a move has, never how good it is. A move under one line in fifty from its position is left out; one whose lines are all named
 * traps carries the trap's name, as the files write it: Nxe5 (Mortimer Trap).
 */
export function indexBook(tsv: string): Record<string, string[]>
{
    const lines = new Map<string, Map<string, LineCount>>();

    for (const { name, moves } of linesOf(tsv)) {
        const trap = name.split(/[:,]/).map((part) => part.trim()).find((part) => /\bTrap\b/.test(part));
        const chess = new Chess();

        for (const move of moves) {
            const key = positionKey(chess.fen());
            const san = chess.move(move).san;
            const counts = lines.get(key) ?? new Map<string, LineCount>();
            const count = counts.get(san) ?? { lines: 0, traps: [] };
            counts.set(san, { lines: count.lines + 1, traps: trap === undefined ? count.traps : [...count.traps, trap] });
            lines.set(key, counts);
        }
    }

    return Object.fromEntries([...lines].map(([key, counts]) => [key, bookOf(counts)]));
}

/** The moves the book knows from a position, in SAN; none out of the book. */
export function bookMoves(fen: string, book: OpeningBook): readonly string[]
{
    return book[positionKey(fen)] ?? [];
}

/** The opening of a game from the standard position, the last named one its moves reached; none before the first, or from another position. */
export function openingOf(record: GameRecord, index: OpeningIndex): Opening | undefined
{
    return bookPlaceOf(positionKeysOf(record), index)?.opening;
}

/**
 * Where a game stands in the book, from the keys of the positions it stood in, its start first: the last named position its moves reached, and its first
 * plies whose position a line of the book reaches, by any order of moves, one its lines play on from or one an opening is named after; without the book,
 * no ply is counted. None from another position than the standard one, whatever its FEN tag says.
 */
export function bookPlaceOf(keys: readonly string[], index: OpeningIndex, book?: OpeningBook): BookPlace | undefined
{
    if (!standardStartKey(keys[0])) {
        return undefined;
    }

    const last = Math.min(keys.length - 1, bookDepth);
    let found: { named: readonly [string, string]; ply: number; } | undefined;
    let plies = 0;

    for (let ply = 1; ply <= last; ply++) {
        const key = keys[ply]!;
        const named = index[key];

        if (named !== undefined) {
            found = { named, ply };
        }

        if (book !== undefined && plies === ply - 1 && (named !== undefined || book[key] !== undefined)) {
            plies = ply;
        }
    }

    return found === undefined ? { plies } : { opening: openingNamed(found.named, found.ply), plies };
}

/** The keys of a record's positions, its start first, replayed to the book's depth for a game from the standard position: for a record no live game holds. */
export function positionKeysOf(record: GameRecord): readonly string[]
{
    const start = positionKey(record.tags.FEN ?? new Chess().fen());

    if (!standardStartKey(start)) {
        return [start];
    }

    const chess = new Chess();
    return [start, ...record.moves.slice(0, bookDepth).map(({ san }) => positionKey(chess.move(san).after))];
}

/** A position without its move counters, the key of the index and the book: the same position reached in another order is the same key. */
export function positionKey(fen: string): string
{
    return fen.split(" ").slice(0, 4).join(" ");
}

/**
 * The move number at which a game from the standard position left the book (D-68), the move of its first ply past the `inBook` plies a line of the book
 * reaches; none while all its `plies` are the book's.
 */
export function outOfBookMove(plies: number, inBook: number): number | undefined
{
    return plies > inBook ? Math.floor(inBook / 2) + 1 : undefined;
}

/** The opening a name of the index stands for, reached at `ply`. */
function openingNamed([eco, name]: readonly [string, string], ply: number): Opening
{
    const colon = name.indexOf(":");
    const family = colon < 0 ? name : name.slice(0, colon);
    const opening = { eco, name, family, ply };
    return colon < 0 ? opening : { ...opening, variation: name.slice(colon + 1).trim() };
}

/** How many of the book's lines go through a move, and the trap each of them that is a named trap is named after. */
interface LineCount
{
    lines: number;
    traps: readonly string[];
}

/** The moves from a position that at least one line in fifty plays, the most played first, with the trap's name when all their lines are traps. */
function bookOf(counts: ReadonlyMap<string, LineCount>): string[]
{
    const total = [...counts.values()].reduce((sum, count) => sum + count.lines, 0);

    return [...counts]
        .filter(([, count]) => count.lines * 50 >= total)
        .sort(([, one], [, other]) => other.lines - one.lines)
        .map(([san, count]) => count.traps.length === count.lines ? `${san} (${[...new Set(count.traps)].join(" / ")})` : san);
}

/** The lines of Lichess's TSV files, their moves in SAN; one past the book's depth throws. */
function linesOf(tsv: string): { eco: string; name: string; moves: string[]; }[]
{
    return tsv.split(/\r?\n/).flatMap((line) => {
        const [eco, name, pgn] = line.split("\t");

        if (eco === undefined || name === undefined || pgn === undefined || eco === "eco") {
            return [];
        }

        const moves = pgn.split(/\s+/).filter((token) => token !== "" && !/^\d+\.+$/.test(token));

        if (moves.length > bookDepth) {
            throw new Error(`The opening ${eco} ${name} is ${moves.length} plies long, past the book's depth of ${bookDepth}: raise bookDepth.`);
        }

        return [{ eco, name, moves }];
    });
}

/** Whether a position's key is the standard start's: the one check of where the book applies. */
function standardStartKey(key: string | undefined): boolean
{
    return key === standardStart;
}
