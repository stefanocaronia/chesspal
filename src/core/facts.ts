// What a position shows, computed without judging it (D-19, D-26): who attacks and defends each piece, what is at risk, the pins, the checks, the moves of each piece.
import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";
import type { Move, Side } from "./game.ts";

/** A piece's letter, as SAN writes it, with P for a pawn. */
export type PieceLetter = "K" | "Q" | "R" | "B" | "N" | "P";

/**
 * A piece on the board with the pieces that could take it and those of its side that could take back: direct attacks, en passant included; a piece pinned
 * to its king only along the pin's line, though it still gives check. A king has no defenders.
 */
export interface PieceFacts
{
    readonly square: Square;
    readonly piece: PieceLetter;
    readonly side: Side;
    readonly attackers: readonly Square[];
    readonly defenders: readonly Square[];
    /** The rooks, bishops and queens lined up behind an attacker or a defender, by its square: a battery. */
    readonly behind?: Readonly<Partial<Record<Square, readonly Square[]>>>;
    /** Its legal moves in SAN, for the pieces of the side to move only. */
    readonly moves?: readonly string[];
}

/** A piece pinned to its king, or to a queen or rook of its side worth more than itself when the pinner is worth less or that piece is undefended. */
export interface Pin
{
    readonly square: Square;
    readonly by: Square;
    readonly to: Square;
}

/** The facts of a position: data for the AI and the page, never a judgment (D-19). */
export interface Facts
{
    /** Every piece, White's first, each side's from the king down: K Q R B N P. */
    readonly pieces: readonly PieceFacts[];
    /** The pieces giving check to the side to move, when it is in check. */
    readonly checkedBy?: readonly Square[];
    /** Pieces attacked and not defended, kings left out. */
    readonly undefended: readonly Square[];
    /** Pieces defended, but attacked by a piece worth less. */
    readonly attackedByCheaper: readonly Square[];
    /** Pieces defended, but by fewer pieces than attack them, counting only the direct ones on both sides; not those attacked by a cheaper piece. */
    readonly outnumbered: readonly Square[];
    /** Pieces neither attacked nor defended, kings left out: the first targets of a tactic. */
    readonly loose: readonly Square[];
    readonly pins: readonly Pin[];
    /** The checks of the side to move, in SAN. */
    readonly checks: readonly string[];
    /** The checks the other side would have if it were to move; left out when the side to move is in check, since it could not be. */
    readonly otherChecks?: readonly string[];
}

/** The facts of a chess.js board, whose legal moves are given: computed once for each position, by its key, and frozen. */
export function factsOf(chess: Chess, legal: readonly Move[]): Facts
{
    const key = chess.hash();
    let facts = factsByPosition.get(key);

    if (facts === undefined) {
        facts = deepFrozen(computed(chess, legal));

        if (factsByPosition.size >= positionsKept) {
            factsByPosition.delete(factsByPosition.keys().next().value!);
        }

        factsByPosition.set(key, facts);
    }

    return facts;
}

// The facts of the positions seen last, by their key.
const factsByPosition = new Map<string, Facts>();
const positionsKept = 256;

// The usual values, only to compare two pieces: never summed (D-19). A king is never the cheaper one.
const values: Readonly<Record<PieceSymbol, number>> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

// The order SAN lists pieces in.
const order: Readonly<Record<PieceSymbol, number>> = { k: 0, q: 1, r: 2, b: 3, n: 4, p: 5 };

// The lines from a square: a step on the file and the rank, and the slider that moves along it besides the queen.
const lines: readonly [number, number, PieceSymbol][] = [[0, 1, "r"], [0, -1, "r"], [1, 0, "r"], [-1, 0, "r"], [1, 1, "b"], [1, -1, "b"], [-1, 1, "b"], [-1, -1, "b"]];

const files = "abcdefgh";

interface Placed
{
    square: Square;
    type: PieceSymbol;
    color: Color;
}

/** Which pieces attack a square: chess.js's direct attacks, a piece pinned to its king only along the pin's line, and the pawns that take en passant. */
export type Reach = (square: Square, color: Color) => Square[];

/** Which pieces attack a square as the facts count them: a piece pinned to its king only along the pin's line, though it still gives check; no en passant. */
export function attacksOf(chess: Chess): Reach
{
    return alongPins(chess, piecesOf(chess).filter((piece) => piece.type === "k").flatMap((king) => pinsTo(chess, king)));
}

/** The squares strictly between two squares on one line. */
export function squaresBetween(from: Square, to: Square): Square[]
{
    const ray = rayFrom(from, Math.sign(fileOf(to) - fileOf(from)), Math.sign(rankOf(to) - rankOf(from)));
    return ray.slice(0, ray.indexOf(to));
}

export function fileOf(square: Square): number
{
    return files.indexOf(square[0]!);
}

export function rankOf(square: Square): number
{
    return Number(square[1]);
}

function computed(chess: Chess, legal: readonly Move[]): Facts
{
    const placed = piecesOf(chess);
    const turn = chess.turn();
    const kingPins = placed.filter((piece) => piece.type === "k").flatMap((king) => pinsTo(chess, king));
    const reach = reachOf(chess, kingPins, legal);
    const pieces = placed.map((piece) => pieceFacts(chess, piece, reach, turn === piece.color ? legal.filter((move) => move.from === piece.square) : undefined));
    const factsAt = new Map(pieces.map((piece) => [piece.square, piece]));
    const officers = pieces.filter((piece) => piece.piece !== "K");
    const atRisk = officers.filter((piece) => piece.attackers.length > 0);
    const valueAt = (square: Square) => values[chess.get(square)!.type];
    const defended = atRisk.filter((piece) => piece.defenders.length > 0);
    const byCheaper = defended.filter((piece) => Math.min(...piece.attackers.map(valueAt)) < valueAt(piece.square));
    const relativePins = placed.filter((piece) => piece.type === "q" || piece.type === "r").flatMap((target) =>
        pinsTo(chess, target).filter((pin) => valueAt(pin.by) < values[target.type] || factsAt.get(target.square)?.defenders.length === 0)
    );
    const king = pieces.find((piece) => piece.piece === "K" && piece.side === sideOf(turn));
    const facts: Facts = {
        pieces,
        ...(chess.inCheck() && king !== undefined ? { checkedBy: king.attackers } : {}),
        undefended: atRisk.filter((piece) => piece.defenders.length === 0).map((piece) => piece.square),
        attackedByCheaper: byCheaper.map((piece) => piece.square),
        outnumbered: defended.filter((piece) => !byCheaper.includes(piece) && piece.attackers.length > piece.defenders.length).map((piece) => piece.square),
        loose: officers.filter((piece) => piece.attackers.length === 0 && piece.defenders.length === 0).map((piece) => piece.square),
        pins: [...kingPins, ...relativePins].sort((left, right) => compare(left.square, right.square)),
        checks: legal.filter((move) => /[+#]$/.test(move.san)).map((move) => move.san),
    };

    return chess.inCheck() ? facts : { ...facts, otherChecks: otherChecks(chess) };
}

function reachOf(chess: Chess, kingPins: readonly Pin[], legal: readonly Move[]): Reach
{
    const direct = alongPins(chess, kingPins);
    const enPassant = enPassantVictim(chess);
    const takers = enPassant === undefined ? [] : legal.filter((move) => move.to === enPassant.to && chess.get(move.from)?.type === "p").map((move) => move.from);

    return (square, color) => (square === enPassant?.square && color === chess.turn() ? [...direct(square, color), ...takers].sort(compare) : direct(square, color));
}

function alongPins(chess: Chess, kingPins: readonly Pin[]): Reach
{
    const pinLines = new Map(kingPins.map((pin) => [pin.square, new Set(squaresBetween(pin.to, pin.by).concat(pin.by))]));

    return (square, color) => {
        // A pinned piece still gives check: the king is never taken.
        const isKing = chess.get(square)?.type === "k";
        return chess.attackers(square, color).filter((from) => isKing || (pinLines.get(from)?.has(square) ?? true)).sort(compare);
    };
}

function pieceFacts(chess: Chess, { square, type, color }: Placed, reach: Reach, moves: readonly Move[] | undefined): PieceFacts
{
    const attackers = reach(square, color === "w" ? "b" : "w");
    const defenders = type === "k" ? [] : reach(square, color);
    const behind = batteries(chess, square, [...attackers, ...defenders]);
    const facts: PieceFacts = { square, piece: type.toUpperCase() as PieceLetter, side: sideOf(color), attackers, defenders };
    const withBehind = Object.keys(behind).length === 0 ? facts : { ...facts, behind };

    return moves === undefined ? withBehind : { ...withBehind, moves: moves.map((move) => move.san) };
}

/** The rooks, bishops and queens of each piece's side lined up behind it, away from the square it attacks or defends. */
function batteries(chess: Chess, target: Square, fronts: readonly Square[]): Partial<Record<Square, Square[]>>
{
    const found: Partial<Record<Square, Square[]>> = {};

    for (const front of fronts) {
        const fileStep = Math.sign(fileOf(front) - fileOf(target));
        const rankStep = Math.sign(rankOf(front) - rankOf(target));
        const straight = fileStep === 0 || rankStep === 0;
        const slider = straight ? "r" : "b";
        const { color, type } = chess.get(front)!;
        // A pawn beside its target takes en passant and leaves the rank: nothing lines up behind it.
        const onLine = straight ? type !== "p" : Math.abs(fileOf(front) - fileOf(target)) === Math.abs(rankOf(front) - rankOf(target));
        const lined: Square[] = [];

        for (const square of onLine ? rayFrom(front, fileStep, rankStep) : []) {
            const piece = chess.get(square);

            if (piece === undefined) {
                continue;
            }

            if (piece.color !== color || (piece.type !== slider && piece.type !== "q")) {
                break;
            }

            lined.push(square);
        }

        if (lined.length > 0) {
            found[front] = lined;
        }
    }

    return found;
}

/** The pins to a piece: by a rook, bishop or queen on its line, with a piece of its side between them. */
function pinsTo(chess: Chess, target: Placed): Pin[]
{
    const pins: Pin[] = [];

    for (const [fileStep, rankStep, slider] of lines) {
        const [first, second] = rayFrom(target.square, fileStep, rankStep).filter((square) => chess.get(square) !== undefined);
        const pinned = first === undefined ? undefined : chess.get(first);
        const pinner = second === undefined ? undefined : chess.get(second);

        if (
            pinned?.color === target.color && pinner !== undefined && pinner.color !== target.color && (pinner.type === slider || pinner.type === "q")
            && (target.type === "k" || values[pinned.type] < values[target.type])
        ) {
            pins.push({ square: first!, by: second!, to: target.square });
        }
    }

    return pins;
}

/** The pawn that can be taken en passant, and the square a pawn takes it on; none without an en passant square. */
function enPassantVictim(chess: Chess): { square: Square; to: Square; } | undefined
{
    const to = chess.fen().split(" ")[3];

    if (to === undefined || to === "-") {
        return undefined;
    }

    return { square: `${to[0]}${chess.turn() === "w" ? 5 : 4}` as Square, to: to as Square };
}

/** The checks of the side not to move, on the same board with the turn passed: no en passant, which belonged to the side to move. */
function otherChecks(chess: Chess): string[]
{
    const fields = chess.fen().split(" ");
    fields[1] = chess.turn() === "w" ? "b" : "w";
    fields[3] = "-";
    return new Chess(fields.join(" ")).moves().filter((san) => /[+#]$/.test(san));
}

/** The pieces on the board, White's first, each side's from the king down (K Q R B N P), then by square. */
function piecesOf(chess: Chess): Placed[]
{
    return chess.board().flat().filter((cell) => cell !== null).map(({ square, type, color }) => ({ square, type, color })).sort((left, right) =>
        compare(right.color, left.color) || order[left.type] - order[right.type] || compare(left.square, right.square)
    );
}

/** The squares from a square to the edge of the board, one step at a time. */
function rayFrom(from: Square, fileStep: number, rankStep: number): Square[]
{
    const ray: Square[] = [];
    let file = fileOf(from) + fileStep;
    let rank = rankOf(from) + rankStep;

    while (file >= 0 && file < 8 && rank >= 1 && rank <= 8) {
        ray.push(`${files[file]}${rank}` as Square);
        file += fileStep;
        rank += rankStep;
    }

    return ray;
}

/** Compares two names of squares or colours: a fixed alphabet, no locale. */
function compare(left: string, right: string): number
{
    return left < right ? -1 : left > right ? 1 : 0;
}

function sideOf(color: Color): Side
{
    return color === "w" ? "white" : "black";
}

function deepFrozen<Value>(value: Value): Value
{
    if (typeof value === "object" && value !== null) {
        Object.values(value).forEach(deepFrozen);
        Object.freeze(value);
    }

    return value;
}
