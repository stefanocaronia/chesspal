// The moves of the game beside the board, in pairs, with the pieces drawn as figures, the same in every language (D-50); the player looks back through them
// with a click on one or with the buttons under them. In analysis a variation the player plays is one row under the move it leaves from (D-116).
import { type ComponentChildren, Fragment, type JSX } from "preact";
import { useEffect, useRef } from "preact/hooks";
import type { Side } from "../../core/index.ts";
import { Figurine } from "../pieces/pieces.tsx";
import type { Text } from "../text.ts";
import { BadgeIcon, NoteIcon } from "./badges.tsx";
import type { Step } from "./browse.ts";
import { FoldButton, useCardFold } from "./card-fold.tsx";
import type { Ply } from "./plies.ts";
import { type LinePly, lineText, moveNumberOf } from "./variation.ts";

/** A variation in analysis as the column shows it: its moves after the game's first `at`, the one the board shows (`cursor`, 0 when it shows the game). */
export interface LineView
{
    readonly plies: readonly LinePly[];
    readonly at: number;
    readonly cursor: number;
    /** Shows the line's move `cursor`, 1 for its first. */
    readonly onShow: (cursor: number) => void;
    readonly onClose: () => void;
    /** Takes the board back to the game, where the line leaves it. */
    readonly onBack: () => void;
    /** Asks the AI to analyse the line, as the player's words would; off while no chat hears the player. */
    readonly onAnalyse: () => void;
    readonly canAnalyse: boolean;
    /** Who analyses it, for the button's tooltip. */
    readonly analyst: string;
}

/**
 * The moves numbered in pairs, the one the board shows marked (`shown`, how many moves it shows), and the result once the game is over; a click on a move
 * shows it. The list keeps its last move in sight, and the one shown while the player looks back.
 */
export function MoveList({ plies, result, shown, line, onShow, tools, text }: {
    plies: readonly Ply[];
    result?: string;
    shown: number;
    /** The variation, faded while the board shows the game. */
    line?: LineView;
    onShow: (plies: number) => void;
    /** On the title's right: the legend of the marks on the board, when no helps' card holds it (D-99). */
    tools?: ComponentChildren;
    text: Text;
})
{
    const list = useRef<HTMLDivElement>(null);
    const [folded, toggleFold] = useCardFold("moves");
    const rows = rowsOf(plies);
    const onTheLine = line !== undefined && line.cursor > 0;
    const current = onTheLine ? undefined : plies[shown - 1];
    const fork = onTheLine ? plies[line.at - 1] : undefined;
    // The line goes under the row of the move it leaves from, before the first row when it leaves from the start.
    const lineAfter = line === undefined ? undefined : line.at === 0 ? -1 : rows.findIndex((row) => row.white === plies[line.at - 1] || row.black === plies[line.at - 1]);

    useEffect(() => {
        list.current?.scrollTo({ top: list.current.scrollHeight });
    }, [plies.length]);

    // Only the list scrolls to the move shown: the page under the board stays where the player has it.
    useEffect(() => keepInSight(list.current), [shown, line?.cursor, line?.plies.length]);

    // The cards above it change height with the position, the helps' card above all: the list follows, its move still in sight.
    useEffect(() => {
        const element = list.current;

        if (element === null) {
            return;
        }

        const observer = new ResizeObserver(() => keepInSight(element));
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    const move = (ply: Ply | undefined): JSX.Element => <Move ply={ply} current={ply !== undefined && ply === current} fork={ply !== undefined && ply === fork} onShow={() => onShow(plies.indexOf(ply!) + 1)} text={text} />;
    const lineRow = line === undefined ? null : <LineRow line={line} text={text} />;

    // The card's title with its icon, a score sheet, as the other cards of the column, which folds the card to it (Stefano); only the list under it
    // scrolls, and it stays in the page while folded, so that it keeps its move in sight.
    return (
        <section class={`card moves-card${folded ? " folded" : ""}`} aria-label={text.moves}>
            <div class="moves-head">
                <h3 class="card-title">
                    <FoldButton folded={folded} onFold={toggleFold} text={text}>
                        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M6 3H15L19 7V21H6ZM15 3V7H19M9 11H16M9 14.5H16M9 18H13" />
                        </svg>
                        {text.moves}
                    </FoldButton>
                </h3>
                {tools}
            </div>
            <div ref={list} class="moves" hidden={folded}>
                <ol>
                    {lineAfter === -1 ? lineRow : null}
                    {rows.map(({ number, white, black }, index) => (
                        <Fragment key={number}>
                            <li>
                                <span class="number">{number}.</span>
                                {move(white)}
                                {move(black)}
                            </li>
                            {index === lineAfter ? lineRow : null}
                        </Fragment>
                    ))}
                </ol>
                {result === undefined ? null : <p class="result">{result}</p>}
            </div>
        </section>
    );
}

/**
 * The buttons that step through the moves: to the start, back, forward, and to the game as it is; each one off where it could not go. On a variation,
 * back and forward step through it, and the fork with the move it leaves from takes the board back to the game. In analysis, last, the + that replays the
 * position shown as a new game, off on a position already over.
 */
export function Steps({ shown, total, line, fork, replay, onStep, text }: {
    shown: number;
    total: number;
    line?: LineView;
    /** The game's move the variation leaves from, none from the start. */
    fork?: Ply;
    replay?: Replay | undefined;
    onStep: (step: Step) => void;
    text: Text;
})
{
    const onTheLine = line !== undefined && line.cursor > 0;

    const button = (step: Step, path: string, off: boolean): JSX.Element => (
        <button type="button" title={text.steps[step]} aria-label={text.steps[step]} disabled={off} onClick={() => onStep(step)}>
            <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d={path} />
            </svg>
        </button>
    );

    return (
        <nav class="steps card" aria-label={text.moves}>
            {button("first", "M7 6V18M17 6L11 12L17 18", !onTheLine && shown === 0)}
            {button("back", "M14.5 6L8.5 12L14.5 18", !onTheLine && shown === 0)}
            {button("forward", "M9.5 6L15.5 12L9.5 18", onTheLine ? line.cursor === line.plies.length : shown === total)}
            {button("last", "M17 6V18M7 6L13 12L7 18", !onTheLine && shown === total)}
            {onTheLine ? <ForkButton fork={fork} onBack={line.onBack} text={text} /> : null}
            {replay === undefined ? null : (
                <button type="button" class="replay" title={text.replayHint} aria-label={text.replay} disabled={replay.off} onClick={replay.onReplay}>
                    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 5V19M5 12H19" />
                    </svg>
                </button>
            )}
        </nav>
    );
}

/** The new game from the position shown in analysis, beside the steps; off where that position is already over. */
export interface Replay
{
    readonly off: boolean;
    readonly onReplay: () => void;
}

/** The variation for the steps, with the game's move it leaves from. */
export function stepsLine(line: LineView | undefined, plies: readonly Ply[]): { line?: LineView; fork?: Ply; }
{
    const fork = line === undefined ? undefined : plies[line.at - 1];
    return line === undefined ? {} : fork === undefined ? { line } : { line, fork };
}

/** A move in SAN with each piece's letter drawn as its figure, the same in every language (D-50), and a capture's x in grey, so the squares stand out. */
export function Figurines({ san, side, mono = false }: { san: string; side: Side; mono?: boolean; })
{
    return (
        <>
            {san.split(/([KQRBNx])/).map((part, index) => index % 2 === 0 ? part : part === "x" ? <span key={index} class="takes">x</span> : <Figurine key={index} letter={part} side={side} mono={mono} />)}
        </>
    );
}

function Move({ ply, current, fork, onShow, text }: { ply: Ply | undefined; current: boolean; fork: boolean; onShow: () => void; text: Text; })
{
    if (ply === undefined) {
        return <span>…</span>;
    }

    // A screen reader reads the move in SAN and the AI's badge by its name; the eye sees each piece's letter as its figure, and the badge's disc (D-69).
    return (
        <button
            type="button"
            class={current ? "ply current" : fork ? "ply fork" : "ply"}
            aria-current={current ? "step" : undefined}
            onClick={onShow}
        >
            <span class="visually-hidden">{ply.review?.badge === undefined ? ply.san : `${ply.san}, ${text.badges[ply.review.badge]}`}</span>
            <span aria-hidden="true">
                <Figurines san={ply.san} side={ply.side} />
            </span>
            {ply.review?.badge !== undefined ? <BadgeIcon badge={ply.review.badge} /> : ply.review?.note !== undefined ? <NoteIcon /> : null}
        </button>
    );
}

/**
 * The variation's row: its moves numbered as a PGN writes them, the one shown in the gold of the moves, the button that asks the AI to analyse it, and a
 * cross that closes it; faded while the board shows the game, its moves still a click away.
 */
function LineRow({ line, text }: { line: LineView; text: Text; })
{
    return (
        <li class={line.cursor > 0 ? "line" : "line faded"} aria-label={`${text.variation.line}: ${lineText(line.plies)}`}>
            <span class="line-moves">
                {line.plies.map((ply, index) => {
                    const current = index + 1 === line.cursor;
                    const number = moveNumberOf(ply, index === 0);

                    return (
                        <button key={index} type="button" class={current ? "ply current" : "ply"} aria-current={current ? "step" : undefined} onClick={() => line.onShow(index + 1)}>
                            <span class="visually-hidden">{number}{ply.san}</span>
                            <span aria-hidden="true">
                                {number === "" ? null : <span class="line-number">{number.replace("...", "…")}</span>}
                                <Figurines san={ply.san} side={ply.side} />
                            </span>
                        </button>
                    );
                })}
            </span>
            <button
                type="button"
                class="analyse-line"
                title={line.canAnalyse ? text.variation.analyseHint(line.analyst) : text.asleepInAnalysis(line.analyst)}
                disabled={!line.canAnalyse}
                onClick={line.onAnalyse}
            >
                {text.variation.analyse}
            </button>
            <button type="button" class="close-line" title={text.variation.close} aria-label={text.variation.close} onClick={line.onClose}>
                <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M7 7L17 17M17 7L7 17" />
                </svg>
            </button>
        </li>
    );
}

/** The fork with the game's move the variation leaves from: it takes the board back to the game there. */
function ForkButton({ fork, onBack, text }: { fork: Ply | undefined; onBack: () => void; text: Text; })
{
    const move = fork === undefined ? undefined : `${fork.number}${fork.side === "white" ? "." : "..."}${fork.san}`;

    return (
        <button type="button" class="fork-back" title={text.variation.back(move)} aria-label={text.variation.back(move)} onClick={onBack}>
            <ForkIcon />
            {fork === undefined ? null : (
                <span aria-hidden="true">
                    {fork.number}
                    {fork.side === "white" ? "." : "…"}
                    <Figurines san={fork.san} side={fork.side} />
                </span>
            )}
        </button>
    );
}

/** The sign of a variation: a line that forks from the game's. */
export function ForkIcon()
{
    return (
        <svg class="icon fork-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 4V20M7 12C7 8 17 9 17 4M17 4L14 6.5M17 4L19.5 7" />
        </svg>
    );
}

/** Scrolls the list, and only the list, as little as it takes to show the whole row of its current move, and the result under the last one. */
function keepInSight(list: HTMLDivElement | null): void
{
    const row = list?.querySelector(".current")?.closest("li");

    if (list === null || !row) {
        return;
    }

    const box = list.getBoundingClientRect();
    const top = row.getBoundingClientRect().top;
    const bottom = (row.nextElementSibling === null ? list.lastElementChild ?? row : row).getBoundingClientRect().bottom;
    list.scrollTop += Math.min(0, top - box.top) + Math.max(0, bottom - box.bottom);
}

/** The plies in rows of one number: White's move and Black's. */
function rowsOf(plies: readonly Ply[]): { number: number; white?: Ply; black?: Ply; }[]
{
    const rows: { number: number; white?: Ply; black?: Ply; }[] = [];

    for (const ply of plies) {
        let row = rows.at(-1);

        if (row?.number !== ply.number) {
            row = { number: ply.number };
            rows.push(row);
        }

        row[ply.side] = ply;
    }

    return rows;
}
