// The moves of the game beside the board, in pairs, with the pieces drawn as figures, the same in every language (D-50).
import { useEffect, useRef } from "preact/hooks";
import { Figurine } from "./pieces.tsx";
import type { Ply } from "./plies.ts";
import type { Text } from "./text.ts";

/** The moves numbered in pairs, the last one marked, and the result once the game is over; the list keeps its last move in sight. */
export function MoveList({ plies, result, text }: { plies: readonly Ply[]; result?: string; text: Text; })
{
    const list = useRef<HTMLDivElement>(null);
    const rows = rowsOf(plies);

    useEffect(() => {
        list.current?.scrollTo({ top: list.current.scrollHeight });
    }, [plies.length]);

    return (
        <div ref={list} class="moves card" role="region" aria-label={text.moves}>
            <ol>
                {rows.map(({ number, white, black }) => (
                    <li key={number}>
                        <span class="number">{number}.</span>
                        <Move ply={white} last={plies.at(-1)} />
                        <Move ply={black} last={plies.at(-1)} />
                    </li>
                ))}
            </ol>
            {result === undefined ? null : <p class="result">{result}</p>}
        </div>
    );
}

function Move({ ply, last }: { ply: Ply | undefined; last: Ply | undefined; })
{
    if (ply === undefined) {
        return <span>…</span>;
    }

    // A screen reader reads the move in SAN; the eye sees each piece's letter as its figure.
    return (
        <span class={ply === last ? "last" : undefined} aria-current={ply === last ? "true" : undefined}>
            <span class="visually-hidden">{ply.san}</span>
            <span aria-hidden="true">{ply.san.split(/([KQRBN])/).map((part, index) => index % 2 === 1 ? <Figurine key={index} letter={part} /> : part)}</span>
        </span>
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
