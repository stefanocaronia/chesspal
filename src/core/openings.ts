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

/** The index of the openings in Lichess's TSV files (eco, name, pgn), each line keyed by the position its moves reach. */
export function indexOpenings(tsv: string): Record<string, [string, string]>
{
    const index: Record<string, [string, string]> = {};

    for (const line of tsv.split(/\r?\n/)) {
        const [eco, name, pgn] = line.split("\t");

        if (eco === undefined || name === undefined || pgn === undefined || eco === "eco") {
            continue;
        }

        const chess = new Chess();
        const moves = pgn.split(/\s+/).filter((token) => token !== "" && !/^\d+\.+$/.test(token));

        if (moves.length > bookDepth) {
            throw new Error(`The opening ${eco} ${name} is ${moves.length} plies long, past the book's depth of ${bookDepth}: raise bookDepth.`);
        }

        moves.forEach((move) => chess.move(move));
        index[positionKey(chess.fen())] = [eco, name];
    }

    return index;
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

/** A position without its move counters: the same position reached in another order is the same key. */
function positionKey(fen: string): string
{
    return fen.split(" ").slice(0, 4).join(" ");
}
