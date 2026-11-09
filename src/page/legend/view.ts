// The legend of the marks on the board (D-99): only those the board shows now, each with the squares that bear it.
import type { Badge, DrawColour, DrawnArrow, DrawnSquare } from "../../core/index.ts";
import type { BadgeKind, KingSign } from "../board/signs.ts";
import { type HelpsView, pinSquares, type TacticLine, type Tone } from "../helps/view.ts";

/** A line of the legend: a mark the board shows now, and the squares that bear it, which the pointer on the line lights. */
export type LegendRow =
    | { readonly kind: "badge"; readonly badge: Badge; readonly squares: readonly string[]; }
    | { readonly kind: "risk" | "pin" | "skewer"; readonly tone: Tone; readonly squares: readonly string[]; }
    | { readonly kind: "pinLine" | "skewerLine"; readonly squares: readonly string[]; }
    | { readonly kind: "drawn"; readonly colour: DrawColour; readonly arrow: boolean; readonly ring: boolean; readonly squares: readonly string[]; }
    | { readonly kind: "control"; readonly squares: readonly string[]; }
    | { readonly kind: "end"; readonly sign: BadgeKind; readonly squares: readonly string[]; };

/** What the board shows now: each part only when it is on the board. */
export interface BoardMarks
{
    /** The judgment of the move shown, on the square it went to. */
    readonly badge?: { readonly badge: Badge; readonly square: string; };
    readonly helps?: HelpsView;
    /** The arrows and squares the AI or the coach drew. */
    readonly drawn?: { readonly arrows?: readonly DrawnArrow[]; readonly squares?: readonly DrawnSquare[]; };
    /** The control map is on: the pins' and skewers' marks step aside for it. */
    readonly control?: boolean;
    /** The kings' signs at the end of the game. */
    readonly ends?: ReadonlyMap<string, KingSign>;
}

/** The legend's lines, in the order the eye meets the marks: the move's judgment, the helps' signs, the drawings, the map, the end. */
export function legendOf({ badge, helps, drawn, control = false, ends }: BoardMarks): LegendRow[]
{
    const rows: LegendRow[] = badge === undefined ? [] : [{ kind: "badge", badge: badge.badge, squares: [badge.square] }];
    return [...rows, ...helpsRows(helps, control), ...drawnRows(drawn), ...(control ? [{ kind: "control" as const, squares: [] }] : []), ...endRows(ends)];
}

// The helps' signs by kind, then by tone, the player's threats first, each lighting the pieces that bear it; the pins' and skewers' lines after them,
// lighting the whole line. Over the control map the board shows the corners alone.
function helpsRows(helps: HelpsView | undefined, control: boolean): LegendRow[]
{
    if (helps === undefined) {
        return [];
    }

    const kinds = control ? (["risk"] as const) : (["risk", "pin", "skewer"] as const);
    const signs = kinds.flatMap((kind) =>
        tones.flatMap((tone) => {
            const squares = helps.lines.filter((line) => line.kind === kind && line.tone === tone).flatMap(markedSquares);
            return squares.length === 0 ? [] : [{ kind, tone, squares }];
        })
    );
    const lines: LegendRow[] = control ? [] : [
        ...(helps.pins.length === 0 ? [] : [{ kind: "pinLine" as const, squares: helps.pins.flatMap(pinSquares) }]),
        ...(helps.skewers.length === 0 ? [] : [{ kind: "skewerLine" as const, squares: helps.skewers.flatMap(pinSquares) }]),
    ];
    return [...signs, ...lines];
}

// The pieces a line of the tactics marks on the board.
function markedSquares(line: TacticLine): readonly string[]
{
    switch (line.kind) {
        case "risk":
            return line.items.map((risk) => risk.piece.square);
        case "pin":
        case "skewer":
            return line.items.map((pin) => pin.piece.square);
        default:
            return [];
    }
}

// One line a colour, with an arrow, a ring or both as the board has them.
function drawnRows(drawn: BoardMarks["drawn"]): LegendRow[]
{
    return colours.flatMap((colour) => {
        const arrows = (drawn?.arrows ?? []).filter((arrow) => arrow.colour === colour);
        const rings = (drawn?.squares ?? []).filter((square) => square.colour === colour);
        const squares = [...arrows.flatMap((arrow) => [arrow.from, arrow.to]), ...rings.map((ring) => ring.square)];
        return squares.length === 0 ? [] : [{ kind: "drawn" as const, colour, arrow: arrows.length > 0, ring: rings.length > 0, squares }];
    });
}

function endRows(ends: BoardMarks["ends"]): LegendRow[]
{
    const signs = [...(ends ?? [])];
    return endSigns.flatMap((sign) => {
        const squares = signs.filter(([, each]) => each.badge === sign).map(([square]) => square);
        return squares.length === 0 ? [] : [{ kind: "end" as const, sign, squares }];
    });
}

const tones: readonly Tone[] = ["threat", "chance", "neutral"];
const colours: readonly DrawColour[] = ["green", "red", "yellow", "blue"];
const endSigns: readonly BadgeKind[] = ["crown", "mate", "flag", "half"];
