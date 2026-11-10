// What the moves of a position would do (D-100): the captures and what they take, the forks and double attacks, the discovered and double checks, the
// promotions, the stalemates and the stalemate traps; for the side to move, and as threats for the other side. Facts on each move, never a judgment or a
// search beyond the move and, for a stalemate, the reply to it (D-6, D-19). The definitions are Anatolij's.
import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";
import { attacksOf, factsOf, type Reach } from "./facts.ts";
import type { Move } from "./game.ts";
import { mayCastle, type Named, namesOn, type Piece, type Placed, Placement, type Tried, turnPassed } from "./placement.ts";

/** A capture of the side to move, with what the piece taken is to the piece taking it: none when it is defended and worth less. */
export interface Capture
{
    readonly san: string;
    readonly fact?: "undefended" | "worth more" | "same value" | "outnumbered";
}

/** A move that attacks two targets or more: a fork when the piece moved attacks them all, else a double attack with a piece it uncovers. */
export interface DoubleAttack
{
    readonly san: string;
    readonly targets: readonly Square[];
    readonly fork: boolean;
}

/** A move after which a reply of the other side stalemates the side that moved: those replies, or all when every one does. */
export interface StalemateTrap
{
    readonly san: string;
    readonly replies: readonly string[] | "all";
}

/** What a side's moves would do to the other side. */
export interface Chances
{
    readonly doubleAttacks: readonly DoubleAttack[];
    readonly discoveredChecks: readonly string[];
    readonly doubleChecks: readonly string[];
    readonly promotions: readonly string[];
}

/** What the moves of the side to move would do. */
export interface Possibilities extends Chances
{
    readonly captures: readonly Capture[];
    readonly stalemates: readonly string[];
    readonly stalemateTraps: readonly StalemateTrap[];
}

/** The possibilities of a chess.js board, whose legal moves are given: computed once for each position, by its key, and frozen. */
export function possibilitiesOf(chess: Chess, legal: readonly Move[]): Possibilities
{
    return kept(possibilitiesByPosition, chess, () => computed(chess, legal));
}

/**
 * What the other side's moves would do if it were to move, as threats: none when the side to move is in check, since the other side could not be to move.
 * Computed apart from the possibilities, only where they are shown: once for each position, by its key, and frozen.
 */
export function threatsOf(chess: Chess): Chances | undefined
{
    return chess.inCheck() ? undefined : kept(threatsByPosition, chess, () => threatsComputed(chess));
}

// The possibilities and the threats of the positions seen last, by their key.
const possibilitiesByPosition = new Map<string, Possibilities>();
const threatsByPosition = new Map<string, Chances>();
const positionsKept = 256;

function kept<T extends object>(byPosition: Map<string, T>, chess: Chess, compute: () => T): T
{
    const key = chess.hash();
    let found = byPosition.get(key);

    if (found === undefined) {
        found = Object.freeze(compute());

        if (byPosition.size >= positionsKept) {
            byPosition.delete(byPosition.keys().next().value!);
        }

        byPosition.set(key, found);
    }

    return found;
}

// The usual values, only to compare two pieces, never summed (D-19), as the facts have them.
const values: Readonly<Record<PieceSymbol, number>> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

// A stalemate is looked for only when the side it would stalemate has at most this many pieces besides its king and pawns (Anatolij).
const fewPieces = 1;

function computed(chess: Chess, legal: readonly Move[]): Possibilities
{
    const side = chess.turn();
    const stalemates = stalematesOf(chess, legal);
    const strikes = strikesOf(chess, side, legal.filter((move) => !move.san.startsWith("O-O")));
    return {
        captures: capturesOf(chess, legal),
        ...chancesOf(strikes, (move) => ({ san: move.san, order: 0 }), promotionsOf(legal, stalemates)),
        stalemates,
        stalemateTraps: stalemateTrapsOf(chess, legal),
    };
}

/** Each capture with the fact of the piece taken: undefended, worth more than the taker, worth the same, or attacked more times than defended. */
function capturesOf(chess: Chess, legal: readonly Move[]): Capture[]
{
    const pieces = new Map(factsOf(chess, legal).pieces.map((piece) => [piece.square, piece]));

    return legal.filter((move) => move.san.includes("x")).map((move) => {
        const taken = chess.get(move.to) === undefined ? `${move.to[0]}${move.from[1]}` as Square : move.to;
        const victim = pieces.get(taken);
        const valueTaken = values[chess.get(taken)!.type];
        const valueTaker = values[chess.get(move.from)!.type];

        if (victim === undefined || victim.defenders.length === 0) {
            return { san: move.san, fact: "undefended" };
        }

        if (valueTaken !== valueTaker) {
            return valueTaken > valueTaker ? { san: move.san, fact: "worth more" } : victim.attackers.length > victim.defenders.length ? { san: move.san, fact: "outnumbered" } : { san: move.san };
        }

        return { san: move.san, fact: "same value" };
    });
}

/** The other side's moves tried on the same board without SAN, given only to the moves that do something. */
function threatsComputed(chess: Chess): Chances
{
    const other: Color = chess.turn() === "w" ? "b" : "w";
    const board = new Placement(chess);
    const moves = board.movesOf(other);
    // Written on the board of pieces alone, in chess.js's order; chess.js writes the rare move it cannot.
    const fallback = namesWithTurnPassed(chess);

    const nameOf = (move: Tried): Named | undefined => {
        const san = board.sanOf(move, moves) ?? fallback(move)?.san;
        return san === undefined ? undefined : { san, order: moves.indexOf(move) };
    };

    const promoting = moves.filter((move) => move.promotion !== undefined).flatMap((move) => {
        const name = nameOf(move);
        return name === undefined ? [] : [{ ...move, ...name }];
    });

    return chancesOf(strikesOf(chess, other, moves), nameOf, promotionsOf(promoting));
}

/** A side's double attacks, discovered and double checks, by the SAN of their moves; a move without one is left out. */
function chancesOf<T extends Tried>(strikes: readonly Strike<T>[], nameOf: (move: T) => Named | undefined, promotions: readonly string[]): Chances
{
    const named = strikes.flatMap((strike) => {
        const name = nameOf(strike.move);
        return name === undefined ? [] : [{ ...strike, ...name }];
    }).sort((one, two) => one.order - two.order);

    return {
        doubleAttacks: named.flatMap(({ san, attack }) => (attack === undefined ? [] : [{ san, ...attack }])),
        discoveredChecks: named.filter((strike) => !strike.double && strike.discovered).map((strike) => strike.san),
        doubleChecks: named.filter((strike) => strike.double).map((strike) => strike.san),
        promotions,
    };
}

/** What a move does to the other side. */
interface Strike<T extends Tried>
{
    readonly move: T;
    readonly double: boolean;
    readonly discovered: boolean;
    readonly attack?: { readonly targets: readonly Square[]; readonly fork: boolean; };
}

/** The moves of a side that check twice, check by uncovering a piece, or attack two targets, each tried on a board of pieces alone. */
function strikesOf<T extends Tried>(chess: Chess, side: Color, moves: readonly T[]): Strike<T>[]
{
    const board = new Placement(chess);
    // On a board of its own, which no move changes: the reach reads the board at each call.
    const before = remembered(attacksOf(new Placement(chess)));
    // A piece pinned to its king may attack more once the pin is gone: every move is looked at whole.
    const pinned = board.isPinned(side);

    return moves.flatMap((move) => {
        const passant = board.get(move.to) === undefined && move.from[0] !== move.to[0] && board.get(move.from)!.type === "p";
        const taken = board.play(move);
        const strike = pinned || passant || mayStrike(board, side, move) ? afterMove(board, side, move, taken, before) : undefined;
        board.undo();
        return strike !== undefined && (strike.double || strike.discovered || strike.attack !== undefined) ? [strike] : [];
    });
}

/**
 * A first look at a move just played, cheaper than the whole: the piece moved attacks the enemy king or two enemy pieces besides pawns, or it left a line
 * between a rook, bishop or queen of its side and an enemy piece besides a pawn. A move that does neither checks, forks and uncovers nothing.
 */
function mayStrike(board: Placement, side: Color, move: Tried): boolean
{
    const hit = board.attackedFrom(move.to).map((square) => board.get(square)).filter((piece) => piece !== undefined && piece.color !== side && piece.type !== "p");
    return hit.length >= 2 || hit.some((piece) => piece!.type === "k") || board.isBetween(move.from, side);
}

/** What a move just played on the board did: a double check, a discovered check, a fork or a double attack. */
function afterMove<T extends Tried>(board: Placement, side: Color, move: T, taken: Piece | undefined, before: Reach): Strike<T>
{
    const reach = remembered(attacksOf(board));
    const other: Color = side === "w" ? "b" : "w";
    const enemies = board.piecesOf(other);
    const king = enemies.find((piece) => piece.type === "k");
    const checkers = king === undefined ? [] : reach(king.square, side);
    const double = checkers.length >= 2;
    const discovered = checkers.some((square) => square !== move.to);
    const moved = board.get(move.to)!;

    // A piece of its side attacks an enemy piece it did not attack before the move: the piece moved, or one its move uncovered.
    const targetsOf = (attacker: Square) => enemies.filter((enemy) => enemy.type !== "p" && reach(enemy.square, side).includes(attacker) && isTarget(enemy, attacker));
    const isTarget = (enemy: Placed, attacker: Square) =>
        enemy.type === "k" || values[enemy.type] > values[board.get(attacker)!.type]
        || (reach(enemy.square, other).length === 0 && !reach(attacker, other).includes(enemy.square));
    const own = targetsOf(move.to);
    const fresh = own.filter((enemy) => !before(enemy.square, side).includes(move.from));
    const uncovered = board.piecesOf(side).filter((piece) => piece.square !== move.to && "rbq".includes(piece.type)).flatMap((line) =>
        targetsOf(line.square).filter((enemy) => enemy.type !== "k" && !before(enemy.square, side).includes(line.square))
    );

    const attackers = reach(move.to, other);
    const atRisk = attackers.length > 0 && (reach(move.to, side).length === 0 || Math.min(...attackers.map((square) => values[board.get(square)!.type])) < values[moved.type]);
    const fork = own.length >= 2 && fresh.length >= 1 && (!atRisk || double);
    const targets = [...new Set([...own, ...uncovered].map((enemy) => enemy.square))].sort();
    // A piece uncovered counts when the piece moved does something too: it attacks another target, takes, checks or promotes.
    const strikes = taken !== undefined || move.promotion !== undefined || checkers.length > 0;
    const withUncovered = uncovered.length > 0 && (targets.length >= 2 || strikes);

    return !fork && !withUncovered ? { move, double, discovered } : { move, double, discovered, attack: { targets, fork: uncovered.length === 0 } };
}

/** A reach that reads each square once for each side. */
function remembered(reach: Reach): Reach
{
    const known = new Map<string, Square[]>();

    return (square, color) => {
        const key = `${square}${color}`;
        let found = known.get(key);

        if (found === undefined) {
            found = reach(square, color);
            known.set(key, found);
        }

        return found;
    };
}

/** The promotions, a queen's for each pawn and square, and another piece's only when it checks or mates where the queen does not, or the queen stalemates and it does not. */
function promotionsOf(legal: readonly (Tried & { readonly san: string; })[], stalemates: readonly string[] = []): string[]
{
    const queens = legal.filter((move) => move.promotion === "q");
    const suffix = (san: string) => /[+#]$/.exec(san)?.[0] ?? "";

    const others = legal.filter((move) => {
        const queen = queens.find((each) => each.from === move.from && each.to === move.to)?.san ?? "";
        const checksAlone = suffix(move.san) !== "" && suffix(move.san) !== suffix(queen);
        return move.promotion !== undefined && move.promotion !== "q" && (checksAlone || (stalemates.includes(queen) && !stalemates.includes(move.san)));
    });

    return [...queens, ...others].map((move) => move.san);
}

/** The moves after which the other side, with few pieces, is not in check and has no legal move. */
function stalematesOf(chess: Chess, legal: readonly Move[]): string[]
{
    const other: Color = chess.turn() === "w" ? "b" : "w";

    if (officersOf(chess, other) > fewPieces + 1) {
        return [];
    }

    const board = new Chess(chess.fen());
    const placement = new Placement(chess);

    return legal.filter((move) => {
        // Castling moves a rook the board of pieces alone does not.
        if (move.san.startsWith("O-O")) {
            return stalemateAfter(board, [move]);
        }

        // A side with a move on the board of pieces alone is not stalemated; one without may still castle or take en passant, which chess.js tells.
        placement.play(move);
        const maybe = placement.piecesOf(other).filter((piece) => piece.type !== "k" && piece.type !== "p").length <= fewPieces && !placement.inCheck(other) && !placement.hasMove(other);
        placement.undo();
        return maybe && stalemateAfter(board, [move]);
    }).map((move) => move.san);
}

/** The moves of a side with few pieces after which a reply of the other side stalemates it, with those replies. */
function stalemateTrapsOf(chess: Chess, legal: readonly Move[]): StalemateTrap[]
{
    const side = chess.turn();

    if (officersOf(chess, side) > fewPieces) {
        return [];
    }

    const board = new Chess(chess.fen());
    const placement = new Placement(chess);
    // The board of pieces alone lists every reply but castling and en passant: where the other side may castle, or take a pawn just pushed two squares, chess.js does.
    const otherCastles = mayCastle(chess, side === "w" ? "b" : "w");

    return legal.flatMap((move) => {
        const pushedTwo = board.get(move.from)?.type === "p" && Math.abs(Number(move.to[1]) - Number(move.from[1])) === 2;
        const trap = otherCastles || pushedTwo || move.san.startsWith("O-O") ? trapByChess(board, move) : trapOnPlacement(placement, board, side, move);
        return trap === undefined ? [] : [trap];
    });
}

/** The replies to a move that stalemate the side that moved, tried on chess.js. */
function trapByChess(board: Chess, move: Move): StalemateTrap | undefined
{
    board.move(chessMove(move));
    const replies = board.moves({ verbose: true });
    const stalemating = replies.filter((reply) => stalemateAfter(board, [reply]));
    board.undo();
    return stalemating.length === 0 ? undefined : { san: move.san, replies: stalemating.length === replies.length ? "all" : stalemating.map((reply) => reply.san) };
}

/** The same, the replies tried on the board of pieces alone; chess.js names those that stalemate there, and tells whether castling or en passant saves the side. */
function trapOnPlacement(placement: Placement, board: Chess, side: Color, move: Move): StalemateTrap | undefined
{
    placement.play(move);
    const replies = placement.movesOf(side === "w" ? "b" : "w");
    const stalemating = replies.filter((reply) => {
        placement.play(reply);
        const maybe = !placement.inCheck(side) && !placement.hasMove(side);
        placement.undo();
        return maybe;
    });
    placement.undo();

    if (stalemating.length === 0) {
        return undefined;
    }

    board.move(chessMove(move));
    const nameOf = namesOn(() => board);
    const named = stalemating.flatMap((reply) => {
        const name = nameOf(reply);
        return name !== undefined && stalemateAfter(board, [reply]) ? [name] : [];
    }).sort((one, two) => one.order - two.order);
    board.undo();
    return named.length === 0 ? undefined : { san: move.san, replies: named.length === replies.length ? "all" : named.map((name) => name.san) };
}

/** Whether moves played on a chess.js board stalemate the side to move then; the board is left as it was. */
function stalemateAfter(board: Chess, moves: readonly Tried[]): boolean
{
    moves.forEach((move) => board.move(chessMove(move)));
    const stalemate = board.isStalemate();
    moves.forEach(() => board.undo());
    return stalemate;
}

function chessMove({ from, to, promotion }: Tried): { from: Square; to: Square; promotion?: PieceSymbol; }
{
    return promotion === undefined ? { from, to } : { from, to, promotion };
}

/** A side's pieces besides its king and pawns. */
function officersOf(chess: Chess, color: Color): number
{
    return chess.board().flat().filter((cell) => cell !== null && cell.color === color && cell.type !== "k" && cell.type !== "p").length;
}

/** The SAN of the other side's moves and their order, read on the board with the turn passed, which is set up only when a move needs it. */
function namesWithTurnPassed(chess: Chess): (move: Tried) => Named | undefined
{
    let passed: Chess | undefined;
    return namesOn(() => (passed ??= turnPassed(chess)));
}
