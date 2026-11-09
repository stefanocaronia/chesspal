// The board: eight ranks of squares from a FEN, one side at the bottom, Zoe's pieces, the ranks and files on the edge squares. The player moves
// with two clicks or by dragging a piece, which lifts off the board, in Zoe's design.
import { useMemo, useRef } from "preact/hooks";
import type { Badge as MoveBadge, DrawnArrow, DrawnSquare, Move, PieceLetter, Profile, Promotion, Side, Square } from "../../core/index.ts";
import { BadgeIcon } from "../game/badges.tsx";
import type { HowEnded } from "../game/ending.ts";
import { type HelpsView, riskOn } from "../helps/view.ts";
import { Piece } from "../pieces/pieces.tsx";
import type { Text } from "../text.ts";
import { bubblePlace, type Explanation, keptSquares } from "./explain.ts";
import { Arrows, Badge, Bubble, ControlCount, controlOf, kingSigns, Lifted, noSigns, Notch, Pins, PromotionChoice } from "./marks.tsx";
import { backOf, motionOf, noMotion, playedOn, rearranged } from "./motion.ts";
import { useBoardPointer } from "./pointer.ts";
import { files, kingToMove, piecesOf } from "./squares.ts";

/**
 * The board of a position, seen from one side, with the last move's squares marked. While the player may move, their pieces answer the pointer: a press
 * picks one, and the legal moves of the piece picked show as dots, rings on captures; a second press on one of them, or a drag there, plays it. At any time
 * the right button lights a square, or draws an arrow when dragged, until a left click.
 */
export function Board({ fen, bottom, lastMove, pointed, helps, control, bare, badge, drawn, nextMove, jumped, check, end, player, selected, targets, dots, names, notice, promotion, onSelect, onMove, onRefuse, onPromote, text }: {
    fen: string;
    bottom: Side;
    lastMove?: Move;
    /** The squares the player points at in the AI's words or in the helps' card (D-78). */
    pointed?: readonly string[];
    /** The helps (D-78): a corner folded on each piece at risk, a dashed line for each pin. */
    helps?: HelpsView;
    /** The control map, while it is held (D-78): how many pieces of each side attack each square, [White, Black]. */
    control?: Profile["control"];
    /**
     * The board without the arrows and the squares drawn on it, the AI's, the coach's and the player's, and without the helps' corners and pins' lines, while
     * its button is held (Stefano).
     */
    bare?: boolean;
    /** The AI's badge on the last move, in a game in analysis (D-69): on the square it went to, by its name. */
    badge?: { badge: MoveBadge; name: string; };
    /** The arrows and squares the AI drew with its note on the move shown (D-69), under the player's own marks. */
    drawn?: { arrows?: readonly DrawnArrow[]; squares?: readonly DrawnSquare[]; };
    /** The move after this position, while the player looks back: stepping back over it slides its pieces home. */
    nextMove?: Move;
    /** Whether the position comes from a jump of more moves through the game, which shows it at once. */
    jumped?: boolean;
    check: boolean;
    /** The game over, when this is its last position: the mated king's square turns red, the kings get their badges. */
    end?: BoardEnd;
    player?: Side;
    selected?: string;
    targets: readonly Move[];
    dots: boolean;
    /** Whether a square's name shows in its corner under the pointer or the piece dragged, as the player chose. */
    names: boolean;
    /** Why a move was refused: a bubble over the square it went to, and a ring on the piece that forbids it. */
    notice?: Notice;
    /** A pawn on its way to the last rank: the four pieces it may become, over the square, until the player picks one or none. */
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
    const { board, drag, marks, drawing, focused, dragged, own, isTarget, down, moveTo, release, key, pressKey, promote, setCursor } = useBoardPointer({
        columns,
        ranks,
        pieces,
        player,
        selected,
        targets,
        promotion,
        onSelect,
        onMove,
        onRefuse,
        onPromote,
    });
    // A new position slides the pieces of its move there, but for the one the player dragged, and shakes a king in check.
    const before = useRef<string | undefined>(undefined);
    const motion = useMemo(() => {
        const was = before.current === undefined ? undefined : piecesOf(before.current);
        before.current = fen;
        // A move played on the position before slides there, a step back over one slides it home; a jump through the game moves every piece to its place.
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

    // The arrows on the board, the AI's and the coach's under the player's, none while the board is bare; the helps' step aside while the player picks up
    // a piece to move it (Stefano).
    const aiArrows = bare === true || selected !== undefined || drag !== undefined ? [] : drawn?.arrows ?? [];
    const ownArrows = bare === true ? [] : drawing === undefined ? marks.arrows : [...marks.arrows, drawing];
    // The bare board hides the helps' signs too, the corners on the pieces at risk and the pins' lines (Stefano).
    const signsOfHelps = bare === true ? undefined : helps;

    return (
        <>
            <div
                ref={board}
                class={["board", player === undefined ? "" : "playable", end === undefined ? "" : endClasses(end), control === undefined ? "" : "mapping", names ? "named" : ""].filter((name) => name !== "").join(" ")}
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
                        const tinted = bare === true ? undefined : drawn?.squares?.find((one) => one.square === square)?.colour;
                        const classes = [
                            "square",
                            dark ? "dark" : "light",
                            marked ? "last" : "",
                            mated === square ? "mated" : "",
                            sign?.classes ?? "",
                            selected === square ? "selected" : "",
                            tinted === undefined ? "" : `noted ${tinted}`,
                            bare !== true && marks.squares.includes(square) ? "marked" : "",
                            pointed?.includes(square) === true ? "pointed" : "",
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
                        const risk = signsOfHelps === undefined ? undefined : riskOn(signsOfHelps, square);
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
                                <span class="square-name" aria-hidden="true">{square}</span>
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
                                {control === undefined ? null : <span class={`control-ground ${controlOf(control[square as Square])}`} aria-hidden="true" />}
                                {piece === undefined ? null : <Piece key={moving ? fen : "still"} letter={piece} />}
                                {sign === undefined ? null : <Badge kind={sign.badge} />}
                                {risk === undefined ? null : <Notch tone={risk} />}
                                {control === undefined ? null : <ControlCount counts={control[square as Square]} />}
                                {badge === undefined || lastMove?.to !== square ? null : <BadgeIcon badge={badge.badge} title={badge.name} />}
                            </div>
                        );
                    })
                )}
                {/* Inside the board, under the corners of the pieces at risk */}
                {signsOfHelps === undefined || signsOfHelps.pins.length === 0 || control !== undefined ? null : <Pins pins={signsOfHelps.pins} at={centreOf} />}
            </div>
            <Arrows arrows={aiArrows} at={centreOf} occupied={(square) => pieces.has(square)} />
            <Arrows arrows={ownArrows} at={centreOf} />
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
 * what explains the move.
 */
export interface Notice
{
    readonly text: string;
    readonly square?: string;
    readonly piece?: string;
    readonly explanation?: Explanation;
}

/** A game over as the board shows it: how it ended, who won, the player's side, and whether it ended a moment ago, which plays its effects. */
export interface BoardEnd
{
    readonly how?: HowEnded;
    readonly winner?: Side;
    readonly player: Side;
    readonly fresh: boolean;
}

/** The board's classes at the end: how the game ended, and, a moment after it did, whether the player won or lost, which pick the effects in the style. */
function endClasses(end: BoardEnd): string
{
    const side = end.winner === undefined ? "" : end.winner === end.player ? "player-won" : "player-lost";
    const classes = ["ended", end.how === undefined ? "" : `by-${end.how.replaceAll(" ", "-")}`, end.fresh ? `fresh ${side}` : ""];
    return classes.filter((name) => name !== "").join(" ").trim();
}

// A board narrower than this, in pixels, is a phone's: its bubble takes the board's width, and goes under the board when it has no room on it.
const narrowBoard = 520;
