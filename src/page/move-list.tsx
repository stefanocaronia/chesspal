// The moves of the game beside the board, in pairs, with the pieces drawn as figures, the same in every language (D-50); the player looks back through them
// with a click on one or with the buttons under them (T-88).
import type { JSX } from "preact";
import { useEffect, useRef } from "preact/hooks";
import type { Step } from "./browse.ts";
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
    const rows = rowsOf(plies);
    const current = plies[shown - 1];

    useEffect(() => {
        list.current?.scrollTo({ top: list.current.scrollHeight });
    }, [plies.length]);

    // Only the list scrolls to the move shown: the page under the board stays where the player has it.
    useEffect(() => {
        const box = list.current?.getBoundingClientRect();
        const move = list.current?.querySelector(".current")?.getBoundingClientRect();

        if (box === undefined || move === undefined) {
            return;
        }

        list.current!.scrollTop += Math.min(0, move.top - box.top) + Math.max(0, move.bottom - box.bottom);
    }, [shown]);

    const move = (ply: Ply | undefined): JSX.Element => <Move ply={ply} current={ply !== undefined && ply === current} onShow={() => onShow(plies.indexOf(ply!) + 1)} />;

    return (
        <div ref={list} class="moves card" role="region" aria-label={text.moves}>
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

function Move({ ply, current, onShow }: { ply: Ply | undefined; current: boolean; onShow: () => void; })
{
    if (ply === undefined) {
        return <span>…</span>;
    }

    // A screen reader reads the move in SAN; the eye sees each piece's letter as its figure.
    return (
        <button type="button" class={current ? "ply current" : "ply"} aria-current={current ? "step" : undefined} onClick={onShow}>
            <span class="visually-hidden">{ply.san}</span>
            <span aria-hidden="true">{ply.san.split(/([KQRBN])/).map((part, index) => index % 2 === 1 ? <Figurine key={index} letter={part} side={ply.side} /> : part)}</span>
        </button>
    );
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
