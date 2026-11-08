// What the helps show of a position (D-78, D-79): Chesspal's facts, the tactics and the strategy, at every level of the AI.
import type { Game, PieceFacts, Profile, Side, SideProfile, Square } from "../core/index.ts";

/** The helps of a position, for the board and the card. */
export interface HelpsView
{
    /** Who moves: the checks are theirs, the other checks the other side's. */
    readonly toMove: Side;
    /** Undefended first, then attacked by a cheaper piece, then outnumbered: three lists that never share a piece. */
    readonly atRisk: readonly PieceAtRisk[];
    readonly pins: readonly PinnedPiece[];
    readonly checks: readonly string[];
    readonly otherChecks: readonly string[];
    readonly loose: readonly PieceFacts[];
    /** The profile: the strategy and the control map. */
    readonly strategy: Profile;
}

/** A piece at risk and why. */
export interface PieceAtRisk
{
    readonly piece: PieceFacts;
    readonly why: "undefended" | "cheaper" | "outnumbered";
}

/** A pinned piece, the piece that pins it and the one behind it. */
export interface PinnedPiece
{
    readonly piece: PieceFacts;
    readonly by: PieceFacts;
    readonly to: PieceFacts;
}

/** The helps of a game's position, whatever the AI's level (D-79). */
export function helpsOf(game: Game): HelpsView
{
    const facts = game.facts;
    const pieces = new Map(facts.pieces.map((piece) => [piece.square, piece]));
    const on = (square: Square): PieceFacts => pieces.get(square)!;
    const atRisk = (squares: readonly Square[], why: PieceAtRisk["why"]): PieceAtRisk[] => squares.map((square) => ({ piece: on(square), why }));

    return {
        toMove: game.position.turn,
        atRisk: [...atRisk(facts.undefended, "undefended"), ...atRisk(facts.attackedByCheaper, "cheaper"), ...atRisk(facts.outnumbered, "outnumbered")],
        pins: facts.pins.map((pin) => ({ piece: on(pin.square), by: on(pin.by), to: on(pin.to) })),
        checks: facts.checks,
        otherChecks: facts.otherChecks ?? [],
        loose: facts.loose.map(on),
        strategy: game.profile,
    };
}

/** Whether the helps mark a square's piece as at risk. */
export function atRiskOn(helps: HelpsView, square: string): boolean
{
    return helps.atRisk.some((risk) => risk.piece.square === square);
}

/** A line of the strategy's table: one fact of the profile for each side. */
export interface StrategyLine
{
    readonly row: StrategyRow;
    readonly white: StrategyCell;
    readonly black: StrategyCell;
}

export type StrategyRow = keyof typeof cells;

/** The groups the strategy's lines stand in on the card, each under its figure (Stefano). */
export type StrategyGroup = "pawns" | "pieces" | "king";

/** Which group each line of the strategy's table stands in. */
export const groupOf: Readonly<Record<StrategyRow, StrategyGroup>> = {
    isolated: "pawns",
    doubled: "pawns",
    backward: "pawns",
    passed: "pawns",
    islands: "pawns",
    halfOpen: "pieces",
    heavyOnFiles: "pieces",
    onSeventh: "pieces",
    outposts: "pieces",
    bishopPair: "pieces",
    space: "pieces",
    undeveloped: "pieces",
    castled: "king",
    kingAttacks: "king",
};

/** Squares or files, a count, a yes or no, or how a side castled: "unknown" when the game began from a FEN and the side has no right left. */
export type StrategyCell = readonly string[] | number | boolean | "O-O" | "O-O-O" | "not-yet" | "no-more" | "unknown";

/** The strategy's table: only the lines where a side has something; the pawn islands only when a side has more than one. */
export function strategyOf(profile: Profile): StrategyLine[]
{
    const lines = Object.entries(cells).map(([row, cell]) => ({ row: row as StrategyRow, white: cell(profile.white), black: cell(profile.black) }));
    const split = profile.white.pawns.islands.length > 1 || profile.black.pawns.islands.length > 1;
    return lines.filter((line) => line.row === "islands" ? split : something(line.white) || something(line.black));
}

const cells = {
    isolated: (side: SideProfile): StrategyCell => side.pawns.isolated,
    doubled: (side: SideProfile): StrategyCell => side.pawns.doubled,
    backward: (side: SideProfile): StrategyCell => side.pawns.backward,
    passed: (side: SideProfile): StrategyCell => side.pawns.passed,
    islands: (side: SideProfile): StrategyCell => side.pawns.islands,
    halfOpen: (side: SideProfile): StrategyCell => side.halfOpenFiles,
    heavyOnFiles: (side: SideProfile): StrategyCell => side.heavyOnFiles,
    onSeventh: (side: SideProfile): StrategyCell => side.onSeventh,
    outposts: (side: SideProfile): StrategyCell => side.outposts.map((outpost) => outpost.square),
    bishopPair: (side: SideProfile): StrategyCell => side.bishopPair,
    space: (side: SideProfile): StrategyCell => side.space,
    undeveloped: (side: SideProfile): StrategyCell => side.undeveloped,
    castled: castlingOf,
    kingAttacks: (side: SideProfile): StrategyCell => side.king?.attacksNear ?? 0,
};

function castlingOf(side: SideProfile): StrategyCell
{
    if (side.castled === "O-O" || side.castled === "O-O-O") {
        return side.castled;
    }

    return side.castlingRights.length > 0 ? "not-yet" : side.castled === "no" ? "no-more" : "unknown";
}

function something(cell: StrategyCell): boolean
{
    return typeof cell === "object" ? cell.length > 0 : typeof cell === "number" ? cell > 0 : typeof cell === "boolean" ? cell : cell !== "unknown";
}
