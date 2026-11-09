// The view of a position the AI reads (D-26): the facts the core computes, in the format a bench chose; never the grid, which is the player's.
import type { Facts, Material, PieceFacts, PieceLetter, Side, Square } from "../core/index.ts";

/** The view after the player's move: the check, the pieces attacked, then what is at risk, the pins, the checks and the moves of each piece. */
export function compactView(facts: Facts, turn: Side): string[]
{
    const names = namesOf(facts);
    const attacked = officersOf(facts).filter((piece) => piece.attackers.length > 0);
    const pieces = attacked.length === 0 ? ["Attacked pieces: none"] : ["Attacked pieces (attackers / defenders):", ...attacked.map((piece) => pieceLine(piece, names, true))];

    return [...checkLines(facts, turn, names), ...pieces, ...tacticLines(facts, turn, names)];
}

/** The view of a level without the tactical facts (D-60): the check and the legal moves by piece, which are the rules (D-17). */
export function boardView(facts: Facts, turn: Side): string[]
{
    const names = namesOf(facts);
    return [...checkLines(facts, turn, names), ...legalLines(facts, names)];
}

/** The whole view, for look: every piece with its attackers and defenders, then the same lines as the compact view. */
export function fullView(facts: Facts, turn: Side): string[]
{
    const names = namesOf(facts);
    const sides = sidesInOrder.flatMap((side) => [
        `${colourName(side)} pieces (attackers / defenders):`,
        ...officersOf(facts).filter((piece) => piece.side === side).map((piece) => pieceLine(piece, names, false)),
    ]);

    return [...checkLines(facts, turn, names), ...sides, ...tacticLines(facts, turn, names)];
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

/** What is at risk, loose and pinned, the checks of both sides, and the legal moves of the side to move by piece. */
function tacticLines(facts: Facts, turn: Side, names: Names): string[]
{
    const list = (squares: readonly Square[]) => bySide(facts, squares, names) || "none";
    const atRisk = facts.undefended.length === 0 && facts.attackedByCheaper.length === 0 && facts.outnumbered.length === 0
        ? "At risk: none"
        : `Attacked and undefended: ${list(facts.undefended)}; defended, but attacked by a cheaper piece: ${list(facts.attackedByCheaper)}; `
            + `attacked more times than defended: ${list(facts.outnumbered)}`;
    const pins = facts.pins.map((pin) => `${names.sided(pin.square)} to ${names.piece(pin.to)} by ${names.piece(pin.by)}`);

    return [
        atRisk,
        `Loose: ${list(facts.loose)}`,
        `Pinned: ${pins.join(", ") || "none"}`,
        ...checksLines(facts, turn),
        ...legalLines(facts, names),
    ];
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
