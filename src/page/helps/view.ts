// What the helps show of a position (D-78, D-79): Chesspal's facts, the tactics and the strategy, at every level of the AI.
import type { Game, PieceFacts, Profile, Side, SideProfile, Square } from "../../core/index.ts";

/** The helps of a position, for the board and the card. */
export interface HelpsView
{
    /** Who moves: the checks are theirs, the other checks the other side's. */
    readonly toMove: Side;
    /** The player's side, from which the helps are seen (D-91); none in the analysis of a game they did not play. */
    readonly you: Side | undefined;
    /** Undefended first, then attacked by a cheaper piece, then outnumbered: three lists that never share a piece. */
    readonly atRisk: readonly PieceAtRisk[];
    readonly pins: readonly PinnedPiece[];
    readonly skewers: readonly SkeweredPiece[];
    readonly checks: readonly string[];
    readonly otherChecks: readonly string[];
    readonly loose: readonly PieceFacts[];
    /** The tactics' lines of the card: the player's threats first, then their chances; by side, White first, when no side is theirs. */
    readonly lines: readonly TacticLine[];
    /** The profile: the strategy and the control map. */
    readonly strategy: Profile;
    /** The strategy's sides in their columns: the player's first, else White. */
    readonly sides: readonly [Side, Side];
}

/** Whose a fact is to the player (D-91): a threat to them, a chance for them, or neither when the page does not know their side. */
export type Tone = "threat" | "chance" | "neutral";

/** A line of the tactics: one kind of fact of one side, its pieces at risk, pinned or skewered, or the checks it gives; the loose pieces of both. */
export type TacticLine =
    | { readonly kind: "risk"; readonly side: Side; readonly tone: Tone; readonly items: readonly PieceAtRisk[]; }
    | { readonly kind: "pin"; readonly side: Side; readonly tone: Tone; readonly items: readonly PinnedPiece[]; }
    | { readonly kind: "skewer"; readonly side: Side; readonly tone: Tone; readonly items: readonly SkeweredPiece[]; }
    | { readonly kind: "check"; readonly side: Side; readonly tone: Tone; readonly toMove: boolean; readonly items: readonly string[]; }
    | { readonly kind: "loose"; readonly tone: "neutral"; readonly items: readonly PieceFacts[]; };

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

/** A skewered piece: the piece in front, the one that skewers it, and the one behind it. */
export type SkeweredPiece = PinnedPiece;

/** The helps of a game's position, whatever the AI's level (D-79), seen from the player's side when the page knows it (D-91). */
export function helpsOf(game: Game, you?: Side): HelpsView
{
    const facts = game.facts;
    const pieces = new Map(facts.pieces.map((piece) => [piece.square, piece]));
    const on = (square: Square): PieceFacts => pieces.get(square)!;
    const risks = (squares: readonly Square[], why: PieceAtRisk["why"]): PieceAtRisk[] => squares.map((square) => ({ piece: on(square), why }));
    const toMove = game.position.turn;
    const atRisk = [...risks(facts.undefended, "undefended"), ...risks(facts.attackedByCheaper, "cheaper"), ...risks(facts.outnumbered, "outnumbered")];
    const pins = facts.pins.map((pin) => ({ piece: on(pin.square), by: on(pin.by), to: on(pin.to) }));
    const skewers = facts.skewers.map((skewer) => ({ piece: on(skewer.square), by: on(skewer.by), to: on(skewer.to) }));
    const checks = facts.checks;
    const otherChecks = facts.otherChecks ?? [];
    const loose = facts.loose.map(on);

    return {
        toMove,
        you,
        atRisk,
        pins,
        skewers,
        checks,
        otherChecks,
        loose,
        lines: tacticLines({ toMove, atRisk, pins, skewers, checks, otherChecks, loose }, you),
        strategy: game.profile,
        sides: you === "black" ? ["black", "white"] : ["white", "black"],
    };
}

/** How the helps mark a square's piece at risk (D-91): red when it is the player's, green when it is the other side's, in ink when no side is theirs. */
export function riskOn(helps: HelpsView, square: string): Tone | undefined
{
    const risk = helps.atRisk.find((risk) => risk.piece.square === square);
    return risk === undefined ? undefined : toneOf(risk.piece.side, helps.you);
}

/** How the helps mark a square's pinned piece: in the tone of a piece at risk, red when it is the player's, green when it is the other side's (D-91). */
export function pinOn(helps: HelpsView, square: string): Tone | undefined
{
    const pin = helps.pins.find((pin) => pin.piece.square === square);
    return pin === undefined ? undefined : toneOf(pin.piece.side, helps.you);
}

/** How the helps mark a square's skewered piece, the one in front: in the tone of a piece at risk, as a pinned one (D-91). */
export function skewerOn(helps: HelpsView, square: string): Tone | undefined
{
    const skewer = helps.skewers.find((skewer) => skewer.piece.square === square);
    return skewer === undefined ? undefined : toneOf(skewer.piece.side, helps.you);
}

/** The squares a line of the tactics lights on the board: its pieces, and those that attack, pin or skewer them; none for the checks. */
export function squaresOf(line: TacticLine): readonly string[]
{
    switch (line.kind) {
        case "risk":
            return line.items.flatMap(riskSquares);
        case "pin":
        case "skewer":
            return line.items.flatMap(pinSquares);
        case "check":
            return [];
        case "loose":
            return line.items.map((piece) => piece.square);
    }
}

/** A piece at risk and its attackers. */
export function riskSquares(risk: PieceAtRisk): readonly string[]
{
    return [risk.piece.square, ...risk.piece.attackers];
}

/** A pinned or skewered piece, the one that pins or skewers it and the one behind it. */
export function pinSquares(pin: PinnedPiece): readonly string[]
{
    return [pin.piece.square, pin.by.square, pin.to.square];
}

/** A line of the strategy: one fact of the profile for each side, or the open files, which are both sides'. */
export type StrategyLine =
    | { readonly row: SideRow; readonly white: StrategyCell; readonly black: StrategyCell; }
    | { readonly row: "openFiles"; readonly both: readonly string[]; };

/** A line of the strategy with a cell for each side. */
export type SideRow = keyof typeof cells;

export type StrategyRow = SideRow | "openFiles";

/** The groups the strategy's lines stand in on the card, pawns, pieces and king (Stefano). */
export type StrategyGroup = "pawns" | "pieces" | "king";

/** Which group each line of the strategy stands in. */
export const groupOf: Readonly<Record<StrategyRow, StrategyGroup>> = {
    isolated: "pawns",
    doubled: "pawns",
    backward: "pawns",
    passed: "pawns",
    islands: "pawns",
    openFiles: "pieces",
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

/**
 * The strategy's lines: only those where a side has something, the pawn islands only when a side has more than one; the open files, when there are any,
 * first among the pieces' lines.
 */
export function strategyOf(profile: Profile): StrategyLine[]
{
    const lines = Object.entries(cells).map(([row, cell]) => ({ row: row as SideRow, white: cell(profile.white), black: cell(profile.black) }));
    const split = profile.white.pawns.islands.length > 1 || profile.black.pawns.islands.length > 1;
    const shown: StrategyLine[] = lines.filter((line) => line.row === "islands" ? split : something(line.white) || something(line.black));

    if (profile.openFiles.length === 0) {
        return shown;
    }

    const pawnLines = shown.filter((line) => groupOf[line.row] === "pawns");
    const otherLines = shown.filter((line) => groupOf[line.row] !== "pawns");
    return [...pawnLines, { row: "openFiles", both: profile.openFiles }, ...otherLines];
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

// The tactics' lines that have something: with the player's side, their pieces at risk, pinned and skewered and the other side's checks, then the same the
// other way round; without it, White's then Black's; the loose pieces last.
function tacticLines(facts: Pick<HelpsView, "toMove" | "atRisk" | "pins" | "skewers" | "checks" | "otherChecks" | "loose">, you: Side | undefined): TacticLine[]
{
    const sideLines = (side: Side): TacticLine[] => [
        { kind: "risk", side, tone: toneOf(side, you), items: facts.atRisk.filter((risk) => risk.piece.side === side) },
        { kind: "pin", side, tone: toneOf(side, you), items: facts.pins.filter((pin) => pin.piece.side === side) },
        { kind: "skewer", side, tone: toneOf(side, you), items: facts.skewers.filter((skewer) => skewer.piece.side === side) },
    ];
    const checkLine = (side: Side): TacticLine => ({
        kind: "check",
        side,
        tone: you === undefined ? "neutral" : side === you ? "chance" : "threat",
        toMove: side === facts.toMove,
        items: side === facts.toMove ? facts.checks : facts.otherChecks,
    });
    // The player's threats are their pieces' troubles and the other side's checks; their chances the other way round.
    const lines = you === undefined
        ? [...sideLines("white"), checkLine("white"), ...sideLines("black"), checkLine("black")]
        : [...sideLines(you), checkLine(otherSide(you)), ...sideLines(otherSide(you)), checkLine(you)];

    const loose: TacticLine = { kind: "loose", tone: "neutral", items: facts.loose };
    return [...lines, loose].filter((line) => line.items.length > 0);
}

function otherSide(side: Side): Side
{
    return side === "white" ? "black" : "white";
}

// A piece's trouble is a threat to its side's player and a chance for the other.
function toneOf(side: Side, you: Side | undefined): Tone
{
    return you === undefined ? "neutral" : side === you ? "threat" : "chance";
}

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
