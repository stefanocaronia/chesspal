// How Chesspal works: the board's page and the AI's chat, two windows tied by a thread, the call through which the AI plays
import { Bar, Board, Card, Chevron, Face, Pieces, Square, Torretta } from "./parts.tsx";

const grid = { x: 26, y: 42, cell: 19 };

const position = [".....rk.", ".....ppp", "..n.....", "....p...", "....P...", ".....N..", ".....PPP", ".....RK."];

/** The page with its board and the Torretta, the chat beside it, and the thread between them. */
export function HowItWorks()
{
    return (
        <svg class="guide-art" viewBox="0 0 480 220" aria-hidden="true">
            <Window x={16} width={212} />
            <Board grid={grid}>
                <Square grid={grid} file={1} rank={8} class="last" />
                <Square grid={grid} file={2} rank={6} class="last" />
                <Pieces grid={grid} ranks={position} />
            </Board>
            <Torretta x={186} y={40} size={32} />
            <Bar x={190} y={78} width={26} strong />
            <Bar x={190} y={88} width={18} />
            <Face x={203} y={182} r={11} tone="tone-player" />

            <Window x={278} width={186} />
            <Card x={288} y={40} width={166} height={24} class="quote" />
            <Bar x={296} y={49} width={100} strong />
            <circle class="bullet" cx="293" cy="78" r="2.5" />
            <Bar x={300} y={75} width={130} />
            <Bar x={300} y={86} width={96} />
            <Card x={288} y={102} width={166} height={26} class="call" />
            <rect class="light" x="296" y="109" width="12" height="12" />
            <rect class="dark" x="296" y="109" width="6" height="6" />
            <rect class="dark" x="302" y="115" width="6" height="6" />
            <rect class="call-square" x="296" y="109" width="12" height="12" />
            <Bar x={316} y={112} width={74} strong />
            <circle class="bullet" cx="293" cy="146" r="2.5" />
            <Bar x={300} y={143} width={120} />
            <Bar x={300} y={154} width={80} />
            <rect class="field" x="288" y="170" width="166" height="24" rx="5" />
            <g class="accent-line">
                <Chevron x={299} y={182} size={8} />
            </g>
            <rect class="caret" x="309" y="176" width="2" height="12" rx="1" />

            <path class="thread" d="M228 108C258 108 258 115 288 115" />
            <circle class="knot" cx="228" cy="108" r="4" />
            <circle class="knot" cx="288" cy="115" r="4" />
        </svg>
    );
}

/** A window with its title bar and three dots, as tall as the drawing leaves. */
function Window({ x, width }: { x: number; width: number; })
{
    return (
        <g>
            <Card x={x} y={16} width={width} height={188} />
            <path class="rule" d={`M${x} 32H${x + width}`} />
            <circle class="bullet" cx={x + 11} cy="24" r="2.5" />
            <circle class="bullet" cx={x + 20} cy="24" r="2.5" />
            <circle class="bullet" cx={x + 29} cy="24" r="2.5" />
        </g>
    );
}
