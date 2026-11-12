// Talking to the AI: under its name, the player's question, its answer, and the box where the player writes, beside the board
import { Bar, Board, Card, Chevron, Pieces, Torretta } from "./parts.tsx";

const grid = { x: 256, y: 10, cell: 30 };

const position = [".....rk.", ".....ppp", "..n.....", "....p...", "..B.P...", ".....N..", ".....PPP", "......K."];

/** The AI's card, the talk under it and the box with its send button, the board cut by the drawing's edge. */
export function Talk()
{
    return (
        <svg class="guide-art" viewBox="0 0 480 220" aria-hidden="true">
            <Board grid={grid}>
                <Pieces grid={grid} ranks={position} />
            </Board>

            <Card x={16} y={10} width={220} height={46} />
            <Torretta x={18} y={13} size={36} bust />
            <Bar x={58} y={24} width={56} strong />
            <Bar x={58} y={35} width={34} />

            <Card x={86} y={66} width={150} height={24} />
            <Bar x={96} y={75.5} width={110} strong />
            <Card x={16} y={100} width={200} height={42} class="words" />
            <Bar x={26} y={111} width={170} class="bar on-words" />
            <Bar x={26} y={123} width={120} class="bar on-words" />

            <Card x={16} y={154} width={220} height={56} class="paper focused" />
            <Bar x={28} y={168} width={104} />
            <rect class="caret" x="136" y="163" width="2" height="15" rx="1" />
            <rect class="accent" x="176" y="187" width="50" height="16" rx="8" />
            <Bar x={186} y={192.5} width={18} class="bar on-accent" />
            <g class="on-accent-line">
                <Chevron x={213} y={195} size={7} />
            </g>
        </svg>
    );
}
