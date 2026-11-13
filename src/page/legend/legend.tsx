// The legend of the marks on the board (D-99): a ? that opens the marks the board shows now, each drawn as the board draws it, with its name.
import type { ComponentChildren, RefObject } from "preact";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { DrawColour } from "../../core/index.ts";
import { Badge, Notch, Pushpin, Skewer } from "../board/marks.tsx";
import { BadgeIcon } from "../game/badges.tsx";
import type { Text } from "../text.ts";
import type { LegendRow } from "./view.ts";

/**
 * The ? beside the map's button, and the legend it opens: a click, the ? key, Esc or a click elsewhere closes it, and puts out the squares it lit; while
 * open it follows the board. The pointer on a line lights the squares that bear its mark, as a square in the AI's words. It stands over the whole page, in
 * the browser's top layer, so that no card clips it; under the board on a phone, `under` opens it below the board's row, never over the board.
 */
export function MarksLegend({ rows, open, onOpen, drawn, onPoint, under = false, text }: {
    rows: readonly LegendRow[];
    open: boolean;
    onOpen: (open: boolean) => void;
    /** What the drawings' colours mean, and who drew them, in their words. */
    drawn: { words: Readonly<Record<DrawColour, string>>; by: string; };
    onPoint: (squares: readonly string[]) => void;
    under?: boolean;
    text: Text;
})
{
    const button = useRef<HTMLButtonElement>(null);
    const section = useRef<HTMLElement>(null);
    const panel = useId();
    useClosing(open, () => onOpen(false));
    usePutOut(open, onPoint);
    const place = usePlace(button, open, under);
    const words = text.legend;
    const shown = open && place !== undefined;

    useLayoutEffect(() => {
        if (shown) {
            section.current?.showPopover();
        }
    }, [shown]);

    return (
        <span class="marks-legend">
            <button
                ref={button}
                type="button"
                class="hold-button legend-button"
                aria-expanded={open}
                aria-controls={shown ? panel : undefined}
                aria-label={words.title}
                title={words.hint}
                onClick={() => onOpen(!open)}
            >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                    <circle cx="8" cy="8" r="6.5" />
                    <path d="M6.1 6.3a1.95 1.95 0 1 1 2.7 1.8c-.5.2-.8.6-.8 1.1v.5M8 11.4v.1" />
                </svg>
            </button>
            {shown
                ? (
                    <section ref={section} id={panel} class="legend-panel" popover="manual" aria-label={words.title} style={place}>
                        <p class="legend-title">{words.title}</p>
                        {rows.length === 0 ? <p class="legend-none">{words.none}</p> : (
                            <ul>
                                {rows.map((row) => (
                                    <li
                                        key={keyOf(row)}
                                        onPointerEnter={() => onPoint(row.squares)}
                                        onPointerLeave={(event) => event.pointerType === "mouse" && onPoint([])}
                                    >
                                        <span class="legend-mark">
                                            <Mark row={row} />
                                        </span>
                                        <Name row={row} drawn={drawn} text={text} />
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                )
                : null}
        </span>
    );
}

/** A mark as the board draws it, on a square of the board's colour where the board draws it on one. */
function Mark({ row }: { row: LegendRow; })
{
    switch (row.kind) {
        case "badge":
            return <BadgeIcon badge={row.badge} />;
        case "risk":
            return (
                <Tile>
                    <Notch tone={row.tone} />
                </Tile>
            );
        case "pin":
            return (
                <Tile>
                    <Pushpin tone={row.tone} />
                </Tile>
            );
        case "skewer":
            return (
                <Tile>
                    <Skewer tone={row.tone} />
                </Tile>
            );
        case "pinLine":
        case "skewerLine":
            return (
                <Tile wide>
                    <svg class="helps-layer" viewBox="0 0 2 1">
                        <g class={row.kind === "pinLine" ? "pin" : "skewer"}>
                            <line class="halo" x1="0.2" y1="0.5" x2="1.8" y2="0.5" />
                            <line x1="0.2" y1="0.5" x2="1.8" y2="0.5" />
                        </g>
                    </svg>
                </Tile>
            );
        case "drawn":
            return (
                <Tile wide={row.arrow}>
                    {row.ring ? <span class={`legend-ring ${row.colour}`} /> : null}
                    {row.arrow
                        ? (
                            <svg class="arrows drawn" viewBox="0 0 2 1">
                                <path class="edge" d={arrowShaft} />
                                <polygon class="edge" points={arrowHead} />
                                <g class={row.colour}>
                                    <path d={arrowShaft} />
                                    <polygon points={arrowHead} />
                                </g>
                            </svg>
                        )
                        : null}
                </Tile>
            );
        case "control":
            return (
                <span class="control-count" aria-hidden="true">
                    <b class="white">2</b>
                    <b class="black">1</b>
                </span>
            );
        case "end":
            return <Badge kind={row.sign} />;
    }
}

function Name({ row, drawn, text }: { row: LegendRow; drawn: { words: Readonly<Record<DrawColour, string>>; by: string; }; text: Text; })
{
    const words = text.legend;

    switch (row.kind) {
        case "badge":
            return <Named name={text.badges[row.badge]} detail={words.badge} />;
        case "risk":
        case "pin":
        case "skewer":
            return <Named name={words.sign(row.kind, row.tone)} />;
        case "pinLine":
            return <Named name={words.pinLine} />;
        case "skewerLine":
            return <Named name={words.skewerLine} />;
        case "drawn":
            return <Named name={drawn.words[row.colour]} detail={drawn.by} />;
        case "control":
            return <Named name={words.control} />;
        case "end":
            return <Named name={words.ends[row.sign]} />;
    }
}

function Named({ name, detail }: { name: string; detail?: string; })
{
    return (
        <span class="legend-name">
            {name}
            {detail === undefined ? null : <small>{detail}</small>}
        </span>
    );
}

/** A square, or two side by side, of the board's dark colour, for the marks the board draws on its squares. */
function Tile({ wide = false, children }: { wide?: boolean; children?: ComponentChildren; })
{
    return <span class={`legend-tile${wide ? " wide" : ""}`} aria-hidden="true">{children}</span>;
}

/** Puts out the squares the legend lit when it closes, however it closes. */
function usePutOut(open: boolean, onPoint: (squares: readonly string[]) => void): void
{
    const wasOpen = useRef(open);

    useEffect(() => {
        if (wasOpen.current && !open) {
            onPoint([]);
        }

        wasOpen.current = open;
    }, [open]);
}

/**
 * Closes the legend at Esc and at a press outside it. The page has a legend in the card and one under the board for a phone, one of them hidden: a press on
 * either is no press outside.
 */
function useClosing(open: boolean, close: () => void): void
{
    useEffect(() => {
        if (!open) {
            return;
        }

        const key = (event: KeyboardEvent): void => {
            if (event.key === "Escape") {
                close();
            }
        };

        const press = (event: PointerEvent): void => {
            if (!(event.target instanceof Element && event.target.closest(".marks-legend") !== null)) {
                close();
            }
        };

        window.addEventListener("keydown", key);
        window.addEventListener("pointerdown", press);

        return () => {
            window.removeEventListener("keydown", key);
            window.removeEventListener("pointerdown", press);
        };
    }, [open]);
}

/**
 * Where the legend opens: under its button, or over it when the window has more room there, its right edge on the button's and no wider than the card it
 * sits in, so that it leaves the board in sight, inside the window; `under`, below the row under the board and as wide as it. None while the button is not
 * shown, as the one of the layout the window does not use. It follows the button as the window changes or scrolls, kept inside the window.
 */
function usePlace(button: RefObject<HTMLElement>, open: boolean, under: boolean): Place | undefined
{
    const [place, setPlace] = useState<Place | undefined>(undefined);

    useLayoutEffect(() => {
        if (!open) {
            setPlace(undefined);
            return;
        }

        const follow = (): void => {
            const shown = button.current !== null && button.current.getClientRects().length > 0;
            const box = (under ? button.current?.closest(".board-map") ?? button.current : button.current)?.getBoundingClientRect();
            const card = button.current?.closest(".card")?.getBoundingClientRect();

            if (!shown || box === undefined) {
                setPlace(undefined);
            } else {
                const { clientWidth: width, clientHeight: height } = document.documentElement;
                const below = height - box.bottom - panelGap - edge;
                const above = box.top - panelGap - edge;
                const across = under ? box.width : Math.min(panelWidth, box.right - (card?.left ?? box.right - panelWidth));
                const side = { right: `${Math.max(edge, width - box.right)}px`, width: `${Math.min(across, width - 2 * edge)}px` };
                setPlace(
                    under || below >= roomEnough || below >= above
                        ? { top: `${Math.max(edge, box.bottom + panelGap)}px`, ...side, maxHeight: `${under ? Math.max(roomLeast, below) : below}px` }
                        : { bottom: `${Math.max(edge, height - box.top + panelGap)}px`, ...side, maxHeight: `${above}px` },
                );
            }
        };

        follow();
        window.addEventListener("resize", follow);
        window.addEventListener("scroll", follow, true);

        return () => {
            window.removeEventListener("resize", follow);
            window.removeEventListener("scroll", follow, true);
        };
    }, [open, under]);

    return place;
}

type Place = { right: string; width: string; maxHeight: string; } & ({ top: string; } | { bottom: string; });

// How far the legend stands from its button, and from the window's edges; its width at most; the room under the button that is enough for it.
const panelGap = 6;
const edge = 16;
const panelWidth = 300;
const roomEnough = 320;
// The least room the legend takes under the board's row on a phone, never over the board: the page scrolls to the rest, and the legend follows.
const roomLeast = 120;

function keyOf(row: LegendRow): string
{
    switch (row.kind) {
        case "badge":
            return row.kind;
        case "risk":
        case "pin":
        case "skewer":
            return `${row.kind} ${row.tone}`;
        case "drawn":
            return `${row.kind} ${row.colour}`;
        case "end":
            return `${row.kind} ${row.sign}`;
        default:
            return row.kind;
    }
}

// An arrow across two squares, as the AI's: its shaft into its point, the point as long and wide as the board's.
const arrowShaft = "M0.3 0.5 L1.475 0.5";
const arrowHead = "1.4,0.71 1.7,0.5 1.4,0.29";
