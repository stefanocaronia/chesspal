// Why the board refuses a move, without judging anything (D-18): the page tells the player who tried it (T-11).
import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";
import { fileOf, rankOf, squaresBetween } from "./facts.ts";

/**
 * Why a piece cannot go to a square: a piece of its side stands there; it does not move that way; a piece stands in its way; a pawn takes only
 * diagonally, goes two squares only from its first, diagonally only to take, and en passant only right after the double step; the king is in check and
 * the move does not answer it; the move uncovers the king; the king would stand in check; castling with the king or that rook moved, the rook gone, a
 * piece between them, the king in check, or a square it crosses or reaches attacked.
 */
export type IllegalReason =
    | "own"
    | "shape"
    | "blocked"
    | "pawn-straight"
    | "pawn-double"
    | "pawn-diagonal"
    | "en-passant-late"
    | "check"
    | "pinned"
    | "attacked"
    | "castle-lost"
    | "castle-rook-gone"
    | "castle-blocked"
    | "castle-check"
    | "castle-through";

/**
 * Why a move is not legal, with the square of the piece that makes it so, when one does (the blocker, the piece giving check, the pinner, the attacker, the
 * pawn too late to take), and the square it concerns, when it is not the one the piece went to: the rook's corner, the square castling crosses.
 */
export interface Illegal
{
    readonly reason: IllegalReason;
    readonly by?: Square;
    readonly at?: Square;
}

/** Why the piece of the side to move on one square cannot go to another, which its legal moves do not reach; undefined when no rule says why. */
export function whyIllegal(chess: Chess, from: Square, to: Square): Illegal | undefined
{
    const piece = chess.get(from);

    if (piece === undefined || piece.color !== chess.turn()) {
        throw new RangeError(`There is no piece of the side to move on ${from}: ask why only of a piece that may move.`);
    }

    // A king going two squares from its first castles, as does one taken onto its own rook, though a piece of its own stands where it goes.
    const castling = piece.type === "k" ? castlingTo(chess, from, to, piece.color) : undefined;

    if (castling !== undefined) {
        return whyNotCastling(chess, from, castling, piece.color);
    }

    // The way a piece moves comes first: a rook taken diagonally onto a piece of its own breaks that rule before the other.
    if (piece.type !== "p" && !reaches(piece.type, from, to)) {
        return { reason: "shape" };
    }

    if (chess.get(to)?.color === piece.color) {
        return { reason: "own" };
    }

    const pawn = piece.type === "p" ? pawnRule(chess, from, to, piece.color) : undefined;

    if (pawn !== undefined) {
        return pawn;
    }

    const blocker = squaresBetween(from, to).find((square) => chess.get(square) !== undefined);
    return blocker !== undefined && piece.type !== "n" ? { reason: "blocked", by: blocker } : kingExposed(chess, from, to, piece.color);
}

/** Whether a piece's move from one square reaches another on an empty board: pawns aside. */
function reaches(type: PieceSymbol, from: Square, to: Square): boolean
{
    const files = Math.abs(fileOf(to) - fileOf(from));
    const ranks = Math.abs(rankOf(to) - rankOf(from));
    const straight = files === 0 || ranks === 0;
    const diagonal = files === ranks;

    switch (type) {
        case "n":
            return files * ranks === 2;
        case "k":
            return Math.max(files, ranks) === 1;
        case "b":
            return diagonal;
        case "r":
            return straight;
        default:
            return straight || diagonal;
    }
}

/** What a pawn's own rules refuse, with the piece in its way on a double step, or the pawn it took en passant too late; undefined when they allow the move. */
function pawnRule(chess: Chess, from: Square, to: Square, color: Color): Illegal | undefined
{
    const forward = color === "w" ? 1 : -1;
    const files = Math.abs(fileOf(to) - fileOf(from));
    const ranks = (rankOf(to) - rankOf(from)) * forward;
    const taken = chess.get(to) !== undefined;

    if (files === 1 && ranks === 1) {
        // chess.js leaves the en passant square out of its FEN when no capture there is legal, unless forced.
        const enPassant = chess.fen({ forceEnpassantSquare: true }).split(" ")[3];
        return taken || to === enPassant ? undefined : lateEnPassant(chess, from, to, color) ?? { reason: "pawn-diagonal" };
    }

    if (files !== 0 || ranks < 1 || ranks > 2) {
        return { reason: "shape" };
    }

    if (ranks === 2 && rankOf(from) !== (color === "w" ? 2 : 7)) {
        return { reason: "pawn-double" };
    }

    const between = squaresBetween(from, to).find((square) => chess.get(square) !== undefined);

    if (between !== undefined) {
        return { reason: "blocked", by: between };
    }

    return taken ? { reason: "pawn-straight" } : undefined;
}

/** A pawn on its fifth rank taking diagonally to an empty square beside an enemy pawn: en passant, but not right after that pawn's double step. */
function lateEnPassant(chess: Chess, from: Square, to: Square, color: Color): Illegal | undefined
{
    const beside = `${to[0]}${from[1]}` as Square;
    const pawn = chess.get(beside);
    const fifth = rankOf(from) === (color === "w" ? 5 : 4);
    return fifth && pawn?.type === "p" && pawn.color !== color ? { reason: "en-passant-late", by: beside } : undefined;
}

/** Why the move would leave its king in check, played on a copy: the king steps into it, a check it does not answer, or a line it uncovers. */
function kingExposed(chess: Chess, from: Square, to: Square, color: Color): Illegal | undefined
{
    const enemy = color === "w" ? "b" : "w";
    const piece = chess.get(from)!;
    const after = new Chess(chess.fen());
    const enPassant = piece.type === "p" && fileOf(from) !== fileOf(to) && after.get(to) === undefined;
    after.remove(from);
    after.remove(to);
    after.put(piece, to);

    if (enPassant) {
        after.remove(`${to[0]}${from[1]}` as Square);
    }

    const king = piece.type === "k" ? to : after.findPiece({ type: "k", color })[0]!;
    const attackers = after.attackers(king, enemy);

    if (attackers.length === 0) {
        return undefined;
    }

    if (piece.type === "k") {
        return { reason: "attacked", by: attackers[0]! };
    }

    const checkers = chess.inCheck() ? chess.attackers(king, enemy) : [];
    const unanswered = attackers.find((square) => checkers.includes(square));
    return unanswered !== undefined ? { reason: "check", by: unanswered } : { reason: "pinned", by: attackers[0]! };
}

/** The square a king's move castles to: two squares along its first rank from its own, or its own rook's corner; none for another move. */
function castlingTo(chess: Chess, from: Square, to: Square, color: Color): Square | undefined
{
    const home = color === "w" ? "e1" : "e8";

    if (from !== home || to[1] !== home[1]) {
        return undefined;
    }

    const corner = to[0] === "h" ? "g" : to[0] === "a" ? "c" : undefined;
    const rook = chess.get(to);

    if (corner !== undefined && rook?.type === "r" && rook.color === color) {
        return `${corner}${home[1]}` as Square;
    }

    return Math.abs(fileOf(to) - fileOf(from)) === 2 ? to : undefined;
}

/** Why the king cannot castle: its right lost, the rook gone, a check, a piece between it and the rook, a square it crosses or reaches attacked. */
function whyNotCastling(chess: Chess, from: Square, to: Square, color: Color): Illegal | undefined
{
    const kingside = fileOf(to) > fileOf(from);
    const corner = `${kingside ? "h" : "a"}${from[1]}` as Square;
    const enemy = color === "w" ? "b" : "w";
    const rook = chess.get(corner);

    if (rook?.type !== "r" || rook.color !== color) {
        return { reason: "castle-rook-gone", at: corner };
    }

    if (!chess.getCastlingRights(color)[kingside ? "k" : "q"]) {
        return { reason: "castle-lost" };
    }

    if (chess.inCheck()) {
        return { reason: "castle-check", by: chess.attackers(from, enemy)[0]! };
    }

    const between = squaresBetween(from, corner).find((square) => chess.get(square) !== undefined);

    if (between !== undefined) {
        return { reason: "castle-blocked", by: between };
    }

    for (const square of [...squaresBetween(from, to), to]) {
        const [attacker] = chess.attackers(square, enemy);

        if (attacker !== undefined) {
            return { reason: "castle-through", by: attacker, at: square };
        }
    }

    return undefined;
}
