// How the pieces move when the board shows a new position: a move slides its piece over the one it takes, a step back slides it home, a jump
// through the game moves every piece to its place.
import type { Move } from "../../core/index.ts";
import { files } from "./squares.ts";

/**
 * How a new position moves on the board: each sliding piece's square with the square it comes from, the piece it takes, which stays until it arrives, and
 * the king in check that shakes.
 */
export interface Motion
{
    readonly slides: ReadonlyMap<string, string>;
    readonly taken?: { readonly square: string; readonly letter: string; };
    /** After a jump through the game: the pieces that fade from their squares, and the squares where a piece appears. */
    readonly gone?: readonly { readonly square: string; readonly letter: string; }[];
    readonly appear?: ReadonlySet<string>;
    readonly shake?: string;
}

export const noMotion: Motion = { slides: new Map() };

/**
 * The last move slides, but for a piece the player dragged there (`dragged`, its squares), over the piece it takes, as it stood `before`; a castling rook
 * slides always.
 */
export function motionOf(move: Move, dragged: string | undefined, shake: string | undefined, before: ReadonlyMap<string, string>): Motion
{
    const slides = new Map<string, string>();
    let taken: Motion["taken"];

    if (dragged !== `${move.from}${move.to}`) {
        slides.set(move.to, move.from);
        // A pawn that takes en passant lands beside the pawn it takes.
        const square = before.has(move.to) ? move.to : before.get(move.from)?.toLowerCase() === "p" && move.from[0] !== move.to[0] ? `${move.to[0]}${move.from[1]}` : undefined;
        const letter = square === undefined ? undefined : before.get(square);
        taken = square === undefined || letter === undefined ? undefined : { square, letter };
    }

    const rank = move.from[1];

    if (move.san.startsWith("O-O-O")) {
        slides.set(`d${rank}`, `a${rank}`);
    } else if (move.san.startsWith("O-O")) {
        slides.set(`f${rank}`, `h${rank}`);
    }

    return { slides, ...(taken === undefined ? {} : { taken }), ...(shake === undefined ? {} : { shake }) };
}

/**
 * A jump through the game, from the pieces `before` to those `now`: each piece slides to the nearest square where one like it stands now, the closest pairs
 * first; a piece left over fades, and one that has no piece to come from appears.
 */
export function rearranged(before: ReadonlyMap<string, string>, now: ReadonlyMap<string, string>): Motion
{
    const left = [...before].filter(([square, letter]) => now.get(square) !== letter);
    const arrived = [...now].filter(([square, letter]) => before.get(square) !== letter);
    const pairs = arrived
        .flatMap(([to, letter]) => left.filter(([, was]) => was === letter).map(([from]) => ({ from, to, distance: distanceOf(from, to) })))
        .sort((one, other) => one.distance - other.distance);
    const slides = new Map<string, string>();
    const moved = new Set<string>();

    for (const { from, to } of pairs) {
        if (!slides.has(to) && !moved.has(from)) {
            slides.set(to, from);
            moved.add(from);
        }
    }

    return {
        slides,
        appear: new Set(arrived.map(([square]) => square).filter((square) => !slides.has(square))),
        gone: left.filter(([square]) => !moved.has(square)).map(([square, letter]) => ({ square, letter })),
    };
}

/** A move taken back: its piece, and a castling rook, slide home; a piece it took is there again under the one leaving. */
export function backOf(move: Move): Motion
{
    const rank = move.from[1];
    const slides = new Map<string, string>([[move.from, move.to]]);

    if (move.san.startsWith("O-O-O")) {
        slides.set(`a${rank}`, `d${rank}`);
    } else if (move.san.startsWith("O-O")) {
        slides.set(`h${rank}`, `f${rank}`);
    }

    return { slides };
}

/** Whether the pieces `now` are those `before` with the move played: the piece on its square came from where it began, a pawn there when it promoted. */
export function playedOn(before: ReadonlyMap<string, string>, now: ReadonlyMap<string, string>, move: Move): boolean
{
    const piece = before.get(move.from);
    const landed = now.get(move.to);
    return piece !== undefined && !now.has(move.from) && (landed === piece || (move.san.includes("=") && piece.toLowerCase() === "p"));
}

/** How far apart two squares are, in squares. */
function distanceOf(from: string, to: string): number
{
    return Math.hypot(files.indexOf(from[0]!) - files.indexOf(to[0]!), Number(from[1]) - Number(to[1]));
}
