// What the board draws over its squares and pieces: the kings' badges at the end, the arrows, the helps' corners, pins and skewers, the control map's counts, the
// bubble of a refused move, the choice of a promotion and the piece lifted off the board.
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { DrawColour, PieceLetter, Promotion, Side } from "../../core/index.ts";
import type { HelpsView, Tone } from "../helps/view.ts";
import { Piece } from "../pieces/pieces.tsx";
import type { Text } from "../text.ts";
import type { BoardEnd, Notice } from "./board.tsx";
import type { BubblePlace, ExplainKind } from "./explain.ts";
import type { Drag } from "./pointer.ts";

/** The corner folded on a piece at risk, red on the player's and green on the other side's, in ink when no side is theirs (D-91); before its line in the card. */
export function Notch({ tone }: { tone?: Tone; })
{
    return (
        <span class={tone === undefined ? "help-notch" : `help-notch ${tone}`} aria-hidden="true">
            <svg viewBox="0 0 10 10">
                <path d="M0.5 0.5V9.5H9.5Z" />
                {/* A coloured corner is edged in ink inside its halo, as a sticker, so that the green reads on a green board too (Zoe) */}
                {tone === undefined ? null : <path class="edge" d="M0.5 0.5V9.5H9.5Z" />}
                <circle cx="2.9" cy="7.1" r="1.1" />
            </svg>
        </span>
    );
}

/** The pushpin stuck in a pinned piece from the top left corner, its needle toward the piece, in the tone of its corner at risk (D-91); in ink in no side's. */
export function Pushpin({ tone }: { tone: Tone; })
{
    return <Stuck kind="help-pin" shape={pushpin} tone={tone} />;
}

/**
 * The skewer stuck in the skewered piece, the one in front, as the pushpin in a pinned one (D-91): a stick in ink with a big bead and a small one in the tone,
 * as the piece in front and the cheaper one behind it, so that it reads apart from the pushpin, all in the tone (Stefano); in the card's line, in its colour.
 */
export function Skewer({ tone }: { tone?: Tone; })
{
    return (
        <Stuck kind="help-skewer" shape={skewer} tone={tone}>
            {tone === undefined || tone === "neutral" ? null : skewerBeads.map(({ y, radius }) => <circle key={y} cx="12" cy={y} r={radius} />)}
        </Stuck>
    );
}

/** A king's badge in the corner of its square. */
export function Badge({ kind }: { kind: BadgeKind; })
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

/**
 * The arrows over the board, in squares from its top left corner: a knight's turns once, the long leg first. In ink when they explain a refused move, and
 * cut short (Zoe): off the culprit's piece, and before the piece they point at, so both stay in sight.
 */
export function Arrows({ arrows, at, explain, occupied }: {
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

    const point = occupied === undefined ? arrowHead : helpsHead;
    const shapes = arrows.map(({ from, to, colour }) => {
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
        const [endX, endY] = [x1 - dx * point.length, y1 - dy * point.length];
        const side = (sign: number): string => `${endX - dy * point.width * sign},${endY + dx * point.width * sign}`;
        // The shaft runs a quarter into the point, and its round cap a little further, so no seam shows and the cap stays inside the point.
        const [shaftX, shaftY] = [x1 - dx * point.length * 0.75, y1 - dy * point.length * 0.75];
        const shaft = `M${x0} ${y0}${corner === undefined ? "" : ` L${corner[0]} ${corner[1]}`} L${shaftX} ${shaftY}`;
        const head = `${side(1)} ${x1},${y1} ${side(-1)}`;
        return { key: `${from}${to}`, from, colour, shaft, head };
    });

    // Arrows off one square meet in one shape; an arrow from elsewhere keeps its own edge over them, so no shape is lost where points meet (Stefano).
    const starts = [...new Set(shapes.map(({ from }) => from))];
    return (
        <svg class={explain !== undefined ? "arrows explain" : occupied !== undefined ? "arrows drawn" : "arrows"} viewBox="0 0 8 8" aria-hidden="true">
            {starts.map((start) => <ArrowGroup key={start} shapes={shapes.filter(({ from }) => from === start)} edged={occupied !== undefined} />)}
        </svg>
    );
}

/**
 * Each pin as a dashed line from the pinning piece through the pinned one to what stands behind it (D-78), and each skewer as a dash-dot one, beads on its stick, over
 * a halo that reads on every board. A pin and a skewer on the same stretch of a line stand apart on its two sides, so that both read.
 */
export function PinsAndSkewers({ pins, skewers, at }: { pins: HelpsView["pins"]; skewers: HelpsView["skewers"]; at: (square: string) => [number, number]; })
{
    const lines = [...pins.map((line) => ({ kind: "pin", line, other: skewers })), ...skewers.map((line) => ({ kind: "skewer", line, other: pins }))];

    return (
        <svg class="helps-layer" viewBox="0 0 8 8" aria-hidden="true">
            {lines.map(({ kind, line, other }) => {
                // The line stops short of both ends, as an explaining arrow does: it hides neither piece, nor the corner of a pinner at risk.
                const [startX, startY] = towards(at(line.by.square), at(line.to.square), pinTrim);
                const [endX, endY] = towards(at(line.to.square), at(line.by.square), pinTrim);
                const shift = other.some((each) => sharedSquares(each, line) > 1) ? (kind === "pin" ? 1 : -1) * sharedLineShift : 0;
                const [dx, dy] = across([startX, startY], [endX, endY], shift);
                const ends = { x1: startX + dx, y1: startY + dy, x2: endX + dx, y2: endY + dy };
                return (
                    <g key={`${kind} ${line.by.square}${line.piece.square}`} class={kind}>
                        <line class="halo" {...ends} />
                        <line {...ends} />
                    </g>
                );
            })}
        </svg>
    );
}

/** A square's counts on the control map, as a domino in its middle: how many of White's pieces reach it, and of Black's; none when no piece does. */
export function ControlCount({ counts }: { counts: readonly [number, number] | undefined; })
{
    const [white, black] = counts ?? [0, 0];

    if (white === 0 && black === 0) {
        return null;
    }

    return (
        <span class="control-count" aria-hidden="true">
            <b class="white">{white}</b>
            <b class="black">{black}</b>
        </span>
    );
}

/** Who reaches a square on the control map: only White, only Black, both or none. */
export function controlOf(counts: readonly [number, number] | undefined): "white" | "black" | "both" | "none"
{
    const [white, black] = counts ?? [0, 0];
    return white > 0 && black > 0 ? "both" : white > 0 ? "white" : black > 0 ? "black" : "none";
}

/**
 * A bubble by the piece of a refused move, where it hides neither the culprit nor the arrow's point (`where`), kept on the board at its edges; in the
 * board's middle without a piece.
 */
export function Bubble({ notice, place, where }: { notice: Notice; place?: [number, number]; where: BubblePlace; })
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

/** The pieces a pawn may become, in a column from its square toward the middle of the board, over a shade that cancels the move; Esc cancels it too. */
export function PromotionChoice({ side, column, down, onPick, text }: { side: Side; column: number; down: boolean; onPick: (piece: Promotion | undefined) => void; text: Text; })
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

/** The piece lifted off the board: it rises a frame after it appears, so it grows into the air. */
export function Lifted({ drag, letter }: { drag: Drag; letter: string; })
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

/** The kings' signs at the end, by their squares: the loser's king lies down when mated or resigning; both kings of a draw stand, the stalemated one stuck. */
export function kingSigns(pieces: ReadonlyMap<string, string>, toMove: Side, end: BoardEnd): ReadonlyMap<string, KingSign>
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

export const noSigns: ReadonlyMap<string, KingSign> = new Map();

/** An arrow drawn with the right button, from one square to another; in a colour of its own when the AI drew it (D-69). */
export interface Arrow
{
    readonly from: string;
    readonly to: string;
    readonly colour?: DrawColour;
}

/** A king's badge at the end: the winner's crown, the mate or the flag of the loser, half a point each in a draw. */
export type BadgeKind = "crown" | "mate" | "flag" | "half";

/** What a king's square shows at the end: its badge, and how its king takes the end, laid down, standing in a draw, or stalemated. */
export interface KingSign
{
    readonly badge: BadgeKind;
    readonly classes: string;
}

/** An arrow as drawn: its shaft's path and its point's corners. */
interface ArrowShape
{
    readonly key: string;
    readonly from: string;
    readonly colour: Arrow["colour"];
    readonly shaft: string;
    readonly head: string;
}

/** Arrows off one square, the AI's on a white edge (D-78): every edge under every arrow, so one edge goes round them all where they meet. */
function ArrowGroup({ shapes, edged }: { shapes: readonly ArrowShape[]; edged: boolean; })
{
    return (
        <g>
            {edged
                ? shapes.map(({ key, shaft, head }) => (
                    <g key={`edge${key}`}>
                        <path class="edge" d={shaft} />
                        <polygon class="edge" points={head} />
                    </g>
                ))
                : null}
            {shapes.map(({ key, colour, shaft, head }) => (
                <g key={key} class={colour}>
                    <path d={shaft} />
                    <polygon points={head} />
                </g>
            ))}
        </g>
    );
}

/**
 * A sign stuck in a piece from its square's top left corner, tilted toward the piece; edged in ink when coloured (Zoe). Its box holds the tilted sign and
 * its halo only, so that it sits in the corner (Stefano).
 */
function Stuck({ kind, shape, tone, children }: { kind: string; shape: string; tone: Tone | undefined; children?: ComponentChildren; })
{
    return (
        <span class={tone === undefined ? kind : `${kind} ${tone}`} aria-hidden="true">
            <svg viewBox="2 0.5 18.5 22.5">
                <g transform="rotate(-32 12 12)">
                    <path d={shape} />
                    {tone === undefined || tone === "neutral" ? null : <path class="edge" d={shape} />}
                    {children}
                </g>
            </svg>
        </span>
    );
}

/** How many of their three squares a pin and a skewer share: two when they lie on the same stretch of a line. */
function sharedSquares(one: HelpsView["pins"][number], other: HelpsView["pins"][number]): number
{
    const squares = [one.by.square, one.piece.square, one.to.square];
    return [other.by.square, other.piece.square, other.to.square].filter((square) => squares.includes(square)).length;
}

/** A step of the given length across a line, always to the same side of it whichever way the line runs. */
function across(start: readonly [number, number], end: readonly [number, number], distance: number): [number, number]
{
    const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
    const way = end[0] < start[0] || (end[0] === start[0] && end[1] < start[1]) ? -1 : 1;
    return [-(end[1] - start[1]) / length * distance * way, (end[0] - start[0]) / length * distance * way];
}

/** A point `distance` squares from `point` toward `target`. */
function towards(point: readonly [number, number], target: readonly [number, number], distance: number): [number, number]
{
    const length = Math.hypot(target[0] - point[0], target[1] - point[1]);
    return [point[0] + (target[0] - point[0]) / length * distance, point[1] + (target[1] - point[1]) / length * distance];
}

/** The bubble's icon for a kind of reason: the piece moved, a pin, the player's king on red, a bar, the two ways of castling. */
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

const promotionPieces: readonly Promotion[] = ["q", "n", "r", "b"];

// A pushpin standing up, as the bubble's pin: its cap, its body widening into the collar, and its needle. Tilted less than a diagonal, so it never lies along a pin's line.
const pushpin = "M8.6 2.2H15.4Q16.6 2.2 16.6 3.4V4.6Q16.6 5.8 15.4 5.8H14.8V9.4L18.4 13.1V14.9H13V20L12 22.6L11 20V14.9H5.6V13.1L9.2 9.4V5.8H8.6Q7.4 5.8 7.4 4.6V3.4Q7.4 2.2 8.6 2.2Z";

// A skewer standing up, in the pushpin's box: a round end, a big bead, a small one, a stretch of stick between them, and its point.
const skewer = "M10.9 2.6A1.1 1.1 0 0 1 13.1 2.6V3.75A4.2 4.2 0 0 1 13.1 11.85V13A3.1 3.1 0 0 1 13.1 18.8V20.2L12 23.4L10.9 20.2V18.8A3.1 3.1 0 0 1 10.9 13V11.85A4.2 4.2 0 0 1 10.9 3.75Z";

// The skewer's beads, on its stick: the big one and the small one, as its shape draws them.
const skewerBeads = [{ y: 7.8, radius: 4.2 }, { y: 15.9, radius: 3.1 }];

// How much an arrow that explains is cut, in squares: off the culprit at its start, and before an occupied square at its point.
const explainTrim = { start: 0.36, end: 0.4 };

// How much a pin's line is cut at each end, in squares.
const pinTrim = 0.35;

// How far a pin and a skewer on the same stretch of a line stand off it, each on its side, in squares: a little more than a line with its halo.
const sharedLineShift = 0.08;

// An arrow's head, in squares: how long, and how far each side of its line.
const arrowHead = { length: 0.42, width: 0.3 };

// The helps' point, smaller in step with their thinner shaft (Stefano).
const helpsHead = { length: 0.3, width: 0.21 };
