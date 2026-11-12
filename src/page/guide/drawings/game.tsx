// Playing a move: a knight lifted from its square under the pointer, the dots of where it may go, the gold edge where it would land, and the player's clock running
import { Bar, Board, Card, centre, Clock, corner, Face, PieceAt, PieceOn, Pieces, Square, Torretta } from "./parts.tsx";

const grid = { x: 140, y: 10, cell: 25 };

const position = ["rnbqkbnr", "pppp.ppp", "........", "....p...", "....P...", "........", "PPPP.PPP", "RNBQKB.R"];

/** The board after 1.e4 e5 with White's knight in the air, the two players' cards on the left and the moves on the right. */
export function Game()
{
    const over = corner(grid, 5, 3);
    return (
        <svg class="guide-art" viewBox="0 0 480 220" aria-hidden="true">
            <Board grid={grid}>
                <Square grid={grid} file={4} rank={7} class="last" />
                <Square grid={grid} file={4} rank={5} class="last" />
                <Pieces grid={grid} ranks={position} />
                <PieceOn grid={grid} file={6} rank={1} letter="N" class="ghost" />
                <Dot file={4} rank={2} />
                <Dot file={7} rank={3} />
                <rect class="over" x={over.x + 1.25} y={over.y + 1.25} width={grid.cell - 2.5} height={grid.cell - 2.5} />
            </Board>
            <ellipse class="lift-shadow" cx={over.x + 13} cy={over.y + 20} rx="11" ry="3.5" />
            <PieceAt x={over.x - 3.5} y={over.y - 15} size={32} letter="N" />
            <path class="pointer" transform={`translate(${over.x + 17} ${over.y + 8})`} d="M0 0V13L3.5 10L6 15.5L8.2 14.5L5.8 9.3H10Z" />

            <Card x={16} y={10} width={112} height={48} />
            <Torretta x={18} y={14} size={32} />
            <Bar x={54} y={20} width={46} strong />
            <Bar x={54} y={30} width={30} />
            <rect class="quote" x="54" y="40" width="44" height="12" rx="6" />
            <Clock x={61} y={46} r={3.4} />
            <Bar x={68} y={43.5} width={24} />

            <Card x={16} y={162} width={112} height={48} />
            <Face x={34} y={180} r={12} tone="tone-player" />
            <Bar x={54} y={170} width={46} strong />
            <Bar x={54} y={180} width={30} />
            <rect class="accent" x="54" y="192" width="44" height="12" rx="6" />
            <Clock x={61} y={198} r={3.4} class="clock on-accent" />
            <Bar x={68} y={195.5} width={24} class="bar on-accent" />

            <Card x={352} y={10} width={112} height={44} />
            <Bar x={362} y={22} width={70} strong />
            <Bar x={362} y={34} width={52} />
            <Card x={352} y={150} width={112} height={60} />
            <Bar x={362} y={162} width={40} strong />
            <Bar x={362} y={184} width={8} />
            <Bar x={378} y={184} width={28} />
            <rect class="last" x="414" y="179" width="40" height="15" rx="4" />
            <Bar x={420} y={184} width={28} class="bar on-last" />
        </svg>
    );
}

/** The dot of a square the lifted piece may go to. */
function Dot({ file, rank }: { file: number; rank: number; })
{
    const { x, y } = centre(grid, file, rank);
    return <circle class="hint" cx={x} cy={y} r={grid.cell * 0.165} />;
}
