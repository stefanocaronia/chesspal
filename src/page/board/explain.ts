// How the board shows why a move was refused: an icon for the kind of reason, an arrow from the piece that forbids it, or a ring on it.
import type { Illegal, IllegalReason } from "../../core/index.ts";

/** The family of a reason, which picks the bubble's icon: the piece's own way of moving, a pin, a king in danger, a piece in the way, castling. */
export type ExplainKind = "piece" | "pin" | "king" | "blocked" | "castle";

/** What the board draws for a refused move: the icon's family, and an arrow or a ring, never both. */
export interface Explanation
{
    readonly kind: ExplainKind;
    readonly arrow?: { readonly from: string; readonly to: string; };
    readonly ring?: string;
}

/** The drawing for a move refused, `to` being where it went and `king` the square of the player's king. */
export function explain(illegal: Illegal, to: string, king: string | undefined): Explanation
{
    const kind = kinds[illegal.reason];
    const by = illegal.by;

    if (by === undefined) {
        return { kind };
    }

    const target = illegal.reason === "attacked" ? to : illegal.reason === "castle-through" ? illegal.at : arrowsToKing.has(illegal.reason) ? king : undefined;
    return target === undefined ? { kind, ring: by } : { kind, arrow: { from: by, to: target } };
}

/** Where the bubble goes from the piece moved: over it, under it, under the whole board, or beside it in its rank. */
export type BubblePlace = "above" | "below" | "under-board" | "left" | "right";

/**
 * Where the bubble of a refused move goes (Zoe's rule), squares as seen, in columns and rows from the top left: over the piece moved, else under it,
 * so as never to hide the squares to `keep` (the culprit, the arrow's point); else under the board on a narrow one, or beside the piece on a wide one.
 */
export function bubblePlace(piece: readonly [number, number], keep: readonly (readonly [number, number])[], narrow: boolean): BubblePlace
{
    const [column, row] = piece;
    // On a phone's board the bubble is taller than a square: it takes two rows.
    const rows = narrow ? 2 : 1;
    const free = (first: number, step: number): boolean => first + step * (rows - 1) >= 0 && first + step * (rows - 1) <= 7 && !keep.some(([, kept]) => (kept - first) * step >= 0 && (kept - first) * step < rows);

    if (free(row - 1, -1)) {
        return "above";
    }

    if (free(row + 1, 1)) {
        return "below";
    }

    if (narrow) {
        return "under-board";
    }

    const right = keep.some(([kept, keptRow]) => keptRow === row && kept > column);
    const left = keep.some(([kept, keptRow]) => keptRow === row && kept < column);
    return right === left ? (column < 4 ? "right" : "left") : right ? "left" : "right";
}

/** The squares a bubble must leave in sight: the culprit, with its ring or the start of its arrow, and the arrow's point. */
export function keptSquares(explanation: Explanation | undefined): string[]
{
    if (explanation === undefined) {
        return [];
    }

    return explanation.arrow === undefined ? (explanation.ring === undefined ? [] : [explanation.ring]) : [explanation.arrow.from, explanation.arrow.to];
}

const kinds: Readonly<Record<IllegalReason, ExplainKind>> = {
    "own": "piece",
    "shape": "piece",
    "pawn-straight": "piece",
    "pawn-double": "piece",
    "pawn-diagonal": "piece",
    "en-passant-late": "piece",
    "blocked": "blocked",
    "pinned": "pin",
    "check": "king",
    "attacked": "king",
    "castle-lost": "castle",
    "castle-rook-gone": "castle",
    "castle-blocked": "castle",
    "castle-check": "castle",
    "castle-through": "castle",
};

// The reasons whose culprit aims at the player's king.
const arrowsToKing: ReadonlySet<IllegalReason> = new Set(["pinned", "check", "castle-check"]);
