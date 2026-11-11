// The view of a position the AI reads (D-26): the facts the core computes, in the format a bench chose; never the grid, which is the player's.
import type { Chances, DoubleAttack, Facts, Material, PieceFacts, PieceLetter, Possibilities, Side, Square } from "../../core/index.ts";

/** What the moves would do (D-100), and the other side's threats, none in check. */
export interface Possible
{
    readonly possibilities: Possibilities;
    readonly threats: Chances | undefined;
    /** The level sees the threats' double attacks and discovered checks, and the stalemate traps: from the strong level up. */
    readonly strong: boolean;
}

/**
 * The view after the player's move, in the masters' order (D-100): the check, the checks, the captures, the threats, what the moves would do, the pins,
 * skewers and loose pieces, the pieces attacked, the moves of each piece.
 */
export function compactView(facts: Facts, turn: Side, possible?: Possible): string[]
{
    const names = namesOf(facts);
    const attacked = officersOf(facts).filter((piece) => piece.attackers.length > 0);
    const pieces = attacked.length === 0 ? ["Attacked pieces: none"] : ["Attacked pieces (attackers / defenders):", ...attacked.map((piece) => pieceLine(piece, names, true))];

    return [...checkLines(facts, turn, names), ...tacticLines(facts, turn, names, possible, pieces)];
}

/** The view of a level without the tactical facts (D-60): the check and the legal moves by piece, which are the rules (D-17). */
export function boardView(facts: Facts, turn: Side): string[]
{
    const names = namesOf(facts);
    return [...checkLines(facts, turn, names), ...legalLines(facts, names)];
}

/** The whole view, for look: the same lines as the compact view, with every piece's attackers and defenders. */
export function fullView(facts: Facts, turn: Side, possible?: Possible): string[]
{
    const names = namesOf(facts);
    const sides = sidesInOrder.flatMap((side) => [
        `${colourName(side)} pieces (attackers / defenders):`,
        ...officersOf(facts).filter((piece) => piece.side === side).map((piece) => pieceLine(piece, names, false)),
    ]);

    return [...checkLines(facts, turn, names), ...tacticLines(facts, turn, names, possible, sides)];
}

/** What the moves of the side to move would do, in one line for a move of the analysis: fork Nc7+ (Ke8 Ra8); stalemate Qf7; none when nothing. */
export function tacticsText(facts: Facts, possibilities: Possibilities, withTraps: boolean): string | undefined
{
    const names = namesOf(facts);
    const traps = withTraps ? possibilities.stalemateTraps.map(({ san, replies }) => `${san} (if ${replies === "all" ? "any reply" : replies.join(" or ")})`) : [];
    const parts = [
        ...chanceParts(possibilities, names),
        kindPart("stalemate", possibilities.stalemates),
        kindPart("stalemate trap", traps),
    ].filter((part) => part !== undefined);

    return parts.length === 0 ? undefined : parts.join("; ");
}

/** What is at risk, in one line for a move of the analysis (D-68): undefended Black Nf6; by a cheaper piece White Qd1; outnumbered Black Pe5; none when nothing is. */
export function riskLine(facts: Facts): string | undefined
{
    const names = namesOf(facts);
    const kinds = [["undefended", facts.undefended], ["by a cheaper piece", facts.attackedByCheaper], ["outnumbered", facts.outnumbered]] as const;
    const text = kinds.filter(([, squares]) => squares.length > 0).map(([kind, squares]) => `${kind} ${bySide(facts, squares, names)}`).join("; ");
    return text === "" ? undefined : text;
}

export function colourName(side: Side): string
{
    return side === "white" ? "White" : "Black";
}

/** The material as the player sees it beside the board (D-59): who is ahead and by how much, and the pieces each side took. */
export function materialText(material: Material): string
{
    const ahead = balanceText(material.balance);

    if (material.taken.white.length === 0 && material.taken.black.length === 0) {
        return `${ahead}, nothing taken`;
    }

    return `${ahead} (White took ${takenText(material.taken.white)}, Black took ${takenText(material.taken.black)})`;
}

/** Who is ahead in material, and by how many pawns: White +2, or even. */
export function balanceText(balance: number): string
{
    return balance === 0 ? "even" : `${balance > 0 ? "White" : "Black"} +${Math.abs(balance)}`;
}

/** The pieces taken, counted by kind: Q 2R 7P. */
function takenText(taken: readonly PieceLetter[]): string
{
    const kinds = [...new Set(taken)];
    return kinds.map((piece) => {
        const count = taken.filter((other) => other === piece).length;
        return count === 1 ? piece : `${count}${piece}`;
    }).join(" ") || "nothing";
}

const sidesInOrder: readonly Side[] = ["white", "black"];

/** A square's piece as SAN writes it, with P for a pawn (Nf6), and with its colour (Black Nf6). */
interface Names
{
    piece: (square: Square) => string;
    sided: (square: Square) => string;
}

type Moving = PieceFacts & { readonly moves: readonly string[]; };

/** The check the side to move is in, from which pieces; none when it is not. */
function checkLines(facts: Facts, turn: Side, names: Names): string[]
{
    return facts.checkedBy === undefined ? [] : [`${colourName(turn)} is in check from ${facts.checkedBy.map(names.piece).join(" and ")}.`];
}

/**
 * In the masters' order (D-100): the side to move's checks and captures, the threats (what is at risk, the other side's checks and chances), what its
 * moves would do, the pins, skewers and loose pieces, the pieces in detail, its legal moves by piece.
 */
function tacticLines(facts: Facts, turn: Side, names: Names, possible: Possible | undefined, detail: readonly string[]): string[]
{
    const list = (squares: readonly Square[]) => bySide(facts, squares, names) || "none";
    const atRisk = facts.undefended.length === 0 && facts.attackedByCheaper.length === 0 && facts.outnumbered.length === 0
        ? "At risk: none"
        : `Attacked and undefended: ${list(facts.undefended)}; defended, but attacked by a cheaper piece: ${list(facts.attackedByCheaper)}; `
            + `attacked more times than defended: ${list(facts.outnumbered)}`;
    const pins = facts.pins.map((pin) => `${names.sided(pin.square)} to ${names.piece(pin.to)} by ${names.piece(pin.by)}`);
    const skewers = facts.skewers.map((skewer) => `${names.sided(skewer.square)} with ${names.piece(skewer.to)} behind, by ${names.piece(skewer.by)}`);
    const [ownChecks, ...otherChecks] = checksLines(facts, turn);
    // A game over has no moves to tell of.
    const moves = possible !== undefined && facts.pieces.some((piece) => (piece.moves?.length ?? 0) > 0) ? possible : undefined;

    return [
        ownChecks!,
        ...(moves === undefined ? [] : [captureLine(moves.possibilities)]),
        atRisk,
        ...otherChecks,
        ...(moves === undefined ? [] : threatLines(moves, turn, names)),
        ...(moves === undefined ? [] : [`${colourName(turn)} (to move) tactics: ${tacticsText(facts, moves.possibilities, moves.strong) ?? "none"}`]),
        `Pinned: ${pins.join(", ") || "none"}`,
        ...(skewers.length === 0 ? [] : [`Skewered: ${skewers.join(", ")}`]),
        `Loose: ${list(facts.loose)}`,
        ...detail,
        ...legalLines(facts, names),
    ];
}

/** The captures of the side to move, each with what the piece taken is to the piece taking it. */
function captureLine({ captures }: Possibilities): string
{
    return `Captures: ${captures.map((capture) => (capture.fact === undefined ? capture.san : `${capture.san} (${capture.fact})`)).join(", ") || "none"}`;
}

/** What the other side's moves would do if it were to move: its promotions, and as the level sees them its double attacks and discovered checks. */
function threatLines({ threats, strong }: Possible, turn: Side, names: Names): string[]
{
    if (threats === undefined) {
        return [];
    }

    const parts = [
        kindPart("promote", threats.promotions),
        ...(strong ? chanceParts({ ...threats, promotions: [] }, names) : []),
    ].filter((part) => part !== undefined);

    return parts.length === 0 ? [] : [`${colourName(turn === "white" ? "black" : "white")} threats, if it were to move: ${parts.join("; ")}`];
}

/** A side's forks, double attacks, double and discovered checks and promotions, each kind with its moves. */
function chanceParts(chances: Chances, names: Names): (string | undefined)[]
{
    const attack = ({ san, targets }: DoubleAttack) => `${san} (${targets.map(names.piece).join(" ")})`;

    return [
        kindPart("fork", chances.doubleAttacks.filter((each) => each.fork).map(attack)),
        kindPart("double attack", chances.doubleAttacks.filter((each) => !each.fork).map(attack)),
        kindPart("double check", chances.doubleChecks),
        kindPart("discovered check", chances.discoveredChecks),
        kindPart("promote", chances.promotions),
    ];
}

/** A kind with its moves, comma-separated; none without moves. */
function kindPart(kind: string, moves: readonly string[]): string | undefined
{
    return moves.length === 0 ? undefined : `${kind} ${moves.join(", ")}`;
}

/** The checks the side to move can give, and those the other side could give if it were to move; one line when neither has any. */
function checksLines(facts: Facts, turn: Side): string[]
{
    if (facts.checks.length === 0 && facts.otherChecks?.length === 0) {
        return ["Checks: none for either side"];
    }

    const other = colourName(turn === "white" ? "black" : "white");
    const theirs = facts.otherChecks === undefined ? [] : [`Checks ${other} could give if it were to move: ${facts.otherChecks.join(" ") || "none"}`];
    return [`Checks ${colourName(turn)} (to move) can give: ${facts.checks.join(" ") || "none"}`, ...theirs];
}

/** The legal moves of the side to move by piece, with how many, and its pieces that have none; nothing when it has no move, the game over. */
function legalLines(facts: Facts, names: Names): string[]
{
    const mine = facts.pieces.filter((piece): piece is Moving => piece.moves !== undefined);
    const moving = mine.filter((piece) => piece.moves.length > 0);
    const stuck = mine.filter((piece) => piece.moves.length === 0).map((piece) => names.piece(piece.square));
    const count = moving.reduce((total, piece) => total + piece.moves.length, 0);

    if (count === 0) {
        return [];
    }

    const byPiece = moving.map((piece) => `${names.piece(piece.square)} (${piece.moves.length}) ${piece.moves.join(" ")}`);
    return [`Legal by piece (${count}): ${[...byPiece, ...(stuck.length === 0 ? [] : [`no moves: ${stuck.join(" ")}`])].join("; ")}`];
}

/** A piece with the pieces that attack it and those that defend it, the pieces lined up behind them in brackets: Pf7: Bc4 Ng5 / Ke8; Qd2(+Rd1). */
function pieceLine(piece: PieceFacts, names: Names, withSide: boolean): string
{
    const list = (squares: readonly Square[]) => squares.map((square) => `${names.piece(square)}${behindOf(piece, square, names)}`).join(" ") || "-";
    const name = withSide ? names.sided(piece.square) : names.piece(piece.square);
    return `${name}: ${list(piece.attackers)} / ${list(piece.defenders)}`;
}

function behindOf(piece: PieceFacts, square: Square, names: Names): string
{
    const behind = piece.behind?.[square];
    return behind === undefined ? "" : `(+${behind.map(names.piece).join("+")})`;
}

/** Pieces by side, White's first: White Ra1 Pb2, Black Ra8. */
function bySide(facts: Facts, squares: readonly Square[], names: Names): string
{
    const sideAt = new Map(facts.pieces.map((piece) => [piece.square, piece.side]));
    const groups = sidesInOrder.map((side) => [side, squares.filter((square) => sideAt.get(square) === side)] as const).filter(([, group]) => group.length > 0);
    return groups.map(([side, group]) => `${colourName(side)} ${group.map(names.piece).join(" ")}`).join(", ");
}

/** The pieces but the kings: a king attacked is a check, said in its own line, and a king is never defended. */
function officersOf(facts: Facts): PieceFacts[]
{
    return facts.pieces.filter((piece) => piece.piece !== "K");
}

function namesOf(facts: Facts): Names
{
    const pieces = new Map(facts.pieces.map((piece) => [piece.square, piece]));

    const piece = (square: Square) => {
        const found = pieces.get(square);
        return found === undefined ? square : `${found.piece}${square}`;
    };

    const sided = (square: Square) => {
        const found = pieces.get(square);
        return found === undefined ? square : `${colourName(found.side)} ${found.piece}${square}`;
    };

    return { piece, sided };
}
