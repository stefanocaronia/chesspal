// A live game on chess.js: the rules, the record, and the legal moves computed once per position.
import { Chess, type Move as ChessMove, type Square, validateFen } from "chess.js";
import { type Facts, factsOf } from "./facts.ts";
import { type Illegal, whyIllegal } from "./illegal.ts";
import { type Profile, profileOf } from "./profile.ts";
import { type Annotation, cleanComment, type GameRecord, type RecordedMove, recordedMove } from "./record.ts";

export type { Square } from "chess.js";

/** A side of the board. */
export type Side = "white" | "black";

/** The piece a pawn becomes. */
export type Promotion = "q" | "r" | "b" | "n";

/** A legal move: its SAN, and its squares for the page. */
export interface Move
{
    readonly san: string;
    readonly from: Square;
    readonly to: Square;
    readonly promotion?: Promotion;
}

/** Where the game stands. The key is the same for the same position, whatever the moves that led to it: chess.js's hash, never to store, it changes with the library. */
export interface Position
{
    readonly fen: string;
    readonly key: string;
    readonly turn: Side;
    readonly moveNumber: number;
    readonly check: boolean;
}

/** How the board ends a game, the draws too (D-37). Resignation, agreement and time are not the board's: the commands record them. */
export type Ending = "checkmate" | "stalemate" | "insufficient material" | "threefold repetition" | "fifty moves";

/** Whether the board ends the game, and how. */
export type Outcome = { readonly over: false; } | { readonly over: true; readonly result: "1-0" | "0-1" | "1/2-1/2"; readonly ending: Ending; };

/** Why a move was refused. */
export type Refusal = "unreadable" | "illegal" | "ambiguous" | "over";

/** A move played, with a note when it was written with a check or a mate it does not give; or why it was refused, with the legal moves in SAN. */
export type Played =
    | { readonly played: true; readonly move: Move; readonly note?: string; }
    | { readonly played: false; readonly refusal: Refusal; readonly message: string; readonly legal: readonly string[]; };

/**
 * A live game: it plays moves written in SAN or as squares, and keeps the record. Checkmate, stalemate and the draws by insufficient material,
 * threefold repetition and fifty moves end it (D-37); a game recorded elsewhere replays past the draws it played on from.
 */
export class Game
{
    private readonly chess: Chess;
    private readonly tags: Record<string, string>;
    private readonly comment: string | undefined;
    private readonly moves: RecordedMove[] = [];
    private last: Move | undefined;
    // The key of every position the game has stood in, the first included, and how each side castled: for the profile's repetitions and castling.
    private readonly keys: string[];
    private readonly castled: Partial<Record<Side, "O-O" | "O-O-O">> = {};
    private keptPosition: Position | undefined;
    private keptOutcome: Outcome | undefined;
    private keptRecord: GameRecord | undefined;

    /** The game of a record, replayed move by move; without one, a new game from the standard position. */
    constructor(record: GameRecord = { tags: {}, moves: [] })
    {
        this.chess = startingBoard(record.tags.FEN);
        // The first key without an en passant square no pawn can use, which the FEN may give: the position then repeats as the rules count it.
        this.keys = [new Chess(this.chess.fen()).hash()];
        this.tags = { ...record.tags };
        this.comment = cleanComment(record.comment ?? "") || undefined;

        for (const { san, nags, comment } of record.moves) {
            const move = this.apply(normalized(san));

            // A refused move changes nothing: the label still names its place.
            if ("refusal" in move) {
                throw new Error(`The record's move ${moveLabel(this.chess, san)} cannot be played: ${move.message} Fix it, or the moves before it.`);
            }

            this.moves.push(recordedMove(move.san, nags, comment));
        }
    }

    /** Where the game stands now. */
    get position(): Position
    {
        this.keptPosition ??= Object.freeze({
            fen: this.chess.fen(),
            key: this.chess.hash(),
            turn: sideToMove(this.chess),
            moveNumber: this.chess.moveNumber(),
            check: this.chess.inCheck(),
        });

        return this.keptPosition;
    }

    /** Whether the board ends the game, and how. */
    get outcome(): Outcome
    {
        this.keptOutcome ??= outcomeOf(this.chess);
        return this.keptOutcome;
    }

    /** The game as plain data, frozen; when the board ends the game, its Result tag is the board's, unless the record gave one. */
    get record(): GameRecord
    {
        this.keptRecord ??= this.snapshot();
        return this.keptRecord;
    }

    /** The last move played, with its squares; none before the first. */
    get lastMove(): Move | undefined
    {
        return this.last;
    }

    /** What the position shows (D-26): attackers and defenders, pieces at risk, pins, checks, the moves of each piece; computed once for each position. */
    get facts(): Facts
    {
        return factsOf(this.chess, legalMovesOf(this.chess));
    }

    /** The positional profile (D-19): pawns, files, outposts, space, mobility, development, king safety, control, phase, draws; computed once for each position. */
    get profile(): Profile
    {
        const key = this.chess.hash();
        return profileOf(this.chess, { repetitions: this.keys.filter((seen) => seen === key).length, castled: this.castled, fromFen: this.tags.FEN !== undefined }, legalMovesOf(this.chess));
    }

    /** The legal moves, or those of the piece on a square. */
    legalMoves(square?: Square): readonly Move[]
    {
        const moves = legalMovesOf(this.chess);
        return square === undefined ? moves : moves.filter((move) => move.from === square);
    }

    /** Why the piece of the side to move on a square cannot go to another (D-18); undefined when it can, or when no rule says why. */
    whyNot(from: Square, to: Square): Illegal | undefined
    {
        return this.legalMoves(from).some((move) => move.to === to) ? undefined : whyIllegal(this.chess, from, to);
    }

    /** Plays a move written in SAN (Nf3, exd5, O-O, e8=Q), with the pieces' figurines too (♘f3), or as squares (g1f3, e7e8q); a refused move changes nothing. */
    play(text: string): Played
    {
        const { outcome } = this;

        if (outcome.over) {
            return { played: false, ...gameOver(outcome), legal: [] };
        }

        return this.playRecorded(text);
    }

    /** Plays a move of a game recorded elsewhere, as play does, but also past a draw that game played on from: insufficient material, repetition or fifty moves. */
    playRecorded(text: string): Played
    {
        const input = normalized(text);
        const move = this.apply(input);

        if ("refusal" in move) {
            return { played: false, ...move, legal: legalMovesOf(this.chess).map((legal) => legal.san) };
        }

        this.moves.push(recordedMove(move.san));
        const note = checkNote(input, move.san);
        return note === undefined ? { played: true, move } : { played: true, move, note };
    }

    /** Sets the judgment of a move by its ply, 1 for the first move recorded: the NAGs and the comment given replace its own, an empty one removes them. */
    annotate(ply: number, annotation: Annotation): void
    {
        const move = this.moves[ply - 1];

        if (!Number.isInteger(ply) || move === undefined) {
            const plies = this.moves.length === 0 ? "the game has no moves yet" : `give a ply from 1 to ${this.moves.length}`;
            throw new RangeError(`There is no move ${ply} in this game: ${plies}.`);
        }

        this.moves[ply - 1] = recordedMove(move.san, annotation.nags ?? move.nags, annotation.comment ?? move.comment);
        this.keptRecord = undefined;
    }

    private apply(input: string): Move | Refused
    {
        // chess.js plays "--" as a null move, which skips a turn.
        if (input.startsWith("--")) {
            return unreadable(input);
        }

        const mover = sideToMove(this.chess);
        // Proper SAN is the fast way; anything else is matched by hand, because chess.js guesses where we must ask.
        const exact = attempt(() => this.chess.move(input, { strict: true }));
        const move = exact === undefined ? this.resolve(input) : toMove(exact);

        if ("refusal" in move) {
            return move;
        }

        if (exact === undefined) {
            this.chess.move({ from: move.from, to: move.to, promotion: move.promotion });
        }

        this.last = move;
        this.keys.push(this.chess.hash());

        if (move.san.startsWith("O-O")) {
            this.castled[mover] = move.san.startsWith("O-O-O") ? "O-O-O" : "O-O";
        }

        this.keptPosition = undefined;
        this.keptOutcome = undefined;
        this.keptRecord = undefined;
        return move;
    }

    /** A move written loosely (as squares, with a letter too many or too few) matched against the legal moves. */
    private resolve(input: string): Move | Refused
    {
        const legal = legalMovesOf(this.chess);

        // No legal move: checkmate or stalemate.
        if (legal.length === 0 && this.outcome.over) {
            return gameOver(this.outcome);
        }

        const bare = input.replace(/[+#]?[!?]*$/, "");

        if (/^O-O(?:-O)?$/.test(bare)) {
            return this.illegal(input);
        }

        const parts = loosePattern.exec(bare);

        if (parts === null) {
            return foreignLetter(input, bare) ?? unreadable(input);
        }

        const [, piece, file, rank, separator, target = "", promotion] = parts;
        const capture = separator === "x" || separator === ":";

        // "bc4" is a bishop without its capital, or a pawn's capture without its x, as "bb4" or "cc6" is a piece or a pawn: never guessed (Anatolij, round of D-87).
        if (piece === undefined && file !== undefined && rank === undefined && !capture) {
            return smallLetter(input, file, target);
        }

        // Without a letter, a move is a pawn's, unless it gives its whole starting square.
        const kind = piece?.toLowerCase() ?? (file !== undefined && rank !== undefined ? undefined : "p");
        const candidates = legal.filter((move) =>
            move.to === target
            && (file === undefined || move.from[0] === file)
            && (rank === undefined || move.from[1] === rank)
            && (kind === undefined || this.chess.get(move.from)?.type === kind)
            && (!capture || move.san.includes("x"))
            && (promotion === undefined || move.promotion === promotion.toLowerCase())
        );

        if (promotion === undefined && candidates.some((move) => move.promotion !== undefined)) {
            return { refusal: "unreadable", message: `${input} takes a pawn to the last rank: say the piece it becomes, as e8=Q or e7e8q.` };
        }

        if (candidates.length > 1) {
            return { refusal: "ambiguous", message: `${input} could be ${candidates.map((move) => move.san).sort().join(" or ")}: say which.` };
        }

        if (candidates.length === 0 && capture && this.chess.get(target as Square) === undefined && !legal.some((move) => move.to === target && move.san.includes("x"))) {
            return { refusal: "illegal", message: `${input} takes, but there is nothing to take on ${target}.` };
        }

        // An Italian, French or Spanish R is the king: said when the king could go there and no rook can.
        if (candidates.length === 0 && piece === "R" && legal.some((move) => move.to === target && this.chess.get(move.from)?.type === "k")) {
            return { refusal: "illegal", message: `${input} is not legal here: R is the rook in SAN, and the king is K: K${target}.` };
        }

        return candidates[0] ?? this.illegal(input);
    }

    private illegal(input: string): Refused
    {
        return { refusal: "illegal", message: `${input} is not legal here, with ${this.chess.turn() === "w" ? "White" : "Black"} to move.` };
    }

    private snapshot(): GameRecord
    {
        const { outcome } = this;
        // A game recorded elsewhere keeps its Result: it may have played on from a draw and ended otherwise.
        const open = (this.tags.Result ?? "*") === "*";
        const tags = Object.freeze(outcome.over && open ? { ...this.tags, Result: outcome.result } : { ...this.tags });
        const moves = Object.freeze([...this.moves]);
        return Object.freeze(this.comment === undefined ? { tags, moves } : { tags, comment: this.comment, moves });
    }
}

type Refused = { readonly refusal: Refusal; readonly message: string; };

// A piece, all or part of its square, a separator, the square it goes to, the promotion: e4, Nbd2, g1f3, e7-e8q, exd6 e.p.
const loosePattern = /^([KQRBNP])?([a-h])?([1-8])?([-x:])?([a-h][1-8])=?([QRBNqrbn])?(?:\s*e\.?p\.?)?$/;

// What word processors, phones and books write for SAN's letters and signs; the pawn's figurine says nothing.
const asciiOf: Readonly<Record<string, string>> = {
    "–": "-",
    "—": "-",
    "−": "-",
    "×": "x",
    "♔": "K",
    "♚": "K",
    "♕": "Q",
    "♛": "Q",
    "♖": "R",
    "♜": "R",
    "♗": "B",
    "♝": "B",
    "♘": "N",
    "♞": "N",
    "♙": "",
    "♟": "",
};

/** A text with SAN's letters and signs for the figurines and signs others write: ♘f3 as Nf3, × as x; a pawn's figurine says nothing. */
export function withSanLetters(text: string): string
{
    return text.replace(/[︎️]/g, "").replace(/[–—−×♔-♟]/g, (sign) => asciiOf[sign] ?? sign);
}

// The pieces' letters of other languages that name one piece only: the Italian, French, Spanish and German ones; R is the rook in SAN.
const foreignPieces: Readonly<Record<string, readonly [string, string]>> = {
    C: ["knight", "N"],
    S: ["knight", "N"],
    A: ["bishop", "B"],
    F: ["bishop", "B"],
    L: ["bishop", "B"],
    T: ["rook", "R"],
    D: ["queen", "Q"],
};

// The legal moves of the positions seen last, by their key: about 4 KB each.
const legalByPosition = new Map<string, readonly Move[]>();
const positionsKept = 1_000;

const goingOn: Outcome = Object.freeze({ over: false });

const draws: readonly [Ending, (chess: Chess) => boolean][] = [
    ["stalemate", (chess) => chess.isStalemate()],
    ["insufficient material", (chess) => chess.isInsufficientMaterial()],
    ["threefold repetition", (chess) => chess.isThreefoldRepetition()],
    ["fifty moves", (chess) => chess.isDrawByFiftyMoves()],
];

function legalMovesOf(chess: Chess): readonly Move[]
{
    const key = chess.hash();
    let moves = legalByPosition.get(key);

    if (moves === undefined) {
        moves = Object.freeze(chess.moves({ verbose: true }).map(toMove));

        if (legalByPosition.size >= positionsKept) {
            legalByPosition.delete(legalByPosition.keys().next().value!);
        }

        legalByPosition.set(key, moves);
    }

    return moves;
}

function outcomeOf(chess: Chess): Outcome
{
    if (chess.isCheckmate()) {
        return Object.freeze<Outcome>({ over: true, result: chess.turn() === "w" ? "0-1" : "1-0", ending: "checkmate" });
    }

    const draw = draws.find(([, applies]) => applies(chess));
    return draw === undefined ? goingOn : Object.freeze<Outcome>({ over: true, result: "1/2-1/2", ending: draw[0] });
}

function toMove({ san, from, to, promotion }: ChessMove): Move
{
    return Object.freeze(promotion === undefined ? { san, from, to } : { san, from, to, promotion: promotion as Promotion });
}

/**
 * The move in SAN: trimmed, without a move number before it, its signs and figurines in ASCII, a piece's small letter in capital (not b, a file too), ++ as
 * #, castling in capital O.
 */
function normalized(text: string): string
{
    return text.trim()
        .replace(/^\d+\s*(?:\.[\s.]*|…\s*)/, "")
        .replace(/[︎️]/g, "")
        // A space after the piece's letter, "N f3", as an AI may show the player how to write (Priya).
        .replace(/^([A-Z♔-♟])\s+(?=[a-h1-8x:])/, "$1")
        .replace(/[–—−×♔-♟]/g, (sign) => asciiOf[sign] ?? sign)
        // A small t too, so that "tf1" is told the rook's R as "Tf1" is.
        .replace(/^[nrqkt](?=[a-h1-8x:])/, (piece) => piece.toUpperCase())
        .replace(/\+\+(?=[!?]*$)/, "#")
        .replace(/^[0Oo]-[0Oo](?:-[0Oo])?(?=[+#]?[!?]*$)/, (castling) => castling.replace(/[0o]/g, "O"));
}

/** What the board says when a move was written with a check or a mate it does not give: a sign that the writer sees another position; neutral, since the AI reads it of the player's moves too. */
function checkNote(input: string, san: string): string | undefined
{
    const written = /([+#])[!?]*$/.exec(input)?.[1];
    const given = /[+#]$/.exec(san)?.[0];

    if (written === undefined || written === given) {
        return undefined;
    }

    const bare = san.replace(/[+#]$/, "");
    const truth = given === undefined ? "gives no check" : given === "+" ? "is check, not mate" : "is checkmate";
    return `Written as ${input}, but ${bare} ${truth}.`;
}

/** The board of a FEN tag, refused when no game can reach it; without one, the standard position. */
function startingBoard(fen: string | undefined): Chess
{
    if (fen === undefined) {
        return new Chess();
    }

    const { ok, error } = validateFen(fen);
    const chess = ok ? new Chess(fen) : undefined;

    if (chess === undefined || kingInCheckOffTurn(chess)) {
        throw new Error(`The FEN tag is not a valid position (${error ?? "the side not to move is in check"}): fix it, or remove it to start from the standard position.`);
    }

    return chess;
}

function kingInCheckOffTurn(chess: Chess): boolean
{
    const [king] = chess.findPiece({ type: "k", color: chess.turn() === "w" ? "b" : "w" });
    return king !== undefined && chess.isAttacked(king, chess.turn());
}

function gameOver({ ending, result }: Extract<Outcome, { over: true; }>): Refused
{
    return { refusal: "over", message: `The game is over by ${ending} (${result}): no move can follow.` };
}

/** A move written with a piece's letter of another language: Cf3 for an Italian or French knight, Dd1 for a queen; none for another mistake. */
function foreignLetter(input: string, bare: string): Refused | undefined
{
    const [, move = "", becomes = ""] = /^(.*[18])=?([A-Z])$/.exec(bare) ?? [];

    if (becomes !== "" && !"QRBN".includes(becomes)) {
        const piece = foreignPieces[becomes];
        const instead = piece === undefined ? "" : ` For a ${piece[0]}, ${move}=${piece[1]}.`;
        return { refusal: "unreadable", message: `"${input}" is not a move: a pawn becomes Q, R, B or N, never ${becomes}.${instead}` };
    }

    const letter = /^([A-Z])[a-h1-8]?[-x:]?[a-h][1-8]/.exec(bare)?.[1];

    if (letter === undefined || "KQRBNP".includes(letter)) {
        return undefined;
    }

    const piece = foreignPieces[letter];
    const instead = piece === undefined ? "" : ` For a ${piece[0]}, ${piece[1]}${bare.slice(1)}.`;
    // T is the Italian, French and Spanish rook, whose R is their king.
    const king = letter === "T" ? " In SAN R is the rook, and K the king." : "";
    return { refusal: "unreadable", message: `"${input}" is not a move: SAN writes the pieces K, Q, R, B and N, and a pawn with none, never ${letter}.${instead}${king}` };
}

/** A move that opens with a small letter and a square of another file, or "bb4": a pawn's capture without its x, a piece without its capital. */
function smallLetter(input: string, file: string, target: string): Refused
{
    const files = Math.abs(file.charCodeAt(0) - target.charCodeAt(0));
    const piece = file === "b" ? (["bishop", "B"] as const) : foreignPieces[file.toUpperCase()];
    const hints = [
        files === 0 ? `The pawn's move is ${target}.` : "",
        files === 1 ? `A pawn takes with an x: ${file}x${target}.` : "",
        piece === undefined ? "" : `For a ${piece[0]}, ${piece[1]}${target}.`,
    ].filter((hint) => hint !== "");
    const said = hints.length > 0 ? hints : ["A piece is a capital letter: K, Q, R, B or N."];
    return { refusal: "unreadable", message: `"${input}" is not a move: ${file} is a file. ${said.join(" ")}` };
}

/** A move that reads as none, with SAN's examples. */
function unreadable(input: string): Refused
{
    return { refusal: "unreadable", message: `"${input}" is not a move: write it in SAN (Nf3, exd5, O-O, e8=Q) or as squares (g1f3, e7e8q).` };
}

function sideToMove(chess: Chess): Side
{
    return chess.turn() === "w" ? "white" : "black";
}

function moveLabel(chess: Chess, san: string): string
{
    return `${chess.moveNumber()}${chess.turn() === "w" ? "." : "..."} ${san}`;
}

function attempt<Value>(run: () => Value): Value | undefined
{
    try {
        return run();
    } catch {
        return undefined;
    }
}
