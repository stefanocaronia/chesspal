// What the guide's drawings are made of: cards, lines of text, a board and what sits on it, the Torretta, a face and the move badges, coloured by the theme
import type { ComponentChildren } from "preact";
import { useContext } from "preact/hooks";
import { ChosenSet, pieceSymbol } from "../../pieces/pieces.tsx";

/** Where a board's top-left corner is and how wide its squares are; a board that runs off the drawing is cut by it. */
export interface Grid
{
    x: number;
    y: number;
    cell: number;
}

/** A point of the drawing. */
export interface Point
{
    x: number;
    y: number;
}

/** The top-left corner of a square: `file` 0 to 7 from a, `rank` 1 to 8, White at the bottom. */
export function corner(grid: Grid, file: number, rank: number): Point
{
    return { x: grid.x + file * grid.cell, y: grid.y + (8 - rank) * grid.cell };
}

/** The centre of a square. */
export function centre(grid: Grid, file: number, rank: number): Point
{
    const { x, y } = corner(grid, file, rank);
    return { x: x + grid.cell / 2, y: y + grid.cell / 2 };
}

/** A card of the page, its corners as the page's. */
export function Card({ x, y, width, height, class: name = "paper" }: { x: number; y: number; width: number; height: number; class?: string; })
{
    return <rect class={name} x={x} y={y} width={width} height={height} rx="6" />;
}

/** A line of text, as a rounded bar: `strong` for a title or a name. */
export function Bar({ x, y, width, strong = false, class: name }: { x: number; y: number; width: number; strong?: boolean; class?: string; })
{
    return <rect class={name ?? (strong ? "bar strong" : "bar")} x={x} y={y} width={width} height="5" rx="2.5" />;
}

/** The board's squares, light and dark. */
export function Board({ grid, children }: { grid: Grid; children?: ComponentChildren; })
{
    return (
        <g>
            <rect class="light" x={grid.x} y={grid.y} width={grid.cell * 8} height={grid.cell * 8} />
            <path class="dark" d={darkSquares(grid)} />
            {children}
        </g>
    );
}

/** A square filled with one of the board's colours: the last move, a hint. */
export function Square({ grid, file, rank, class: name }: { grid: Grid; file: number; rank: number; class: string; })
{
    const { x, y } = corner(grid, file, rank);
    return <rect class={name} x={x} y={y} width={grid.cell} height={grid.cell} />;
}

/** A piece of the chosen set by its FEN letter, on a square of the board. */
export function PieceOn({ grid, file, rank, letter, class: name }: { grid: Grid; file: number; rank: number; letter: string; class?: string; })
{
    const { x, y } = corner(grid, file, rank);
    return <PieceAt x={x} y={y} size={grid.cell} letter={letter} class={name} />;
}

/** A piece of the chosen set anywhere in the drawing, `size` wide, coloured by the settings as the board's. */
export function PieceAt({ x, y, size, letter, class: name = "" }: { x: number; y: number; size: number; letter: string; class?: string; })
{
    const set = useContext(ChosenSet);
    const side = letter === letter.toUpperCase() ? "white" : "black";
    return <use href={pieceSymbol(letter, set)} x={x} y={y} width={size} height={size} class={`piece ${side} ${name}`} />;
}

/** The pieces of a position, one string a rank from the 8th down, "." for an empty square: "....k..." */
export function Pieces({ grid, ranks }: { grid: Grid; ranks: readonly string[]; })
{
    return (
        <g>
            {ranks.flatMap((row, index) => [...row].map((letter, file) => letter === "." ? null : <PieceOn key={`${file}${index}`} grid={grid} file={file} rank={8 - index} letter={letter} />))}
        </g>
    );
}

/** An arrow from one point to another, its shaft `width` wide, as the AI draws them on the board. */
export function Arrow({ from, to, width, class: name }: { from: Point; to: Point; width: number; class: string; })
{
    return <polygon class={name} points={arrowPoints(from, to, width)} />;
}

/** The Torretta with its neutral face, `size` wide, its top-left corner at x, y. */
export function Torretta({ x, y, size }: { x: number; y: number; size: number; })
{
    return (
        <g class="tower" transform={`translate(${x} ${y}) scale(${size / 128})`}>
            <path class="antenna" d="M64 31V19" />
            <circle class="light-bulb" cx="64" cy="16" r="5" />
            <rect class="shade" x="29" y="64" width="12" height="26" rx="2" />
            <rect class="shade" x="87" y="64" width="12" height="26" rx="2" />
            <path class="body" d="M34 30H47V40H57V30H71V40H81V30H94V54L89 58L92 106H36L39 58L34 54Z" />
            <rect class="shade" x="30" y="104" width="68" height="12" rx="4" />
            <rect class="screen" x="44" y="63" width="40" height="32" rx="7" />
            <circle class="features" cx="55" cy="76" r="4.6" />
            <circle class="features" cx="73" cy="76" r="4.6" />
            <rect class="features" x="58" y="85.4" width="12" height="3.2" rx="1.6" />
        </g>
    );
}

/** A person's head and shoulders in a disc of `tone`, a class of drawings.css; `ring` draws the accent around it. */
export function Face({ x, y, r, tone, ring = false }: { x: number; y: number; r: number; tone: string; ring?: boolean; })
{
    const side = r * 0.7;
    const low = y + r * 0.71;
    return (
        <g>
            {ring && <circle class="chosen" cx={x} cy={y} r={r + 3.5} />}
            <circle class={tone} cx={x} cy={y} r={r} />
            <circle class="person" cx={x} cy={y - r * 0.2} r={r * 0.34} />
            <path class="person" d={`M${x - side} ${low}Q${x - side} ${y + r * 0.22} ${x} ${y + r * 0.22}Q${x + side} ${y + r * 0.22} ${x + side} ${low}A${r} ${r} 0 0 1 ${x - side} ${low}Z`} />
        </g>
    );
}

/** A move's badge, a disc and its sign: best (a tick), mistake (?) or blunder (??). */
export function Badge({ x, y, r, kind }: { x: number; y: number; r: number; kind: "best" | "mistake" | "blunder"; })
{
    return (
        <g>
            <circle class={`judgement ${kind}`} cx={x} cy={y} r={r} />
            {kind === "best" && <path class="sign" style={{ strokeWidth: r * 0.28 }} d={`M${x - r * 0.45} ${y + r * 0.02}L${x - r * 0.12} ${y + r * 0.36}L${x + r * 0.45} ${y - r * 0.32}`} />}
            {kind === "mistake" && <Question x={x} y={y} size={r} />}
            {kind === "blunder" && (
                <>
                    <Question x={x - r * 0.36} y={y} size={r * 0.8} />
                    <Question x={x + r * 0.36} y={y} size={r * 0.8} />
                </>
            )}
        </g>
    );
}

/** A small clock face with its two hands. */
export function Clock({ x, y, r, class: name = "clock" }: { x: number; y: number; r: number; class?: string; })
{
    return (
        <g class={name}>
            <circle cx={x} cy={y} r={r} />
            <path d={`M${x} ${y - r * 0.6}V${y}L${x + r * 0.45} ${y + r * 0.3}`} />
        </g>
    );
}

/** A chevron pointing left or right, centred on x, y. */
export function Chevron({ x, y, size, left = false }: { x: number; y: number; size: number; left?: boolean; })
{
    const reach = left ? -size / 2 : size / 2;
    return <path d={`M${x - reach / 2} ${y - size / 2}L${x + reach / 2} ${y}L${x - reach / 2} ${y + size / 2}`} />;
}

/** A question mark on a grid of one, `size` wide, centred on x, y. */
function Question({ x, y, size }: { x: number; y: number; size: number; })
{
    return (
        <g class="sign" transform={`translate(${x} ${y}) scale(${size})`}>
            <path style={{ strokeWidth: 0.24 }} d="M-0.3 -0.22Q-0.3 -0.55 0 -0.55Q0.3 -0.55 0.3 -0.25Q0.3 -0.02 0 0.08V0.2" />
            <circle class="dot" cy="0.48" r="0.14" />
        </g>
    );
}

function darkSquares(grid: Grid): string
{
    const steps: string[] = [];

    for (let row = 0; row < 8; row++) {
        for (let column = 0; column < 8; column++) {
            if ((row + column) % 2 === 1) {
                steps.push(`M${grid.x + column * grid.cell} ${grid.y + row * grid.cell}h${grid.cell}v${grid.cell}h${-grid.cell}z`);
            }
        }
    }

    return steps.join("");
}

function arrowPoints(from: Point, to: Point, width: number): string
{
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const along = { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
    const across = { x: -along.y, y: along.x };
    const head = width * 2.2;
    const neck = { x: to.x - along.x * head, y: to.y - along.y * head };
    const at = (base: Point, side: number) => `${(base.x + across.x * side).toFixed(1)},${(base.y + across.y * side).toFixed(1)}`;
    return [at(from, width / 2), at(neck, width / 2), at(neck, width * 1.15), `${to.x},${to.y}`, at(neck, -width * 1.15), at(neck, -width / 2), at(from, -width / 2)].join(" ");
}
