// The board: eight ranks of squares from a FEN, one side at the bottom, Zoe's pieces (T-9), the ranks and files on the edge squares. The player moves
// with two clicks or by dragging a piece, which lifts off the board, in Zoe's design (T-70).
import { useEffect, useRef, useState } from "preact/hooks";
import type { Move, PieceLetter, Side } from "../core/index.ts";
import { Piece } from "./pieces.tsx";
import type { Text } from "./text.ts";

/**
 * The board of a position, seen from one side, with the last move's squares marked. While the player may move, their pieces answer the pointer: a press
 * picks one, and the legal moves of the piece picked show as dots, rings on captures; a second press on one of them, or a drag there, plays it. At any time
 * the right button lights a square, or draws an arrow when dragged, until a left click.
 */
export function Board({ fen, bottom, lastMove, player, selected, targets, onSelect, onMove, text }: {
    fen: string;
    bottom: Side;
    lastMove?: Move;
    player?: Side;
    selected?: string;
    targets: readonly Move[];
    onSelect: (square: string | undefined) => void;
    onMove: (from: string, to: string) => void;
    text: Text;
})
{
    const pieces = piecesOf(fen);
    const ranks = bottom === "white" ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
    const columns = bottom === "white" ? [...files] : [...files].reverse();
    const board = useRef<HTMLDivElement>(null);
    const press = useRef<Press | undefined>(undefined);
    const [drag, setDrag] = useState<Drag | undefined>(undefined);
    const marking = useRef<{ from: string; id: number; } | undefined>(undefined);
    const [marks, setMarks] = useState<Marks>(noMarks);
    const [drawing, setDrawing] = useState<Arrow | undefined>(undefined);

    const own = (square: string): boolean => {
        const piece = pieces.get(square);
        return player !== undefined && piece !== undefined && (piece === piece.toUpperCase()) === (player === "white");
    };

    const isTarget = (square: string): boolean => targets.some((move) => move.to === square);

    // The square under a point, as the board is turned; none off the board.
    const squareAt = (x: number, y: number): string | undefined => {
        const box = board.current!.getBoundingClientRect();
        const column = Math.floor((x - box.left) / (box.width / 8));
        const row = Math.floor((y - box.top) / (box.height / 8));
        return column >= 0 && column < 8 && row >= 0 && row < 8 ? `${columns[column]}${ranks[row]}` : undefined;
    };

    // Where a square's corner is, from the board's.
    const cornerOf = (square: string): [number, number] => {
        const size = board.current!.getBoundingClientRect().width / 8;
        return [columns.indexOf(square[0]!) * size, ranks.indexOf(Number(square[1])) * size];
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
                press.current = { from: selected, to: square, x: event.clientX, y: event.clientY, was: false, touch: true, id: event.pointerId, moved: false };
            } else {
                onMove(selected, square);
            }

            return;
        }

        if (!own(square)) {
            onSelect(undefined);
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
        setDrag({ from: now.from, at: [event.clientX - box.left - size / 2, event.clientY - box.top - size / 2], over, touch: now.touch, back: false });
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

        if (!cancelled && to !== undefined && to !== drag.from && isTarget(to)) {
            setDrag(undefined);
            onMove(drag.from, to);
        } else if (!cancelled && to === drag.from) {
            setDrag(undefined);
        } else {
            goBack();
        }
    };

    return (
        <>
            <div
                ref={board}
                class={player === undefined ? "board" : "board playable"}
                role="grid"
                aria-label={text.board}
                onPointerDown={down}
                onPointerMove={moveTo}
                onPointerUp={(event) => release(event, false)}
                onPointerCancel={(event) => release(event, true)}
                onContextMenu={(event) => event.preventDefault()}
            >
                {ranks.flatMap((rank, row) =>
                    columns.map((file, column) => {
                        const square = `${file}${rank}`;
                        const piece = pieces.get(square);
                        const dark = (files.indexOf(file) + rank) % 2 === 1;
                        const marked = lastMove !== undefined && (lastMove.from === square || lastMove.to === square);
                        const target = targets.find((move) => move.to === square);
                        const classes = [
                            "square",
                            dark ? "dark" : "light",
                            marked ? "last" : "",
                            selected === square ? "selected" : "",
                            marks.squares.includes(square) ? "marked" : "",
                            own(square) ? "own" : "",
                            target === undefined ? "" : target.san.includes("x") ? "hint capture" : "hint",
                            drag?.over === square && drag.over !== drag.from ? "over" : "",
                            drag?.from === square ? "from" : "",
                        ].filter((name) => name !== "").join(" ");
                        const label = piece === undefined ? square : `${square}, ${text.piece(piece.toUpperCase() as PieceLetter, piece === piece.toUpperCase() ? "white" : "black")}`;
                        return (
                            <div key={square} class={classes} role="gridcell" aria-label={label}>
                                {column === 0 ? <span class="coordinate rank">{rank}</span> : null}
                                {row === 7 ? <span class="coordinate file">{file}</span> : null}
                                {piece === undefined ? null : <Piece letter={piece} />}
                            </div>
                        );
                    })
                )}
            </div>
            <Arrows arrows={drawing === undefined ? marks.arrows : [...marks.arrows, drawing]} at={(square) => [columns.indexOf(square[0]!) + 0.5, ranks.indexOf(Number(square[1])) + 0.5]} />
            {drag === undefined || !pieces.has(drag.from) ? null : <Lifted drag={drag} letter={pieces.get(drag.from)!} />}
        </>
    );
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

/** A piece in the air: where its corner is on the board, the square it would land on, and whether it is going back. */
interface Drag
{
    readonly from: string;
    readonly at: readonly [number, number];
    readonly over?: string;
    readonly touch: boolean;
    readonly back: boolean;
}

/** An arrow drawn with the right button, from one square to another. */
interface Arrow
{
    readonly from: string;
    readonly to: string;
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

/** The arrows over the board, in squares from its top left corner: a knight's turns once, the long leg first. */
function Arrows({ arrows, at }: { arrows: readonly Arrow[]; at: (square: string) => [number, number]; })
{
    if (arrows.length === 0) {
        return null;
    }

    return (
        <svg class="arrows" viewBox="0 0 8 8" aria-hidden="true">
            {arrows.map(({ from, to }) => {
                const [x0, y0] = at(from);
                const [x1, y1] = at(to);
                const knight = Math.abs(x1 - x0) * Math.abs(y1 - y0) === 2;
                const corner: [number, number] | undefined = !knight ? undefined : Math.abs(y1 - y0) > Math.abs(x1 - x0) ? [x0, y1] : [x1, y0];
                const [fromX, fromY] = corner ?? [x0, y0];
                const length = Math.hypot(x1 - fromX, y1 - fromY);
                const [dx, dy] = [(x1 - fromX) / length, (y1 - fromY) / length];
                const [endX, endY] = [x1 - dx * arrowHead.length, y1 - dy * arrowHead.length];
                const side = (sign: number): string => `${endX - dy * arrowHead.width * sign},${endY + dx * arrowHead.width * sign}`;
                return (
                    <g key={`${from}${to}`}>
                        <path d={`M${x0} ${y0}${corner === undefined ? "" : ` L${corner[0]} ${corner[1]}`} L${endX} ${endY}`} />
                        <polygon points={`${side(1)} ${x1},${y1} ${side(-1)}`} />
                    </g>
                );
            })}
        </svg>
    );
}

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
