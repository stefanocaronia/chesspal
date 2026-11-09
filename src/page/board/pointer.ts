// The board under the pointer and the keyboard: a press picks a piece and a second plays it, a drag lifts it and drops it, the right
// button lights squares and draws arrows, the arrows walk the squares.
import type { RefObject } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { Move, Promotion, Side } from "../../core/index.ts";
import type { Arrow } from "./marks.tsx";

/** What the pointer and the keyboard give the board: its element, the piece in the air, the player's marks, the square the keyboard is on, and the handlers. */
export interface BoardPointer
{
    readonly board: RefObject<HTMLDivElement>;
    readonly drag: Drag | undefined;
    readonly marks: Marks;
    /** The arrow the right button is drawing. */
    readonly drawing: Arrow | undefined;
    readonly focused: string;
    /** The squares of the move the player dragged, which lands where it was dropped instead of sliding there. */
    readonly dragged: { current: string | undefined; };
    own(square: string): boolean;
    isTarget(square: string): boolean;
    down(event: PointerEvent): void;
    moveTo(event: PointerEvent): void;
    release(event: PointerEvent, cancelled: boolean): void;
    key(event: KeyboardEvent, square: string): void;
    pressKey(square: string): void;
    promote(piece: Promotion | undefined): void;
    setCursor(square: string): void;
}

/**
 * The board's pointer and keyboard, for the board turned as `columns` and `ranks` say from its top left corner: the player's pieces answer while they may
 * move, the right button marks at any time.
 */
export function useBoardPointer({ columns, ranks, pieces, player, selected, targets, promotion, onSelect, onMove, onRefuse, onPromote }: {
    columns: readonly string[];
    ranks: readonly number[];
    pieces: ReadonlyMap<string, string>;
    player: Side | undefined;
    selected: string | undefined;
    targets: readonly Move[];
    promotion: { from: string; to: string; } | undefined;
    onSelect: (square: string | undefined) => void;
    onMove: (from: string, to: string) => void;
    onRefuse: (from: string, to: string) => void;
    onPromote: (piece: Promotion | undefined) => void;
}): BoardPointer
{
    const board = useRef<HTMLDivElement>(null);
    const press = useRef<Press | undefined>(undefined);
    const [drag, setDrag] = useState<Drag | undefined>(undefined);
    const marking = useRef<{ from: string; id: number; } | undefined>(undefined);
    const [marks, setMarks] = useState<Marks>(noMarks);
    const [drawing, setDrawing] = useState<Arrow | undefined>(undefined);
    const dragged = useRef<string | undefined>(undefined);

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

    // The keyboard: the arrows move between the squares as the board is turned, Enter and Space press one as a click does, Esc puts the piece down.
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

        // The right button marks a square, or draws an arrow when dragged; the left one clears them all, and moves.
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

    return { board, drag, marks, drawing, focused, dragged, own, isTarget, down, moveTo, release, key, pressKey, promote, setCursor };
}

/** A piece in the air: where its corner is in the window, the square it would land on, and whether it is going back. */
export interface Drag
{
    readonly from: string;
    readonly at: readonly [number, number];
    readonly over?: string;
    readonly touch: boolean;
    readonly back: boolean;
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

/** What the player marked with the right button: squares lit and arrows, until a left click. */
export interface Marks
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

/** The corner of the rook a castling moves; none for another move. */
function rookOf(move: Move): string | undefined
{
    return move.san.startsWith("O-O-O") ? `a${move.from[1]}` : move.san.startsWith("O-O") ? `h${move.from[1]}` : undefined;
}

// How each arrow moves the keyboard's square, in columns and rows as the board is seen.
const arrowSteps: Readonly<Record<string, readonly [number, number]>> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

function reducedMotion(): boolean
{
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
}
