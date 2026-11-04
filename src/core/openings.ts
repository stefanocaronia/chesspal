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
    /** Whether the game's position now is a named one; when not, it left the book at the ply after `ply`. */
    readonly inBook: boolean;
}

/** No line of the book is longer: past it, no position is looked up. */
export const bookDepth = 40;

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
    if (record.tags.FEN !== undefined && record.tags.FEN !== new Chess().fen()) {
        return undefined;
    }

    const chess = new Chess();
    const plies = Math.min(record.moves.length, bookDepth);
    let found: { named: readonly [string, string]; ply: number; } | undefined;

    for (let ply = 1; ply <= plies; ply++) {
        chess.move(record.moves[ply - 1]!.san);
        const named = index[positionKey(chess.fen())];

        if (named !== undefined) {
            found = { named, ply };
        }
    }

    if (found === undefined) {
        return undefined;
    }

    const [eco, name] = found.named;
    const colon = name.indexOf(":");
    const family = colon < 0 ? name : name.slice(0, colon);
    const opening = { eco, name, family, ply: found.ply, inBook: found.ply === record.moves.length };
    return colon < 0 ? opening : { ...opening, variation: name.slice(colon + 1).trim() };
}

/** The move number at which a game that reached an opening at `ply` left the book. */
export function outOfBookMove(opening: Opening): number
{
    return Math.floor(opening.ply / 2) + 1;
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

/** A position without its move counters: the same position reached in another order is the same key. */
function positionKey(fen: string): string
{
    return fen.split(" ").slice(0, 4).join(" ");
}
