// Looking back at a game: the moves with their judgements, the one shown on the board in gold, and the bar of steps to the start, back, on and to the end
import { Badge, Bar, Board, Card, Chevron, Pieces, Square } from "./parts.tsx";

const grid = { x: 16, y: 10, cell: 25 };

type Judgement = "best" | "mistake" | "blunder";

const position = ["r...r.k.", "pp...ppp", "..n.....", "...p....", "...P.B..", "..N..Q..", "PP...PPP", "R....RK."];

/** The board at a move judged a mistake, the Moves card and the steps under it. */
export function Analysis()
{
    return (
        <svg class="guide-art" viewBox="0 0 480 220" aria-hidden="true">
            <Board grid={grid}>
                <Square grid={grid} file={3} rank={1} class="last" />
                <Square grid={grid} file={5} rank={3} class="last" />
                <Pieces grid={grid} ranks={position} />
            </Board>
            <Badge x={163} y={138} r={6.5} kind="mistake" />

            <Card x={236} y={10} width={228} height={134} />
            <Bar x={248} y={20.5} width={48} strong />
            <rect class="quote" x="242" y="34" width="216" height="20" rx="4" />
            <Move y={34} white="best" />
            <Move y={58} black="mistake" />
            <rect class="quote" x="242" y="82" width="216" height="20" rx="4" />
            <Move y={82} white="blunder" black="best" />
            <rect class="last" x="258" y="108" width="66" height="16" rx="4" />
            <Move y={106} white="mistake" shown />

            <Card x={236} y={156} width={228} height={54} />
            <g class="accent-line">
                <path d="M259 177V189" />
                <Chevron x={268} y={183} size={12} left />
                <Chevron x={321.5} y={183} size={12} left />
                <Chevron x={378.5} y={183} size={12} />
                <Chevron x={432} y={183} size={12} />
                <path d="M441 177V189" />
            </g>
        </svg>
    );
}

/** A row of the moves: its number, White's move and Black's, each with its badge if it has one; `shown` when White's is the one on the board. */
function Move({ y, white, black, shown = false }: { y: number; white?: Judgement; black?: Judgement; shown?: boolean; })
{
    return (
        <g>
            <Bar x={246} y={y + 7.5} width={8} />
            <Bar x={264} y={y + 7.5} width={36} strong class={shown ? "bar on-last" : undefined} />
            {white !== undefined && <Badge x={312} y={y + 10} r={6} kind={white} />}
            <Bar x={350} y={y + 7.5} width={36} strong />
            {black !== undefined && <Badge x={398} y={y + 10} r={6} kind={black} />}
        </g>
    );
}
