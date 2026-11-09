// The positional profile (D-19): pawns, files, bishops, outposts, space and centre, mobility, development, king safety, control, phase, draws and
// the geometry of pawn endings, each a separate fact; never weighed, never summed.
import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";
import { attacksOf, fileOf, type PieceLetter, rankOf } from "./facts.ts";
import type { Move, Side } from "./game.ts";
import { type Material, materialOf } from "./material.ts";

/** The pawns of a side, by kind; a pawn may be of several. */
export interface PawnFacts
{
    /** No pawn of its side on the files beside it. */
    readonly isolated: readonly Square[];
    /** Another pawn of its side on its file. */
    readonly doubled: readonly Square[];
    /** Pawns of its side beside it, all of them further on, and the square in front of it attacked by an enemy pawn. */
    readonly backward: readonly Square[];
    /** No enemy pawn in front of it, on its file or the files beside it. */
    readonly passed: readonly Square[];
    /** Groups of neighbouring files with pawns of its side, by their files: "a-b", "d", "f-h". */
    readonly islands: readonly string[];
}

/** A bishop with how many pawns of its side stand on squares of its colour. */
export interface BishopFacts
{
    readonly square: Square;
    readonly pawnsOnColour: number;
    readonly pawns: number;
}

/** A square on the side's ranks 4 to 6, defended by its pawn, that no enemy pawn can ever attack and no pawn stands on; with the piece of the side on it. */
export interface Outpost
{
    readonly square: Square;
    readonly piece?: PieceLetter;
}

/** Around a side's king: its pawns in front of it, the files beside it without a pawn of its side, and how many enemy attacks fall on the squares next to it. */
export interface KingFacts
{
    readonly square: Square;
    readonly shield: readonly Square[];
    readonly openFiles: readonly string[];
    readonly attacksNear: number;
}

/** The profile of one side. */
export interface SideProfile
{
    readonly pawns: PawnFacts;
    /** Files with enemy pawns and none of its own. */
    readonly halfOpenFiles: readonly string[];
    /** Its rooks and queens on open or half-open files. */
    readonly heavyOnFiles: readonly Square[];
    /** Its rooks and queens on the enemy's second rank: the seventh for White, the second for Black. */
    readonly onSeventh: readonly Square[];
    readonly bishopPair: boolean;
    readonly bishops: readonly BishopFacts[];
    readonly outposts: readonly Outpost[];
    /** Squares of the other half that one of its pieces attacks. */
    readonly space: number;
    /** Its legal moves by piece, as if it were to move; left out for the side not to move when the other is in check. */
    readonly mobility?: Readonly<Partial<Record<PieceLetter, number>>>;
    /** Its knights and bishops still on their first squares. */
    readonly undeveloped: readonly Square[];
    /** How it castled, or "no"; left out when the game began from a FEN and it has not castled since, which says nothing of before. */
    readonly castled?: "O-O" | "O-O-O" | "no";
    readonly castlingRights: readonly ("O-O" | "O-O-O")[];
    readonly king?: KingFacts;
}

/** Who stands on a central square and how many pieces of each side attack it. */
export interface CentreSquare
{
    readonly square: Square;
    readonly piece?: { readonly letter: PieceLetter; readonly side: Side; };
    readonly white: number;
    readonly black: number;
}

/**
 * The game's phase, by a rule, never a judgment of the position: endgame when the pieces but pawns and kings add up to 26 or less (62 at the start, N and B
 * 3, R 5, Q 9); opening while they add up to 56 or more, by move 15, and a knight or bishop is still on its first square; middlegame otherwise.
 */
export type Phase = "opening" | "middlegame" | "endgame";

/** A passed pawn of a pawn ending with whether the enemy king is inside its square, the side to move counted. */
export interface PawnSquare
{
    readonly pawn: Square;
    readonly caught: boolean;
}

/** The profile of a position (D-19): data for the AI and the page, never a judgment. */
export interface Profile
{
    readonly material: Material;
    readonly white: SideProfile;
    readonly black: SideProfile;
    /** Files without pawns. */
    readonly openFiles: readonly string[];
    /** One bishop each, on squares of different colours. */
    readonly oppositeBishops: boolean;
    readonly centre: readonly CentreSquare[];
    /** For each square, how many pieces of each side attack it, as the facts count them (a piece pinned to its king only along the pin): [White, Black]. */
    readonly control: Readonly<Partial<Record<Square, readonly [number, number]>>>;
    /** How many squares only White attacks, only Black, and both. */
    readonly controlled: { readonly white: number; readonly black: number; readonly contested: number; };
    readonly phase: Phase;
    /** How many times the position has stood with this side to move, now included; the half-moves left before the fifty-move draw; material too little to mate. */
    readonly draw: { readonly repetitions: number; readonly fiftyMovesLeft: number; readonly insufficient: boolean; };
    /** Only kings and pawns: the rule of the square for each passed pawn, and the side that has the opposition, when the kings stand in it. */
    readonly pawnEnding?: { readonly squares: readonly PawnSquare[]; readonly opposition?: Side; };
}

/** What the profile needs of the game's past: how many times the position has stood, now included, how each side castled, and whether it began from a FEN. */
export interface Past
{
    readonly repetitions: number;
    readonly castled: Readonly<Partial<Record<Side, "O-O" | "O-O-O">>>;
    readonly fromFen: boolean;
}

/** The profile of a chess.js board and its game's past: computed once for each position and past, and frozen. */
export function profileOf(chess: Chess, past: Past, legal: readonly Move[]): Profile
{
    // The FEN, not the hash: the fifty-move count and the move number are facts of the profile too.
    const key = `${chess.fen()} ${past.repetitions} ${past.castled.white ?? ""} ${past.castled.black ?? ""} ${past.fromFen}`;
    let profile = profileByPosition.get(key);

    if (profile === undefined) {
        profile = deepFrozen(computed(chess, past.repetitions, { w: castledOf(past, "white"), b: castledOf(past, "black") }, legal));

        if (profileByPosition.size >= positionsKept) {
            profileByPosition.delete(profileByPosition.keys().next().value!);
        }

        profileByPosition.set(key, profile);
    }

    return profile;
}

const profileByPosition = new Map<string, Profile>();
const positionsKept = 256;

const files = "abcdefgh";
const allSquares = [..."abcdefgh"].flatMap((file) => [1, 2, 3, 4, 5, 6, 7, 8].map((rank) => `${file}${rank}` as Square));
const centreSquares: readonly Square[] = ["d4", "e4", "d5", "e5"];
const pieceValues: Readonly<Record<PieceSymbol, number>> = { p: 0, n: 3, b: 3, r: 5, q: 9, k: 0 };
const firstSquares: Readonly<Record<Color, readonly [Square, PieceSymbol][]>> = {
    w: [["b1", "n"], ["g1", "n"], ["c1", "b"], ["f1", "b"]],
    b: [["b8", "n"], ["g8", "n"], ["c8", "b"], ["f8", "b"]],
};

type Castled = Partial<Record<Color, "O-O" | "O-O-O" | "no">>;

interface Placed
{
    square: Square;
    type: PieceSymbol;
    color: Color;
}

function computed(chess: Chess, repetitions: number, castled: Castled, legal: readonly Move[]): Profile
{
    const placed = chess.board().flat().filter((cell) => cell !== null).map(({ square, type, color }) => ({ square, type, color }));
    const attackers = attacksOf(chess);
    const control = Object.fromEntries(allSquares.map((square) => [square, [attackers(square, "w").length, attackers(square, "b").length] as const]));
    const pawnsOn = (color: Color, file: number) => placed.filter((piece) => piece.type === "p" && piece.color === color && fileOf(piece.square) === file);
    const openFiles = [...files].filter((_, file) => pawnsOn("w", file).length === 0 && pawnsOn("b", file).length === 0);
    const bishops = placed.filter((piece) => piece.type === "b");
    const onlyKingsAndPawns = placed.every((piece) => piece.type === "k" || piece.type === "p");
    const mobility = mobilityOf(chess, legal);
    const side = (color: Color): SideProfile => sideProfile(chess, color, placed, control, castled[color], mobility[color]);
    const counts = allSquares.map((square) => control[square]!);
    const endingFacts = onlyKingsAndPawns ? pawnEnding(chess, placed) : undefined;

    return {
        material: materialOf(chess.fen()),
        white: side("w"),
        black: side("b"),
        openFiles,
        oppositeBishops: bishops.length === 2 && bishops[0]!.color !== bishops[1]!.color && squareColour(bishops[0]!.square) !== squareColour(bishops[1]!.square),
        centre: centreSquares.map((square) => centreSquare(chess, square, control[square]!)),
        control,
        controlled: {
            white: counts.filter(([white, black]) => white > 0 && black === 0).length,
            black: counts.filter(([white, black]) => black > 0 && white === 0).length,
            contested: counts.filter(([white, black]) => white > 0 && black > 0).length,
        },
        phase: phaseOf(chess, placed),
        draw: { repetitions, fiftyMovesLeft: Math.max(0, 100 - Number(chess.fen().split(" ")[4])), insufficient: chess.isInsufficientMaterial() },
        ...(endingFacts === undefined ? {} : { pawnEnding: endingFacts }),
    };
}

function sideProfile(
    chess: Chess,
    color: Color,
    placed: readonly Placed[],
    control: Record<string, readonly [number, number]>,
    castled: "O-O" | "O-O-O" | "no" | undefined,
    mobility: Partial<Record<PieceLetter, number>> | undefined,
): SideProfile
{
    const enemy = color === "w" ? "b" : "w";
    const mine = placed.filter((piece) => piece.color === color);
    const pawns = mine.filter((piece) => piece.type === "p");
    const enemyPawns = placed.filter((piece) => piece.type === "p" && piece.color === enemy);
    const hasPawn = (list: readonly Placed[], file: number) => list.some((pawn) => fileOf(pawn.square) === file);
    const halfOpenFiles = [...files].filter((_, file) => !hasPawn(pawns, file) && hasPawn(enemyPawns, file));
    const bishops = mine.filter((piece) => piece.type === "b");
    const otherHalf = allSquares.filter((square) => (color === "w" ? rankOf(square) >= 5 : rankOf(square) <= 4));
    const index = color === "w" ? 0 : 1;
    const rights = chess.getCastlingRights(color);
    const king = mine.find((piece) => piece.type === "k");

    return {
        pawns: pawnFacts(color, pawns, enemyPawns),
        halfOpenFiles,
        heavyOnFiles: mine.filter((piece) => (piece.type === "r" || piece.type === "q") && !hasPawn(pawns, fileOf(piece.square))).map((piece) => piece.square).sort(),
        onSeventh: mine.filter((piece) => (piece.type === "r" || piece.type === "q") && rankOf(piece.square) === (color === "w" ? 7 : 2)).map((piece) => piece.square).sort(),
        bishopPair: bishops.length >= 2 && new Set(bishops.map((bishop) => squareColour(bishop.square))).size === 2,
        bishops: bishops.map((bishop) => ({
            square: bishop.square,
            pawnsOnColour: pawns.filter((pawn) => squareColour(pawn.square) === squareColour(bishop.square)).length,
            pawns: pawns.length,
        })),
        outposts: outpostsOf(chess, color, pawns, enemyPawns),
        space: otherHalf.filter((square) => control[square]![index]! > 0).length,
        ...(mobility === undefined ? {} : { mobility }),
        undeveloped: firstSquares[color].filter(([square, type]) => chess.get(square)?.type === type && chess.get(square)?.color === color).map(([square]) => square),
        ...(castled === undefined ? {} : { castled }),
        castlingRights: [...(rights.k ? ["O-O" as const] : []), ...(rights.q ? ["O-O-O" as const] : [])],
        ...(king === undefined ? {} : { king: kingFacts(king.square, color, pawns, control) }),
    };
}

function pawnFacts(color: Color, pawns: readonly Placed[], enemyPawns: readonly Placed[]): PawnFacts
{
    const forward = color === "w" ? 1 : -1;
    const ahead = (from: Square, other: Square) => (rankOf(other) - rankOf(from)) * forward > 0;
    const besides = (pawn: Placed) => pawns.filter((other) => Math.abs(fileOf(other.square) - fileOf(pawn.square)) === 1);
    const stopAttacked = (pawn: Placed) => enemyPawns.some((enemy) => Math.abs(fileOf(enemy.square) - fileOf(pawn.square)) === 1 && rankOf(enemy.square) === rankOf(pawn.square) + 2 * forward);
    const usedFiles = [...new Set(pawns.map((pawn) => fileOf(pawn.square)))].sort();
    const sorted = (list: readonly Placed[]) => list.map((pawn) => pawn.square).sort();

    return {
        isolated: sorted(pawns.filter((pawn) => besides(pawn).length === 0)),
        doubled: sorted(pawns.filter((pawn) => pawns.some((other) => other !== pawn && fileOf(other.square) === fileOf(pawn.square)))),
        backward: sorted(pawns.filter((pawn) => besides(pawn).length > 0 && besides(pawn).every((other) => ahead(pawn.square, other.square)) && stopAttacked(pawn))),
        passed: sorted(pawns.filter((pawn) => !enemyPawns.some((enemy) => Math.abs(fileOf(enemy.square) - fileOf(pawn.square)) <= 1 && ahead(pawn.square, enemy.square)))),
        islands: islandsOf(usedFiles),
    };
}

/** The pawn islands, from the files with pawns in order: neighbouring files make one, named by its first and last file. */
function islandsOf(usedFiles: readonly number[]): string[]
{
    const islands: number[][] = [];

    for (const file of usedFiles) {
        const last = islands.at(-1);

        if (last !== undefined && last.at(-1) === file - 1) {
            last.push(file);
        } else {
            islands.push([file]);
        }
    }

    return islands.map((island) => (island.length === 1 ? files[island[0]!]! : `${files[island[0]!]}-${files[island.at(-1)!]}`));
}

/** The outposts of a side: on ranks 4 to 6 as it sees the board, defended by its pawn, out of reach of every enemy pawn, not under one of its pawns. */
function outpostsOf(chess: Chess, color: Color, pawns: readonly Placed[], enemyPawns: readonly Placed[]): Outpost[]
{
    const forward = color === "w" ? 1 : -1;
    const ranks = color === "w" ? [4, 5, 6] : [5, 4, 3];

    return allSquares.filter((square) => {
        const file = fileOf(square);
        const rank = rankOf(square);
        const defended = pawns.some((pawn) => Math.abs(fileOf(pawn.square) - file) === 1 && rankOf(pawn.square) === rank - forward);
        const reachable = enemyPawns.some((enemy) => Math.abs(fileOf(enemy.square) - file) === 1 && (rankOf(enemy.square) - rank) * forward > 0);
        const own = chess.get(square);
        return ranks.includes(rank) && defended && !reachable && own?.type !== "p";
    }).map((square) => {
        const piece = chess.get(square);
        return piece?.color === color ? { square, piece: piece.type.toUpperCase() as PieceLetter } : { square };
    });
}

function kingFacts(square: Square, color: Color, pawns: readonly Placed[], control: Record<string, readonly [number, number]>): KingFacts
{
    const forward = color === "w" ? 1 : -1;
    const file = fileOf(square);
    const near = [file - 1, file, file + 1].filter((other) => other >= 0 && other < 8);
    const enemy = color === "w" ? 1 : 0;
    const around = allSquares.filter((other) => other !== square && Math.abs(fileOf(other) - file) <= 1 && Math.abs(rankOf(other) - rankOf(square)) <= 1);

    return {
        square,
        shield: pawns.filter((pawn) => near.includes(fileOf(pawn.square)) && [1, 2].includes((rankOf(pawn.square) - rankOf(square)) * forward)).map((pawn) => pawn.square).sort(),
        openFiles: near.filter((other) => !pawns.some((pawn) => fileOf(pawn.square) === other && (rankOf(pawn.square) - rankOf(square)) * forward > 0))
            .map((other) => files[other]!),
        attacksNear: around.reduce((sum, other) => sum + control[other]![enemy]!, 0),
    };
}

/** The legal moves of each side by piece: the side to move's, and the other's on the same board with the turn passed, unless the side to move is in check. */
function mobilityOf(chess: Chess, legal: readonly Move[]): Partial<Record<Color, Partial<Record<PieceLetter, number>>>>
{
    const byPiece = (letters: readonly PieceLetter[]) => {
        const counts: Partial<Record<PieceLetter, number>> = {};

        for (const letter of letters) {
            counts[letter] = (counts[letter] ?? 0) + 1;
        }

        return counts;
    };

    const turn = chess.turn();
    // A promotion is one move, whatever the pawn becomes.
    const mine = byPiece(legal.filter((move) => move.promotion === undefined || move.promotion === "q").map((move) => chess.get(move.from)!.type.toUpperCase() as PieceLetter));

    if (chess.inCheck()) {
        return { [turn]: mine };
    }

    const fields = chess.fen().split(" ");
    fields[1] = turn === "w" ? "b" : "w";
    fields[3] = "-";
    // A SAN names its piece first, castling is the king's, and a pawn's move starts with its file.
    const letterOf = (san: string): PieceLetter => (san.startsWith("O-O") ? "K" : /^[KQRBN]/.test(san) ? san[0] as PieceLetter : "P");
    return { [turn]: mine, [fields[1]]: byPiece(new Chess(fields.join(" ")).moves().filter((san) => !/=[RBN]/.test(san)).map(letterOf)) };
}

function centreSquare(chess: Chess, square: Square, [white, black]: readonly [number, number]): CentreSquare
{
    const piece = chess.get(square);
    return piece === undefined ? { square, white, black } : { square, piece: { letter: piece.type.toUpperCase() as PieceLetter, side: piece.color === "w" ? "white" : "black" }, white, black };
}

function phaseOf(chess: Chess, placed: readonly Placed[]): Phase
{
    const material = placed.reduce((sum, piece) => sum + pieceValues[piece.type], 0);

    if (material <= 26) {
        return "endgame";
    }

    const undeveloped = (["w", "b"] as const).some((color) => firstSquares[color].some(([square, type]) => chess.get(square)?.type === type && chess.get(square)?.color === color));
    return material >= 56 && chess.moveNumber() <= 15 && undeveloped ? "opening" : "middlegame";
}

/** The rule of the square for each passed pawn, and the opposition of the kings: on one file, rank or diagonal, an odd number of squares between them. */
function pawnEnding(chess: Chess, placed: readonly Placed[]): NonNullable<Profile["pawnEnding"]>
{
    const kings = placed.filter((piece) => piece.type === "k");
    const kingOf = (color: Color) => kings.find((king) => king.color === color)?.square;
    const squares: PawnSquare[] = [];

    for (const color of ["w", "b"] as const) {
        const pawns = placed.filter((piece) => piece.type === "p" && piece.color === color);
        const enemyPawns = placed.filter((piece) => piece.type === "p" && piece.color !== color);
        const defender = kingOf(color === "w" ? "b" : "w");

        for (const pawn of pawnFacts(color, pawns, enemyPawns).passed) {
            const promotion = `${pawn[0]}${color === "w" ? 8 : 1}` as Square;
            // From its first square a pawn steps two: it is as far as from the next one.
            const steps = Math.min(5, Math.abs((color === "w" ? 8 : 1) - rankOf(pawn)));
            // The king takes the new queen on its square: one move more when it is the defender's turn.
            const reach = steps + (chess.turn() === color ? 0 : 1);

            if (defender !== undefined) {
                squares.push({ pawn, caught: distance(defender, promotion) <= reach });
            }
        }
    }

    const white = kingOf("w");
    const black = kingOf("b");
    const opposition = white === undefined || black === undefined ? undefined : oppositionOf(white, black, chess.turn());
    return opposition === undefined ? { squares } : { squares, opposition };
}

/** The side that has the opposition: the one not to move, when the kings stand on one line with an odd number of squares between them. */
function oppositionOf(white: Square, black: Square, turn: Color): Side | undefined
{
    const files = Math.abs(fileOf(white) - fileOf(black));
    const ranks = Math.abs(rankOf(white) - rankOf(black));
    const between = files === 0 ? ranks - 1 : ranks === 0 ? files - 1 : files === ranks ? files - 1 : -1;
    return between > 0 && between % 2 === 1 ? (turn === "w" ? "black" : "white") : undefined;
}

function castledOf(past: Past, side: Side): "O-O" | "O-O-O" | "no" | undefined
{
    return past.castled[side] ?? (past.fromFen ? undefined : "no");
}

function squareColour(square: Square): number
{
    return (fileOf(square) + rankOf(square)) % 2;
}

function distance(from: Square, to: Square): number
{
    return Math.max(Math.abs(fileOf(from) - fileOf(to)), Math.abs(rankOf(from) - rankOf(to)));
}

function deepFrozen<Value>(value: Value): Value
{
    if (typeof value === "object" && value !== null) {
        Object.values(value).forEach(deepFrozen);
        Object.freeze(value);
    }

    return value;
}
