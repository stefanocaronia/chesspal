// The moves of the game beside the board, in pairs, with the pieces drawn as figures, the same in every language (D-50); the player looks back through them
// with a click on one or with the buttons under them (T-88).
import type { JSX } from "preact";
import { useEffect, useRef } from "preact/hooks";
import type { Side } from "../core/index.ts";
import { BadgeIcon, NoteIcon } from "./badges.tsx";
import type { Step } from "./browse.ts";
import { FoldButton, useCardFold } from "./card-fold.tsx";
import { Figurine } from "./pieces.tsx";
import type { Ply } from "./plies.ts";
import type { Text } from "./text.ts";

/**
 * The moves numbered in pairs, the one the board shows marked (`shown`, how many moves it shows), and the result once the game is over; a click on a move
 * shows it. The list keeps its last move in sight, and the one shown while the player looks back.
 */
export function MoveList({ plies, result, shown, onShow, text }: { plies: readonly Ply[]; result?: string; shown: number; onShow: (plies: number) => void; text: Text; })
{
    const list = useRef<HTMLDivElement>(null);
    const [folded, toggleFold] = useCardFold("moves");
    const rows = rowsOf(plies);
    const current = plies[shown - 1];

    useEffect(() => {
        list.current?.scrollTo({ top: list.current.scrollHeight });
    }, [plies.length]);

    // Only the list scrolls to the move shown: the page under the board stays where the player has it.
    useEffect(() => keepInSight(list.current), [shown]);

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

    const move = (ply: Ply | undefined): JSX.Element => <Move ply={ply} current={ply !== undefined && ply === current} onShow={() => onShow(plies.indexOf(ply!) + 1)} text={text} />;

    // The card's title with its icon, a score sheet, as the other cards of the column, which folds the card to it (Stefano); only the list under it
    // scrolls, and it stays in the page while folded, so that it keeps its move in sight.
    return (
        <section class={`card moves-card${folded ? " folded" : ""}`} aria-label={text.moves}>
            <h3 class="card-title">
                <FoldButton folded={folded} onFold={toggleFold} text={text}>
                    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M6 3H15L19 7V21H6ZM15 3V7H19M9 11H16M9 14.5H16M9 18H13" />
                    </svg>
                    {text.moves}
                </FoldButton>
            </h3>
            <div ref={list} class="moves" hidden={folded}>
                <ol>
                    {rows.map(({ number, white, black }) => (
                        <li key={number}>
                            <span class="number">{number}.</span>
                            {move(white)}
                            {move(black)}
                        </li>
                    ))}
                </ol>
                {result === undefined ? null : <p class="result">{result}</p>}
            </div>
        </section>
    );
}

/** The buttons that step through the moves: to the start, back, forward, and to the game as it is; each one off where it could not go. */
export function Steps({ shown, total, onStep, text }: { shown: number; total: number; onStep: (step: Step) => void; text: Text; })
{
    const button = (step: Step, path: string, off: boolean): JSX.Element => (
        <button type="button" title={text.steps[step]} aria-label={text.steps[step]} disabled={off} onClick={() => onStep(step)}>
            <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d={path} />
            </svg>
        </button>
    );

    return (
        <nav class="steps card" aria-label={text.moves}>
            {button("first", "M7 6V18M17 6L11 12L17 18", shown === 0)}
            {button("back", "M14.5 6L8.5 12L14.5 18", shown === 0)}
            {button("forward", "M9.5 6L15.5 12L9.5 18", shown === total)}
            {button("last", "M17 6V18M7 6L13 12L7 18", shown === total)}
        </nav>
    );
}

function Move({ ply, current, onShow, text }: { ply: Ply | undefined; current: boolean; onShow: () => void; text: Text; })
{
    if (ply === undefined) {
        return <span>…</span>;
    }

    // A screen reader reads the move in SAN and the AI's badge by its name; the eye sees each piece's letter as its figure, and the badge's disc (D-69).
    return (
        <button
            type="button"
            class={current ? "ply current" : "ply"}
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

/** A move in SAN with each piece's letter drawn as its figure, the same in every language (D-50), and a capture's x in grey, so the squares stand out. */
export function Figurines({ san, side }: { san: string; side: Side; })
{
    return (
        <>
            {san.split(/([KQRBNx])/).map((part, index) => index % 2 === 0 ? part : part === "x" ? <span key={index} class="takes">x</span> : <Figurine key={index} letter={part} side={side} />)}
        </>
    );
}

/** Scrolls the list, and only the list, as little as it takes to show its current move. */
function keepInSight(list: HTMLDivElement | null): void
{
    const box = list?.getBoundingClientRect();
    const move = list?.querySelector(".current")?.getBoundingClientRect();

    if (box === undefined || move === undefined) {
        return;
    }

    list!.scrollTop += Math.min(0, move.top - box.top) + Math.max(0, move.bottom - box.bottom);
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
