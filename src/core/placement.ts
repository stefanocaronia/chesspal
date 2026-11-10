// A board of pieces alone, to try many moves in a row fast (D-34): no turn, castling rights or history, which the possibilities do not read. Which pieces
// attack a square is read along the board's lines and steps, as chess.js counts it.
import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";

/** A piece, by its type and side. */
export interface Piece
{
    readonly type: PieceSymbol;
    readonly color: Color;
}

/** A piece on its square. */
export interface Placed extends Piece
{
    readonly square: Square;
}

/** A move to try: its squares, and the piece a pawn becomes. */
export interface Tried
{
    readonly from: Square;
    readonly to: Square;
    readonly promotion?: PieceSymbol;
}

/** The pieces of a position, moved without the rules' checks and taken back in the reverse order. */
export class Placement
{
    readonly #pieces = new Map<Square, Piece>();
    readonly #played: Played[] = [];

    constructor(chess: Chess)
    {
        for (const cell of chess.board().flat()) {
            if (cell !== null) {
                this.#pieces.set(cell.square, { type: cell.type, color: cell.color });
            }
        }
    }

    get(square: Square): Piece | undefined
    {
        return this.#pieces.get(square);
    }

    /** The squares of a side's pieces of one type. */
    findPiece({ type, color }: Piece): Square[]
    {
        const found: Square[] = [];

        for (const [square, piece] of this.#pieces) {
            if (piece.type === type && piece.color === color) {
                found.push(square);
            }
        }

        return found;
    }

    /** A side's pieces. */
    piecesOf(color: Color): Placed[]
    {
        const found: Placed[] = [];

        for (const [square, piece] of this.#pieces) {
            if (piece.color === color) {
                found.push({ square, type: piece.type, color });
            }
        }

        return found;
    }

    /** The pieces of a side that attack a square, pinned or not: pawns, knights and kings by their steps, the others along their lines. */
    attackers(square: Square, color: Color): Square[]
    {
        const of = (from: Square, types: string) => {
            const piece = this.#pieces.get(from);
            return piece !== undefined && piece.color === color && types.includes(piece.type);
        };

        const found = [
            ...pawnsTaking[color].get(square)!.filter((from) => of(from, "p")),
            ...knightSteps.get(square)!.filter((from) => of(from, "n")),
            ...kingSteps.get(square)!.filter((from) => of(from, "k")),
        ];

        for (const { squares, sliders } of linesFrom.get(square)!) {
            const first = squares.find((each) => this.#pieces.has(each));

            if (first !== undefined && of(first, sliders)) {
                found.push(first);
            }
        }

        return found;
    }

    /** The squares the piece on a square attacks: by its steps, or along its lines up to the first piece. */
    attackedFrom(square: Square): Square[]
    {
        const { type, color } = this.#pieces.get(square)!;

        if (type === "p" || type === "n" || type === "k") {
            return (type === "p" ? pawnCaptures[color] : type === "n" ? knightSteps : kingSteps).get(square)!;
        }

        return linesFrom.get(square)!.filter((line) => line.sliders.includes(type)).flatMap(({ squares }) => {
            const stop = squares.findIndex((each) => this.#pieces.has(each));
            return stop === -1 ? squares : squares.slice(0, stop + 1);
        });
    }

    /** Whether a square lies between a rook, bishop or queen of a side and a piece of the other side besides a pawn, on their line with nothing else between. */
    isBetween(square: Square, color: Color): boolean
    {
        const lines = linesFrom.get(square)!;
        const first = lines.map(({ squares }) => squares.find((each) => this.#pieces.has(each)));

        const slider = (index: number) => {
            const piece = first[index] === undefined ? undefined : this.#pieces.get(first[index]);
            return piece !== undefined && piece.color === color && lines[index]!.sliders.includes(piece.type);
        };

        const target = (index: number) => {
            const piece = first[index] === undefined ? undefined : this.#pieces.get(first[index]);
            return piece !== undefined && piece.color !== color && piece.type !== "p";
        };

        return opposite.some(([one, two]) => (slider(one) && target(two)) || (slider(two) && target(one)));
    }

    /** Whether a piece of a side stands between its king and a rook, bishop or queen of the other side on their line. */
    isPinned(color: Color): boolean
    {
        const king = this.findPiece({ type: "k", color })[0];

        return king !== undefined && linesFrom.get(king)!.some(({ squares, sliders }) => {
            const [first, second] = squares.filter((each) => this.#pieces.has(each)).map((each) => this.#pieces.get(each)!);
            return first?.color === color && second !== undefined && second.color !== color && sliders.includes(second.type);
        });
    }

    /** Plays a move: the piece taken goes, en passant too, and a pawn becomes the piece it promotes to. It returns the piece taken. */
    play(move: Tried): Piece | undefined
    {
        const piece = this.#pieces.get(move.from)!;
        const passant = piece.type === "p" && move.from[0] !== move.to[0] && !this.#pieces.has(move.to);
        const takenOn = passant ? `${move.to[0]}${move.from[1]}` as Square : move.to;
        const taken = this.#pieces.get(takenOn);

        this.#played.push({ move, piece, taken, takenOn });
        this.#pieces.delete(move.from);
        this.#pieces.delete(takenOn);
        this.#pieces.set(move.to, move.promotion === undefined ? piece : { type: move.promotion, color: piece.color });
        return taken;
    }

    /** Takes back the last move played. */
    undo(): void
    {
        const { move, piece, taken, takenOn } = this.#played.pop()!;
        this.#pieces.delete(move.to);
        this.#pieces.set(move.from, piece);

        if (taken !== undefined) {
            this.#pieces.set(takenOn, taken);
        }
    }

    /**
     * A side's moves that leave its king safe, in the order chess.js lists them: the pawns' pushes, captures and promotions, the pieces' steps and lines;
     * never castling or en passant.
     */
    movesOf(color: Color): Tried[]
    {
        return this.#placedOf(color).flatMap((piece) => this.#reachable(piece)).filter((move) => this.#leavesKingSafe(move, color));
    }

    /** Whether a side has a move of those, stopping at the first. */
    hasMove(color: Color): boolean
    {
        return this.#placedOf(color).some((piece) => this.#reachable(piece).some((move) => this.#leavesKingSafe(move, color)));
    }

    /**
     * A move of those in SAN, as chess.js writes it, with the side's moves for the disambiguation; undefined for a pawn pushed two squares that would
     * mate, which an en passant capture may answer: chess.js tells.
     */
    sanOf(move: Tried, moves: readonly Tried[]): string | undefined
    {
        const { type, color } = this.#pieces.get(move.from)!;
        const other: Color = color === "w" ? "b" : "w";
        const takes = this.#pieces.has(move.to) || (type === "p" && move.from[0] !== move.to[0]);
        const head = type === "p" ? (takes ? `${move.from[0]!}x` : "") : `${type.toUpperCase()}${this.#disambiguation(move, type, moves)}${takes ? "x" : ""}`;

        this.play(move);
        const check = this.inCheck(other);
        const mate = check && !this.hasMove(other);
        this.undo();

        if (mate && type === "p" && Math.abs(Number(move.to[1]) - Number(move.from[1])) === 2) {
            return undefined;
        }

        return `${head}${move.to}${move.promotion === undefined ? "" : `=${move.promotion.toUpperCase()}`}${mate ? "#" : check ? "+" : ""}`;
    }

    /** Whether a side's king is attacked. */
    inCheck(color: Color): boolean
    {
        const king = this.findPiece({ type: "k", color })[0];
        return king !== undefined && this.attackers(king, color === "w" ? "b" : "w").length > 0;
    }

    #leavesKingSafe(move: Tried, color: Color): boolean
    {
        this.play(move);
        const safe = !this.inCheck(color);
        this.undo();
        return safe;
    }

    // A side's pieces square by square from a8 to h1, as chess.js goes over them.
    #placedOf(color: Color): Placed[]
    {
        return boardOrder.flatMap((square) => {
            const piece = this.#pieces.get(square);
            return piece?.color === color ? [{ square, type: piece.type, color }] : [];
        });
    }

    // The squares a move's piece starts from, when another of its type reaches the same square: its file, else its rank, else both (chess.js).
    #disambiguation(move: Tried, type: PieceSymbol, moves: readonly Tried[]): string
    {
        const rivals = moves.filter((each) => each.to === move.to && each.from !== move.from && this.#pieces.get(each.from)?.type === type);

        if (rivals.length === 0) {
            return "";
        }

        const sameRank = rivals.some((each) => each.from[1] === move.from[1]);
        const sameFile = rivals.some((each) => each.from[0] === move.from[0]);
        return sameRank && sameFile ? move.from : sameFile ? move.from[1]! : move.from[0]!;
    }

    // A piece's moves before its king's safety is looked at, in chess.js's order.
    #reachable({ square, type, color }: Placed): Tried[]
    {
        const free = (to: Square) => !this.#pieces.has(to);
        const takes = (to: Square) => this.#pieces.get(to)?.color === (color === "w" ? "b" : "w");
        const open = (to: Square) => free(to) || takes(to);

        if (type === "p") {
            const forward = pawnPushes[color].get(square)!;
            const pushes = free(forward[0]!) ? (forward.length === 2 && free(forward[1]!) ? forward : forward.slice(0, 1)) : [];
            const captures = pawnCaptures[color].get(square)!.filter(takes);
            return [...pushes, ...captures].flatMap((to) => (to[1] === "8" || to[1] === "1" ? promotions.map((promotion) => ({ from: square, to, promotion })) : [{ from: square, to }]));
        }

        if (type === "n" || type === "k") {
            return (type === "n" ? knightSteps : kingSteps).get(square)!.filter(open).map((to) => ({ from: square, to }));
        }

        return sliderRays[type].get(square)!.flatMap((ray) => {
            const stop = ray.findIndex((each) => !free(each));
            const reached = stop === -1 ? ray : ray.slice(0, takes(ray[stop]!) ? stop + 1 : stop);
            return reached.map((to) => ({ from: square, to }));
        });
    }
}

/** A move's SAN, and where chess.js lists it among the side's moves: the lists keep that order. */
export interface Named
{
    readonly san: string;
    readonly order: number;
}

/** The SAN of moves of the side to move of a chess.js board, and their order as chess.js lists them; read square by square, as moves need them. */
export function namesOn(boardOf: () => Chess): (move: Tried) => Named | undefined
{
    const bySquare = new Map<Square, readonly { to: Square; promotion?: PieceSymbol; san: string; }[]>();

    return (move) => {
        let moves = bySquare.get(move.from);

        if (moves === undefined) {
            moves = boardOf().moves({ square: move.from, verbose: true });
            bySquare.set(move.from, moves);
        }

        const index = moves.findIndex((each) => each.to === move.to && each.promotion === move.promotion);
        // chess.js lists the moves square by square from a8 to h1.
        const square = (8 - Number(move.from[1])) * 8 + files.indexOf(move.from[0]!);
        return index === -1 ? undefined : { san: moves[index]!.san, order: square * 256 + index };
    };
}

/** Whether a side may castle on a chess.js board, as far as the board of pieces alone would miss it: a right it keeps, with the squares to its rook empty. */
export function mayCastle(chess: Chess, color: Color): boolean
{
    const rank = color === "w" ? "1" : "8";
    const rights = chess.getCastlingRights(color);
    const empty = (between: string) => [...between].every((file) => chess.get(`${file}${rank}` as Square) === undefined);
    return (rights.k && empty("fg")) || (rights.q && empty("bcd"));
}

/** The same board with the other side to move, without en passant, which belonged to the side to move. */
export function turnPassed(chess: Chess): Chess
{
    const fields = chess.fen().split(" ");
    fields[1] = chess.turn() === "w" ? "b" : "w";
    fields[3] = "-";
    return new Chess(fields.join(" "));
}

interface Played
{
    readonly move: Tried;
    readonly piece: Piece;
    readonly taken: Piece | undefined;
    readonly takenOn: Square;
}

const files = "abcdefgh";
const promotions: readonly PieceSymbol[] = ["n", "b", "r", "q"];
const squares = [...files].flatMap((file) => [1, 2, 3, 4, 5, 6, 7, 8].map((rank) => `${file}${rank}` as Square));

const boardOrder = [8, 7, 6, 5, 4, 3, 2, 1].flatMap((rank) => [...files].map((file) => `${file}${rank}` as Square));

// The steps and lines from each square, worked out once, in the order chess.js tries them.
const knightSteps = stepsFrom([[-2, 1], [-1, 2], [1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1]]);
const kingSteps = stepsFrom([[-1, 1], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0]]);
// The squares a pawn of a side takes a square from, those it takes on, and those it pushes to: one, or two from its first rank.
const pawnsTaking = { w: stepsFrom([[-1, -1], [1, -1]]), b: stepsFrom([[-1, 1], [1, 1]]) };
const pawnCaptures = { w: stepsFrom([[-1, 1], [1, 1]]), b: stepsFrom([[1, -1], [-1, -1]]) };
const pawnPushes = { w: pushesFrom(1, "2"), b: pushesFrom(-1, "7") };
const sliderRays = {
    b: raysFrom([[-1, 1], [1, 1], [1, -1], [-1, -1]]),
    r: raysFrom([[0, 1], [1, 0], [0, -1], [-1, 0]]),
    q: raysFrom([[-1, 1], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0]]),
};
// Each line from each square, with the pieces that move along it.
const lineSteps: readonly [number, number, string][] = [[0, 1, "rq"], [0, -1, "rq"], [1, 0, "rq"], [-1, 0, "rq"], [1, 1, "bq"], [1, -1, "bq"], [-1, 1, "bq"], [-1, -1, "bq"]];
const linesFrom = new Map(squares.map((square) => [square, lineSteps.map(([file, rank, sliders]) => ({ squares: rayFrom(square, file, rank), sliders }))]));
// The lines of lineSteps that run opposite ways from a square.
const opposite: readonly [number, number][] = [[0, 1], [2, 3], [4, 7], [5, 6]];

function stepsFrom(steps: readonly [number, number][]): Map<Square, Square[]>
{
    return new Map(squares.map((square) => [square, steps.map(([file, rank]) => squareAt(square, file, rank)).filter((each) => each !== undefined)]));
}

function raysFrom(steps: readonly [number, number][]): Map<Square, Square[][]>
{
    return new Map(squares.map((square) => [square, steps.map(([file, rank]) => rayFrom(square, file, rank))]));
}

function pushesFrom(step: number, firstRank: string): Map<Square, Square[]>
{
    return new Map(squares.map((square) => [square, (square[1] === firstRank ? [step, 2 * step] : [step]).map((rank) => squareAt(square, 0, rank)).filter((each) => each !== undefined)]));
}

function rayFrom(from: Square, fileStep: number, rankStep: number): Square[]
{
    const ray: Square[] = [];

    for (let next = squareAt(from, fileStep, rankStep); next !== undefined; next = squareAt(next, fileStep, rankStep)) {
        ray.push(next);
    }

    return ray;
}

function squareAt(from: Square, fileStep: number, rankStep: number): Square | undefined
{
    const file = files.indexOf(from[0]!) + fileStep;
    const rank = Number(from[1]) + rankStep;
    return file >= 0 && file < 8 && rank >= 1 && rank <= 8 ? `${files[file]}${rank}` as Square : undefined;
}
