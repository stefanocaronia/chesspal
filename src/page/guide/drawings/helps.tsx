// The helps: on the board an arrow the AI draws, a badge on a move, the pin and the corner of a piece in danger; beside it the Helps card and its rows
import type { ComponentChildren } from "preact";
import { Arrow, Badge, Bar, Board, Card, centre, Pieces, Square } from "./parts.tsx";

const grid = { x: 16, y: 10, cell: 25 };

const position = ["...qk...", ".....ppp", "p.n.....", ".B..p...", "....P...", "..N..N..", ".....PPP", ".....RK."];

/** The board with its marks, and the Helps card open on its first tab. */
export function Helps()
{
    const bishop = centre(grid, 1, 5);
    return (
        <svg class="guide-art" viewBox="0 0 480 220" aria-hidden="true">
            <Board grid={grid}>
                <Square grid={grid} file={0} rank={7} class="last" />
                <Square grid={grid} file={0} rank={6} class="last" />
                <Pieces grid={grid} ranks={position} />
            </Board>
            <path class="help-halo" d={`M${bishop.x} ${bishop.y}L116 35`} />
            <path class="help-line" d={`M${bishop.x} ${bishop.y}L116 35`} />
            <path class="danger" d="M41 110V97L54 110Z" />
            <circle class="danger-dot" cx="44.5" cy="106" r="1.7" />
            <Arrow from={centre(grid, 5, 3)} to={centre(grid, 4, 5)} width={5} class="drawn green" />
            <Badge x={38} y={63} r={6.5} kind="best" />

            <Card x={236} y={36} width={228} height={148} />
            <circle class="accent-line" cx="252" cy="55" r="5.5" />
            <circle class="accent" cx="252" cy="55" r="2" />
            <Bar x={264} y={52.5} width={44} class="bar accent" />
            <rect class="button" x="420" y="48" width="14" height="14" rx="3" />
            <rect class="button" x="440" y="48" width="14" height="14" rx="3" />
            <Bar x={250} y={70} width={34} strong />
            <Bar x={298} y={70} width={40} />
            <path class="rule" d="M246 85.5H454" />
            <rect class="accent" x="246" y="82" width="42" height="2.5" rx="1" />

            <Row y={96} width={96}>
                <path class="danger" d="M252 112V100L264 112Z" />
            </Row>
            <Row y={124} width={88}>
                <path class="danger-line" d="M253 141L259 135" />
                <circle class="danger" cx="260.5" cy="133.5" r="3.5" />
            </Row>
            <rect class="quote" x="246" y="152" width="208" height="22" rx="4" />
            <circle class="soft-line" cx="257" cy="163" r="4.5" />
            <Bar x={272} y={160.5} width={112} />
            <Bar x={418} y={160.5} width={8} strong />
            <Bar x={434} y={160.5} width={8} strong />
        </svg>
    );
}

/** A row of the card about the player's pieces in trouble: a red tint and edge, its sign, a line and a count. */
function Row({ y, width, children }: { y: number; width: number; children: ComponentChildren; })
{
    return (
        <g>
            <rect class="danger-row" x="246" y={y} width="208" height="22" rx="4" />
            <rect class="danger" x="246" y={y} width="3" height="22" />
            {children}
            <Bar x={272} y={y + 8.5} width={width} strong />
            <Bar x={434} y={y + 8.5} width={8} strong />
        </g>
    );
}
