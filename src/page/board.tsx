// The board: eight ranks of squares from a FEN, one side at the bottom, Zoe's pieces (T-9), the ranks and files on the edge squares. The player moves
// with two clicks or by dragging a piece, which lifts off the board, in Zoe's design (T-70).
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { Badge as MoveBadge, DrawColour, DrawnArrow, DrawnSquare, Move, PieceLetter, Promotion, Side } from "../core/index.ts";
import { BadgeIcon } from "./badges.tsx";
import type { HowEnded } from "./ending.ts";
import { type BubblePlace, bubblePlace, type ExplainKind, type Explanation, keptSquares } from "./explain.ts";
import { Piece } from "./pieces.tsx";
import type { Text } from "./text.ts";

/**
 * The board of a position, seen from one side, with the last move's squares marked. While the player may move, their pieces answer the pointer: a press
 * picks one, and the legal moves of the piece picked show as dots, rings on captures; a second press on one of them, or a drag there, plays it. At any time
 * the right button lights a square, or draws an arrow when dragged, until a left click.
 */
export function Board({ fen, bottom, lastMove, badge, drawn, nextMove, jumped, check, end, player, selected, targets, dots, notice, promotion, onSelect, onMove, onRefuse, onPromote, text }: {
    fen: string;
    bottom: Side;
    lastMove?: Move;
    /** The AI's badge on the last move, in a game in analysis (D-69): on the square it went to, by its name. */
    badge?: { badge: MoveBadge; name: string; };
    /** The arrows and squares the AI drew with its note on the move shown (D-69), under the player's own marks. */
    drawn?: { arrows?: readonly DrawnArrow[]; squares?: readonly DrawnSquare[]; };
    /** The move after this position, while the player looks back (T-88): stepping back over it slides its pieces home. */
    nextMove?: Move;
    /** Whether the position comes from a jump of more moves through the game, which shows it at once. */
    jumped?: boolean;
    check: boolean;
    /** The game over, when this is its last position (T-77): the mated king's square turns red, the kings get their badges. */
    end?: BoardEnd;
    player?: Side;
    selected?: string;
    targets: readonly Move[];
    dots: boolean;
    /** Why a move was refused (T-11): a bubble over the square it went to, and a ring on the piece that forbids it. */
    notice?: Notice;
    /** A pawn on its way to the last rank (T-11): the four pieces it may become, over the square, until the player picks one or none. */
    promotion?: { from: string; to: string; side: Side; };
    onSelect: (square: string | undefined) => void;
    onMove: (from: string, to: string) => void;
    /** A piece picked and taken to a square its legal moves do not reach. */
    onRefuse: (from: string, to: string) => void;
    onPromote: (piece: Promotion | undefined) => void;
    text: Text;
})
{
    const pieces = piecesOf(fen);
    const mated = end?.how === "checkmate" ? kingToMove(fen, pieces) : undefined;
    const signs = end === undefined ? noSigns : kingSigns(pieces, fen.split(" ")[1] === "b" ? "black" : "white", end);
    const ranks = bottom === "white" ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
    const columns = bottom === "white" ? [...files] : [...files].reverse();
    const seen = (square: string): [number, number] => [columns.indexOf(square[0]!), ranks.indexOf(Number(square[1]))];
    const centreOf = (square: string): [number, number] => [columns.indexOf(square[0]!) + 0.5, ranks.indexOf(Number(square[1])) + 0.5];
    const board = useRef<HTMLDivElement>(null);
    const press = useRef<Press | undefined>(undefined);
    const [drag, setDrag] = useState<Drag | undefined>(undefined);
    const marking = useRef<{ from: string; id: number; } | undefined>(undefined);
    const [marks, setMarks] = useState<Marks>(noMarks);
    const [drawing, setDrawing] = useState<Arrow | undefined>(undefined);
    // A new position slides the pieces of its move there, but for the one the player dragged, and shakes a king in check (T-74).
    const before = useRef<string | undefined>(undefined);
    const dragged = useRef<string | undefined>(undefined);
    const motion = useMemo(() => {
        const was = before.current === undefined ? undefined : piecesOf(before.current);
        before.current = fen;
        // A move played on the position before slides there, a step back over one slides it home; a jump through the game moves every piece to its place (T-88).
        const fresh = was !== undefined && jumped !== true && lastMove !== undefined && playedOn(was, pieces, lastMove);
        const undone = was !== undefined && jumped !== true && nextMove !== undefined && playedOn(pieces, was, nextMove);
        const moved = was === undefined
            ? noMotion
            : fresh
            ? motionOf(lastMove, dragged.current, check ? kingToMove(fen, pieces) : undefined, was)
            : undone
            ? backOf(nextMove)
            : jumped === true
            ? rearranged(was, pieces)
            : noMotion;
        dragged.current = undefined;
        return moved;
    }, [fen]);

    const own = (square: string): boolean => {
        const piece = pieces.get(square);
        return player !== undefined && piece !== undefined && (piece === piece.toUpperCase()) === (player === "white");
    };

    // Where a move to a square lands: there, or castling's square for a king taken onto its own rook, as on Lichess; none for a square it cannot go to.
    const landing = (square: string): string | undefined => targets.find((move) => move.to === square || rookOf(move) === square)?.to;
    const isTarget = (square: string): boolean => landing(square) !== undefined;

    // A press on a square that is not the player's, and none of the piece picked's moves, puts the piece down, saying why it cannot go there.
    const putDown = (square: string): void => {
        onSelect(undefined);

        if (selected !== undefined) {
            onRefuse(selected, square);
        }
    };

    // The keyboard (T-11): the arrows move between the squares as the board is turned, Enter and Space press one as a click does, Esc puts the piece down.
    const [cursor, setCursor] = useState<string | undefined>(undefined);
    const focused = cursor ?? selected ?? `${columns[0]}${ranks[7]}`;

    const key = (event: KeyboardEvent, square: string): void => {
        const step = arrowSteps[event.key];

        if (step !== undefined) {
            const column = Math.min(7, Math.max(0, columns.indexOf(square[0]!) + step[0]));
            const row = Math.min(7, Math.max(0, ranks.indexOf(Number(square[1])) + step[1]));
            const next = `${columns[column]}${ranks[row]}`;
            event.preventDefault();
            setCursor(next);
            board.current!.querySelector<HTMLElement>(`[data-square="${next}"]`)!.focus();
        } else if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            pressKey(square);
        } else if (event.key === "Escape" && selected !== undefined) {
            onSelect(undefined);
        }
    };

    // The focus goes back to the board after the choice of a promotion: to the pawn's square when it was cancelled, else to where it went.
    const promote = (piece: Promotion | undefined): void => {
        const back = piece === undefined ? promotion!.from : promotion!.to;
        onPromote(piece);
        setCursor(back);
        requestAnimationFrame(() => board.current?.querySelector<HTMLElement>(`[data-square="${back}"]`)?.focus());
    };

    const pressKey = (square: string): void => {
        setMarks(noMarks);

        if (player === undefined) {
            return;
        }

        if (selected !== undefined && isTarget(square)) {
            onMove(selected, landing(square)!);
        } else if (own(square)) {
            onSelect(selected === square ? undefined : square);
        } else {
            putDown(square);
        }
    };

    // The square under a point, as the board is turned; none off the board.
    const squareAt = (x: number, y: number): string | undefined => {
        const box = board.current!.getBoundingClientRect();
        const column = Math.floor((x - box.left) / (box.width / 8));
        const row = Math.floor((y - box.top) / (box.height / 8));
        return column >= 0 && column < 8 && row >= 0 && row < 8 ? `${columns[column]}${ranks[row]}` : undefined;
    };

    // Where a square's corner is in the window.
    const cornerOf = (square: string): [number, number] => {
        const box = board.current!.getBoundingClientRect();
        const size = box.width / 8;
        return [box.left + columns.indexOf(square[0]!) * size, box.top + ranks.indexOf(Number(square[1])) * size];
    };

    const goBack = (): void => {
        setDrag((now) => now === undefined ? undefined : { ...now, at: cornerOf(now.from), over: undefined, back: true });
    };

    useEffect(() => {
        if (drag === undefined) {
            return;
        }

        // Esc puts the piece back; a piece going back lands within 260 ms, whether its transition ends or not.
        const escape = (event: KeyboardEvent): void => {
            if (event.key === "Escape") {
                press.current = undefined;
                goBack();
            }
        };

        const landed = drag.back ? setTimeout(() => setDrag(undefined), reducedMotion() ? 0 : 260) : undefined;
        addEventListener("keydown", escape);
        document.documentElement.classList.add("dragging");

        return () => {
            removeEventListener("keydown", escape);
            document.documentElement.classList.remove("dragging");
            clearTimeout(landed);
        };
    }, [drag?.back, drag === undefined]);

    const down = (event: PointerEvent): void => {
        const square = squareAt(event.clientX, event.clientY);

        if (square === undefined) {
            return;
        }

        // The right button marks a square, or draws an arrow when dragged (T-73); the left one clears them all, and moves.
        if (event.button === 2) {
            marking.current = { from: square, id: event.pointerId };
            board.current!.setPointerCapture(event.pointerId);
            return;
        }

        if (event.button !== 0) {
            return;
        }

        setMarks(noMarks);

        if (player === undefined || drag !== undefined) {
            return;
        }

        if (selected !== undefined && isTarget(square)) {
            // A finger plays when it lifts, so a page scrolled from a dot plays nothing.
            if (event.pointerType === "touch") {
                press.current = { from: selected, to: landing(square)!, x: event.clientX, y: event.clientY, was: false, touch: true, id: event.pointerId, moved: false };
            } else {
                onMove(selected, landing(square)!);
            }

            return;
        }

        if (!own(square)) {
            putDown(square);
            return;
        }

        press.current = { from: square, x: event.clientX, y: event.clientY, was: selected === square, touch: event.pointerType === "touch", id: event.pointerId, moved: false };
        board.current!.setPointerCapture(event.pointerId);
        onSelect(square);
    };

    const moveTo = (event: PointerEvent): void => {
        const mark = marking.current;

        if (mark !== undefined && event.pointerId === mark.id) {
            const to = squareAt(event.clientX, event.clientY);
            setDrawing(to === undefined || to === mark.from ? undefined : { from: mark.from, to });
            return;
        }

        const now = press.current;

        if (now === undefined || event.pointerId !== now.id) {
            return;
        }

        const box = board.current!.getBoundingClientRect();
        const size = box.width / 8;
        const distance = Math.hypot(event.clientX - now.x, event.clientY - now.y);

        if (now.to !== undefined) {
            if (distance >= 8) {
                press.current = undefined;
            }

            return;
        }

        // A press becomes a drag past 4 px of the mouse, 8 of a finger; before, it is a click.
        if (drag === undefined && distance < (now.touch ? 8 : 4)) {
            return;
        }

        now.moved ||= distance >= size / 2;
        // A finger holds the piece three quarters of a square above it, and drops it where the piece is seen; until it has gone half a square, the
        // piece stays on its own, so a touch never pushes it a square on by mistake.
        const over = now.touch && !now.moved ? now.from : squareAt(event.clientX, now.touch ? event.clientY - 0.75 * size : event.clientY);
        setDrag({ from: now.from, at: [event.clientX - size / 2, event.clientY - size / 2], over, touch: now.touch, back: false });
    };

    const release = (event: PointerEvent, cancelled: boolean): void => {
        const mark = marking.current;

        if (mark !== undefined && event.pointerId === mark.id) {
            const to = squareAt(event.clientX, event.clientY);
            marking.current = undefined;
            setDrawing(undefined);

            if (!cancelled && to !== undefined) {
                setMarks((now) => toggled(now, mark.from, to));
            }

            return;
        }

        const now = press.current;

        if (now === undefined || event.pointerId !== now.id) {
            return;
        }

        press.current = undefined;

        if (now.to !== undefined) {
            if (!cancelled) {
                onMove(now.from, now.to);
            }

            return;
        }

        if (drag === undefined) {
            // A click on the piece already picked puts it down.
            if (now.was) {
                onSelect(undefined);
            }

            return;
        }

        const to = drag.over;

        const landed = to === undefined || to === drag.from ? undefined : landing(to);

        if (!cancelled && landed !== undefined) {
            setDrag(undefined);
            dragged.current = `${drag.from}${landed}`;
            onMove(drag.from, landed);
        } else if (!cancelled && to === drag.from) {
            setDrag(undefined);
        } else {
            goBack();

            // A game that changed under the drag may have given the turn away: no reason for a piece that may not move.
            if (!cancelled && to !== undefined && to !== drag.from && player !== undefined) {
                onRefuse(drag.from, to);
            }
        }
    };

    return (
        <>
            <div
                ref={board}
                class={["board", player === undefined ? "" : "playable", end === undefined ? "" : endClasses(end)].filter((name) => name !== "").join(" ")}
                role="group"
                aria-label={text.boardLabel(fen.split(" ")[1] === "b" ? "black" : "white", lastMove?.san)}
                onPointerDown={down}
                onPointerMove={moveTo}
                onPointerUp={(event) => release(event, false)}
                onPointerCancel={(event) => release(event, true)}
                onContextMenu={(event) => event.preventDefault()}
                // A click takes no focus, nor leaves it elsewhere: the arrows keep browsing the moves; a square has the focus only from the keyboard.
                onMouseDown={(event) => {
                    event.preventDefault();
                    (document.activeElement as HTMLElement | null)?.blur();
                }}
            >
                {ranks.flatMap((rank, row) =>
                    columns.map((file, column) => {
                        const square = `${file}${rank}`;
                        const piece = pieces.get(square);
                        const dark = (files.indexOf(file) + rank) % 2 === 1;
                        const marked = lastMove !== undefined && (lastMove.from === square || lastMove.to === square);
                        const target = targets.find((move) => move.to === square);
                        const sign = signs.get(square);
                        const tinted = drawn?.squares?.find((one) => one.square === square)?.colour;
                        const classes = [
                            "square",
                            dark ? "dark" : "light",
                            marked ? "last" : "",
                            mated === square ? "mated" : "",
                            sign?.classes ?? "",
                            selected === square ? "selected" : "",
                            tinted === undefined ? "" : `noted ${tinted}`,
                            marks.squares.includes(square) ? "marked" : "",
                            notice?.explanation?.ring === square ? "culprit" : "",
                            own(square) ? "own" : "",
                            target === undefined ? "" : !dots ? "target" : target.san.includes("x") ? "hint capture" : "hint",
                            drag?.over === square && drag.over !== drag.from ? "over" : "",
                            drag?.from === square ? "from" : "",
                            motion.slides.has(square) ? "slide" : "",
                            motion.shake === square ? "shake" : "",
                            motion.appear?.has(square) === true ? "appear" : "",
                        ].filter((name) => name !== "").join(" ");
                        const named = piece === undefined ? square : `${square}, ${text.piece(piece.toUpperCase() as PieceLetter, piece === piece.toUpperCase() ? "white" : "black")}`;
                        const label = [named, mated === square ? text.checkmate : "", isTarget(square) ? text.canGo : ""].filter((part) => part !== "").join(", ");
                        const from = motion.slides.get(square);
                        const moving = from !== undefined || motion.shake === square || motion.appear?.has(square) === true;
                        // How far the sliding piece comes from, in squares as the board is turned.
                        const away = from === undefined ? undefined : {
                            "--dx": columns.indexOf(from[0]!) - column,
                            "--dy": ranks.indexOf(Number(from[1])) - row,
                        };
                        return (
                            <div
                                key={square}
                                class={classes}
                                role="button"
                                aria-label={label}
                                aria-pressed={own(square) ? selected === square : undefined}
                                tabIndex={square === focused ? 0 : -1}
                                data-square={square}
                                onKeyDown={(event) => key(event, square)}
                                onFocus={() => setCursor(square)}
                                // A click with no pointer behind it, as a screen reader's in browse mode, presses the square as Enter does.
                                onClick={(event) => event.detail === 0 && pressKey(square)}
                                style={away}
                            >
                                {column === 0 ? <span class="coordinate rank">{rank}</span> : null}
                                {row === 7 ? <span class="coordinate file">{file}</span> : null}
                                {motion.taken?.square === square
                                    ? (
                                        <span key={`taken ${fen}`} class="taken-piece">
                                            <Piece letter={motion.taken.letter} />
                                        </span>
                                    )
                                    : null}
                                {motion.gone?.filter((gone) => gone.square === square).map((gone) => (
                                    <span key={`gone ${fen}`} class="gone-piece">
                                        <Piece letter={gone.letter} />
                                    </span>
                                ))}
                                {piece === undefined ? null : <Piece key={moving ? fen : "still"} letter={piece} />}
                                {sign === undefined ? null : <Badge kind={sign.badge} />}
                                {badge === undefined || lastMove?.to !== square ? null : <BadgeIcon badge={badge.badge} title={badge.name} />}
                            </div>
                        );
                    })
                )}
            </div>
            {drawn?.arrows === undefined ? null : <Arrows arrows={drawn.arrows} at={centreOf} occupied={(square) => pieces.has(square)} />}
            <Arrows arrows={drawing === undefined ? marks.arrows : [...marks.arrows, drawing]} at={centreOf} />
            {notice?.explanation?.arrow === undefined ? null : <Arrows arrows={[notice.explanation.arrow]} at={centreOf} explain={{ occupied: pieces.has(notice.explanation.arrow.to) }} />}
            {drag === undefined || !pieces.has(drag.from) ? null : <Lifted drag={drag} letter={pieces.get(drag.from)!} />}
            {promotion === undefined
                ? null
                : <PromotionChoice side={promotion.side} column={columns.indexOf(promotion.to[0]!)} down={ranks[0] === Number(promotion.to[1])} onPick={promote} text={text} />}
            {notice === undefined ? null : (
                <Bubble
                    notice={notice}
                    place={notice.square === undefined ? undefined : seen(notice.square)}
                    where={notice.square === undefined
                        ? "above"
                        : bubblePlace(seen(notice.square), keptSquares(notice.explanation).map(seen), (board.current?.clientWidth ?? 0) < narrowBoard)}
                />
            )}
        </>
    );
}

/**
 * What the board says of a refused move, over the piece moved, or in its middle for a request refused; with the piece's letter, for the bubble's icon, and
 * what explains the move (T-91).
 */
export interface Notice
{
    readonly text: string;
    readonly square?: string;
    readonly piece?: string;
    readonly explanation?: Explanation;
}

/** A game over as the board shows it (T-77): how it ended, who won, the player's side, and whether it ended a moment ago, which plays its effects. */
export interface BoardEnd
{
    readonly how?: HowEnded;
    readonly winner?: Side;
    readonly player: Side;
    readonly fresh: boolean;
}

/** The pieces of a FEN by square, as its letters: uppercase for White. */
export function piecesOf(fen: string): Map<string, string>
{
    const pieces = new Map<string, string>();
    const rows = (fen.split(" ")[0] ?? "").split("/");

    rows.forEach((row, index) => {
        let file = 0;

        for (const letter of row) {
            if (/\d/.test(letter)) {
                file += Number(letter);
            } else {
                pieces.set(`${files[file]}${8 - index}`, letter);
                file += 1;
            }
        }
    });

    return pieces;
}

/**
 * A press on one of the player's pieces: where it began, whether the piece was picked already, and whether the finger has gone half a square; or a finger on
 * a dot, `to`, which plays the picked piece there when it lifts.
 */
interface Press
{
    readonly from: string;
    readonly to?: string;
    readonly x: number;
    readonly y: number;
    readonly was: boolean;
    readonly touch: boolean;
    readonly id: number;
    moved: boolean;
}

/** A piece in the air: where its corner is in the window, the square it would land on, and whether it is going back. */
interface Drag
{
    readonly from: string;
    readonly at: readonly [number, number];
    readonly over?: string;
    readonly touch: boolean;
    readonly back: boolean;
}

/**
 * How a new position moves on the board: each sliding piece's square with the square it comes from, the piece it takes, which stays until it arrives, and
 * the king in check that shakes.
 */
interface Motion
{
    readonly slides: ReadonlyMap<string, string>;
    readonly taken?: { readonly square: string; readonly letter: string; };
    /** After a jump through the game (T-88): the pieces that fade from their squares, and the squares where a piece appears. */
    readonly gone?: readonly { readonly square: string; readonly letter: string; }[];
    readonly appear?: ReadonlySet<string>;
    readonly shake?: string;
}

const noMotion: Motion = { slides: new Map() };

/**
 * The last move slides, but for a piece the player dragged there (`dragged`, its squares), over the piece it takes, as it stood `before`; a castling rook
 * slides always.
 */
function motionOf(move: Move, dragged: string | undefined, shake: string | undefined, before: ReadonlyMap<string, string>): Motion
{
    const slides = new Map<string, string>();
    let taken: Motion["taken"];

    if (dragged !== `${move.from}${move.to}`) {
        slides.set(move.to, move.from);
        // A pawn that takes en passant lands beside the pawn it takes.
        const square = before.has(move.to) ? move.to : before.get(move.from)?.toLowerCase() === "p" && move.from[0] !== move.to[0] ? `${move.to[0]}${move.from[1]}` : undefined;
        const letter = square === undefined ? undefined : before.get(square);
        taken = square === undefined || letter === undefined ? undefined : { square, letter };
    }

    const rank = move.from[1];

    if (move.san.startsWith("O-O-O")) {
        slides.set(`d${rank}`, `a${rank}`);
    } else if (move.san.startsWith("O-O")) {
        slides.set(`f${rank}`, `h${rank}`);
    }

    return { slides, ...(taken === undefined ? {} : { taken }), ...(shake === undefined ? {} : { shake }) };
}

/**
 * A jump through the game, from the pieces `before` to those `now`: each piece slides to the nearest square where one like it stands now, the closest pairs
 * first; a piece left over fades, and one that has no piece to come from appears.
 */
function rearranged(before: ReadonlyMap<string, string>, now: ReadonlyMap<string, string>): Motion
{
    const left = [...before].filter(([square, letter]) => now.get(square) !== letter);
    const arrived = [...now].filter(([square, letter]) => before.get(square) !== letter);
    const pairs = arrived
        .flatMap(([to, letter]) => left.filter(([, was]) => was === letter).map(([from]) => ({ from, to, distance: distanceOf(from, to) })))
        .sort((one, other) => one.distance - other.distance);
    const slides = new Map<string, string>();
    const moved = new Set<string>();

    for (const { from, to } of pairs) {
        if (!slides.has(to) && !moved.has(from)) {
            slides.set(to, from);
            moved.add(from);
        }
    }

    return {
        slides,
        appear: new Set(arrived.map(([square]) => square).filter((square) => !slides.has(square))),
        gone: left.filter(([square]) => !moved.has(square)).map(([square, letter]) => ({ square, letter })),
    };
}

/** How far apart two squares are, in squares. */
function distanceOf(from: string, to: string): number
{
    return Math.hypot(files.indexOf(from[0]!) - files.indexOf(to[0]!), Number(from[1]) - Number(to[1]));
}

/** A move taken back: its piece, and a castling rook, slide home; a piece it took is there again under the one leaving. */
function backOf(move: Move): Motion
{
    const rank = move.from[1];
    const slides = new Map<string, string>([[move.from, move.to]]);

    if (move.san.startsWith("O-O-O")) {
        slides.set(`a${rank}`, `d${rank}`);
    } else if (move.san.startsWith("O-O")) {
        slides.set(`h${rank}`, `f${rank}`);
    }

    return { slides };
}

/** Whether the pieces `now` are those `before` with the move played: the piece on its square came from where it began, a pawn there when it promoted. */
function playedOn(before: ReadonlyMap<string, string>, now: ReadonlyMap<string, string>, move: Move): boolean
{
    const piece = before.get(move.from);
    const landed = now.get(move.to);
    return piece !== undefined && !now.has(move.from) && (landed === piece || (move.san.includes("=") && piece.toLowerCase() === "p"));
}

/** The square of the king whose side is to move in a FEN. */
function kingToMove(fen: string, pieces: ReadonlyMap<string, string>): string | undefined
{
    const king = fen.split(" ")[1] === "b" ? "k" : "K";
    return [...pieces].find(([, letter]) => letter === king)?.[0];
}

/** A king's badge at the end: the winner's crown, the mate or the flag of the loser, half a point each in a draw. */
type BadgeKind = "crown" | "mate" | "flag" | "half";

/** What a king's square shows at the end: its badge, and how its king takes the end, laid down, standing in a draw, or stalemated. */
interface KingSign
{
    readonly badge: BadgeKind;
    readonly classes: string;
}

const noSigns: ReadonlyMap<string, KingSign> = new Map();

/** The kings' signs at the end, by their squares: the loser's king lies down when mated or resigning; both kings of a draw stand, the stalemated one stuck. */
function kingSigns(pieces: ReadonlyMap<string, string>, toMove: Side, end: BoardEnd): ReadonlyMap<string, KingSign>
{
    const kingOf = (side: Side): string | undefined => [...pieces].find(([, letter]) => letter === (side === "white" ? "K" : "k"))?.[0];
    const signs = new Map<string, KingSign>();

    const sign = (side: Side, badge: BadgeKind, classes: string): void => {
        const square = kingOf(side);

        if (square !== undefined) {
            signs.set(square, { badge, classes });
        }
    };

    if (end.winner === undefined) {
        sign("white", "half", end.how === "stalemate" && toMove === "white" ? "drawn stalled" : "drawn");
        sign("black", "half", end.how === "stalemate" && toMove === "black" ? "drawn stalled" : "drawn");
        return signs;
    }

    const loser = end.winner === "white" ? "black" : "white";
    sign(end.winner, "crown", "winner");

    if (end.how === "checkmate" || end.how === "resignation") {
        sign(loser, end.how === "checkmate" ? "mate" : "flag", "fallen");
    }

    return signs;
}

/** The board's classes at the end: how the game ended, and, a moment after it did, whether the player won or lost, which pick the effects in the style. */
function endClasses(end: BoardEnd): string
{
    const side = end.winner === undefined ? "" : end.winner === end.player ? "player-won" : "player-lost";
    const classes = ["ended", end.how === undefined ? "" : `by-${end.how.replaceAll(" ", "-")}`, end.fresh ? `fresh ${side}` : ""];
    return classes.filter((name) => name !== "").join(" ").trim();
}

/** A king's badge in the corner of its square. */
function Badge({ kind }: { kind: BadgeKind; })
{
    return (
        <span class={`badge ${kind}`} aria-hidden="true">
            {kind === "mate" ? "#" : kind === "half" ? "½" : (
                <svg viewBox="0 0 24 24">
                    {kind === "crown" ? <path d="M4 18L3 7L8.5 11L12 5L15.5 11L21 7L20 18Z" /> : <path d="M6 21V4M6 4.5C10 2.5 13 6.5 18 4.5V13.5C13 15.5 10 11.5 6 13.5" />}
                </svg>
            )}
        </span>
    );
}

/** An arrow drawn with the right button, from one square to another; in a colour of its own when the AI drew it (D-69). */
interface Arrow
{
    readonly from: string;
    readonly to: string;
    readonly colour?: DrawColour;
}

/** What the player marked with the right button: squares lit and arrows, until a left click. */
interface Marks
{
    readonly squares: readonly string[];
    readonly arrows: readonly Arrow[];
}

const noMarks: Marks = { squares: [], arrows: [] };

/** The marks with a square, or an arrow when the squares differ, added; taken away when they were there. */
function toggled(marks: Marks, from: string, to: string): Marks
{
    if (from === to) {
        return { ...marks, squares: marks.squares.includes(to) ? marks.squares.filter((square) => square !== to) : [...marks.squares, to] };
    }

    const there = marks.arrows.some((arrow) => arrow.from === from && arrow.to === to);
    return { ...marks, arrows: there ? marks.arrows.filter((arrow) => arrow.from !== from || arrow.to !== to) : [...marks.arrows, { from, to }] };
}

/**
 * The arrows over the board, in squares from its top left corner: a knight's turns once, the long leg first. In ink when they explain a refused move, and
 * cut short (T-91, Zoe): off the culprit's piece, and before the piece they point at, so both stay in sight.
 */
function Arrows({ arrows, at, explain, occupied }: {
    arrows: readonly Arrow[];
    at: (square: string) => [number, number];
    explain?: { readonly occupied: boolean; };
    /** The AI's arrows (D-69): their points stop short of a piece, as an explaining arrow's. */
    occupied?: (square: string) => boolean;
})
{
    if (arrows.length === 0) {
        return null;
    }

    return (
        <svg class={explain !== undefined ? "arrows explain" : occupied !== undefined ? "arrows drawn" : "arrows"} viewBox="0 0 8 8" aria-hidden="true">
            {arrows.map(({ from, to, colour }) => {
                const [startX, startY] = at(from);
                const [pointX, pointY] = at(to);
                const knight = Math.abs(pointX - startX) * Math.abs(pointY - startY) === 2;
                const corner: [number, number] | undefined = !knight
                    ? undefined
                    : Math.abs(pointY - startY) > Math.abs(pointX - startX)
                    ? [startX, pointY]
                    : [pointX, startY];
                const [x0, y0] = explain === undefined ? [startX, startY] : towards([startX, startY], corner ?? [pointX, pointY], explainTrim.start);
                const [x1, y1] = explain?.occupied === true || occupied?.(to) === true ? towards([pointX, pointY], corner ?? [startX, startY], explainTrim.end) : [pointX, pointY];
                const [fromX, fromY] = corner ?? [x0, y0];
                const length = Math.hypot(x1 - fromX, y1 - fromY);
                const [dx, dy] = [(x1 - fromX) / length, (y1 - fromY) / length];
                const [endX, endY] = [x1 - dx * arrowHead.length, y1 - dy * arrowHead.length];
                const side = (sign: number): string => `${endX - dy * arrowHead.width * sign},${endY + dx * arrowHead.width * sign}`;
                // The shaft runs halfway into the point, so no seam shows where they meet; the layer's opacity hides the overlap.
                const [shaftX, shaftY] = [x1 - dx * arrowHead.length / 2, y1 - dy * arrowHead.length / 2];
                return (
                    <g key={`${from}${to}`} class={colour}>
                        <path d={`M${x0} ${y0}${corner === undefined ? "" : ` L${corner[0]} ${corner[1]}`} L${shaftX} ${shaftY}`} />
                        <polygon points={`${side(1)} ${x1},${y1} ${side(-1)}`} />
                    </g>
                );
            })}
        </svg>
    );
}

/** A point `distance` squares from `point` toward `target`. */
function towards(point: readonly [number, number], target: readonly [number, number], distance: number): [number, number]
{
    const length = Math.hypot(target[0] - point[0], target[1] - point[1]);
    return [point[0] + (target[0] - point[0]) / length * distance, point[1] + (target[1] - point[1]) / length * distance];
}

/**
 * A bubble by the piece of a refused move, where it hides neither the culprit nor the arrow's point (`where`, T-91), kept on the board at its edges; in the
 * board's middle without a piece.
 */
function Bubble({ notice, place, where }: { notice: Notice; place?: [number, number]; where: BubblePlace; })
{
    if (place === undefined) {
        return <p key={notice.text} class="notice centre" role="alert">{notice.text}</p>;
    }

    const [column, row] = place;
    const align = column <= 1 ? "start" : column >= 6 ? "end" : "middle";
    const kind = notice.explanation?.kind;
    return (
        <p key={`${notice.square} ${notice.text}`} class={`notice ${align} ${where}`} role="alert" style={{ "--column": column, "--row": row }}>
            {kind === undefined || notice.piece === undefined ? null : <ExplainIcon kind={kind} piece={notice.piece} />}
            <span>{notice.text}</span>
        </p>
    );
}

/** The bubble's icon for a kind of reason (T-91): the piece moved, a pin, the player's king on red, a bar, the two ways of castling. */
function ExplainIcon({ kind, piece }: { kind: ExplainKind; piece: string; })
{
    const white = piece === piece.toUpperCase();
    return (
        <span class={`explain-icon ${kind}`} aria-hidden="true">
            {kind === "piece" ? <Piece letter={piece} /> : kind === "king" ? <Piece letter={white ? "K" : "k"} /> : (
                <svg viewBox="0 0 24 24">
                    {kind === "pin"
                        ? <path d="M9 3h6M10 3v6l-3 4h10l-3-4V3M12 13v8" />
                        : kind === "blocked"
                        ? (
                            <>
                                <circle cx="12" cy="12" r="8.5" />
                                <path class="bar" d="M7.5 12h9" />
                            </>
                        )
                        : <path d="M4 8h15M15 4l4 4-4 4M20 16H5M9 12l-4 4 4 4" />}
                </svg>
            )}
        </span>
    );
}

/** The pieces a pawn may become, in a column from its square toward the middle of the board, over a shade that cancels the move; Esc cancels it too. */
function PromotionChoice({ side, column, down, onPick, text }: { side: Side; column: number; down: boolean; onPick: (piece: Promotion | undefined) => void; text: Text; })
{
    const first = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        first.current?.focus();

        const escape = (event: KeyboardEvent): void => {
            if (event.key === "Escape") {
                onPick(undefined);
            }
        };

        addEventListener("keydown", escape);
        return () => removeEventListener("keydown", escape);
    }, []);

    return (
        <div class="promotion" role="group" aria-label={text.promoteTo}>
            <div class="promotion-shade" onPointerDown={() => onPick(undefined)} />
            {promotionPieces.map((piece, index) => (
                <button
                    key={piece}
                    ref={index === 0 ? first : undefined}
                    type="button"
                    class="promotion-piece"
                    style={{ "--column": column, "--row": down ? index : 7 - index }}
                    aria-label={text.piece(piece.toUpperCase() as PieceLetter, side)}
                    onClick={() => onPick(piece)}
                >
                    <Piece letter={side === "white" ? piece.toUpperCase() : piece} />
                </button>
            ))}
        </div>
    );
}

const promotionPieces: readonly Promotion[] = ["q", "n", "r", "b"];

/** The corner of the rook a castling moves; none for another move. */
function rookOf(move: Move): string | undefined
{
    return move.san.startsWith("O-O-O") ? `a${move.from[1]}` : move.san.startsWith("O-O") ? `h${move.from[1]}` : undefined;
}

// How each arrow moves the keyboard's square, in columns and rows as the board is seen.
const arrowSteps: Readonly<Record<string, readonly [number, number]>> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

// How much an arrow that explains is cut, in squares: off the culprit at its start, and before an occupied square at its point.
const explainTrim = { start: 0.36, end: 0.4 };

// A board narrower than this, in pixels, is a phone's: its bubble takes the board's width, and goes under the board when it has no room on it.
const narrowBoard = 520;

// An arrow's head, in squares: how long, and how far each side of its line.
const arrowHead = { length: 0.42, width: 0.3 };

/** The piece lifted off the board: it rises a frame after it appears, so it grows into the air. */
function Lifted({ drag, letter }: { drag: Drag; letter: string; })
{
    const [up, setUp] = useState(false);

    useEffect(() => {
        const frame = requestAnimationFrame(() => setUp(true));
        return () => cancelAnimationFrame(frame);
    }, []);

    const classes = ["lifted", up && !drag.back ? "up" : "", drag.touch ? "touch" : "", drag.back ? "back" : ""].filter((name) => name !== "").join(" ");
    return (
        <div class={classes} style={{ "--x": `${drag.at[0]}px`, "--y": `${drag.at[1]}px` }}>
            <Piece letter={letter} />
        </div>
    );
}

function reducedMotion(): boolean
{
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const files = "abcdefgh";
