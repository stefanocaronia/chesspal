// The helps on the page (D-78, Zoe's sketch B): the board says where, the card says what, the facts the AI sees at the game's level and only those; and
// the coach's words (D-88).
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { BadgeIcon, NoteIcon } from "../game/badges.tsx";
import { FoldButton, useCardFold } from "../game/card-fold.tsx";
import { Figurines } from "../game/move-list.tsx";
import type { CoachHint, Ply } from "../game/plies.ts";
import { Legend, Marked } from "../talk/talk.tsx";
import type { Text } from "../text.ts";
import { RowIcon } from "./rows.tsx";
import { Strategy } from "./strategy.tsx";
import { Tactics } from "./tactics.tsx";
import type { HelpsView } from "./view.ts";

/**
 * The helps' card, between the opening and the moves: the coach's words, then the tactics in lines, the strategy in rows and the control map, seen while
 * its button or M is held, and the board without its drawings while their button is. A line under the pointer lights its squares on the board. Its title
 * folds it to the title and opens it again (Stefano).
 */
export function HelpsCard({ helps, judged, hint, hintOpen, onHint, onPoint, onMap, mapping, onBare, bare, legend, text }: {
    helps: HelpsView;
    /** The player's moves as the coach judged them: the last the AI has answered, and one a held note let go only now (D-88). */
    judged: readonly Ply[];
    /** The coach's hint for the player's turn, folded until they open it (Anatolij). */
    hint?: CoachHint | undefined;
    hintOpen: boolean;
    onHint: (open: boolean) => void;
    onPoint: (squares: readonly string[]) => void;
    onMap: (held: boolean) => void;
    mapping: boolean;
    onBare: (held: boolean) => void;
    bare: boolean;
    /** The legend of the marks on the board, after the map's buttons (D-99). */
    legend: ComponentChildren;
    text: Text;
})
{
    const [tab, setTab] = useState<"tactics" | "strategy">("tactics");
    // The tactics' lines the player opened stay open from move to move, so that a pin is followed as the game goes on.
    const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
    const openLine = (key: string, open: boolean): void => setOpened((lines) => new Set(open ? [...lines, key] : [...lines].filter((line) => line !== key)));
    const [folded, toggleFold] = useCardFold("helps");
    const words = text.helpsCard;

    // The hint closes with the card, so that its drawings never stay on the board without its words (Zoe).
    const fold = (): void => {
        if (!folded) {
            onHint(false);
        }

        toggleFold();
    };

    return (
        <section class={`card helps-card${folded ? " folded" : ""}`} aria-label={words.title}>
            <div class="helps-head">
                <h3 class="card-title">
                    <FoldButton folded={folded} onFold={fold} text={text}>
                        <HelpsIcon />
                        {words.title}
                    </FoldButton>
                </h3>
                <span class="helps-tools">
                    <MapButton mapping={mapping} onMap={onMap} text={text} />
                    <BareButton bare={bare} onBare={onBare} text={text} />
                    {legend}
                </span>
            </div>
            {folded ? null : (
                <>
                    {judged.length === 0 && hint === undefined ? null : (
                        <section class={`coach${judged.length === 0 ? " hint-only" : ""}`} aria-label={words.coach}>
                            {judged.map((ply) => <Judged key={`${ply.number} ${ply.side}`} ply={ply} text={text} />)}
                            {hint === undefined ? null : <HintLine hint={hint} open={hintOpen} onOpen={onHint} text={text} />}
                        </section>
                    )}
                    <div class="tabs" role="tablist">
                        <button type="button" role="tab" aria-selected={tab === "tactics"} onClick={() => setTab("tactics")}>{words.tactics}</button>
                        <button type="button" role="tab" aria-selected={tab === "strategy"} onClick={() => setTab("strategy")}>{words.strategy}</button>
                    </div>
                    {tab === "tactics"
                        ? <Tactics helps={helps} opened={opened} onOpen={openLine} onPoint={onPoint} text={text} />
                        : <Strategy helps={helps} onPoint={onPoint} text={text} />}
                </>
            )}
        </section>
    );
}

/** The map's button (D-78), held to see the map: an icon, its tooltip saying how (Stefano); in the card's title, and on a phone under the board. */
export function MapButton({ mapping, onMap, text }: { mapping: boolean; onMap: (on: boolean) => void; text: Text; })
{
    return (
        <HoldButton on={mapping} onHold={onMap} title={text.helpsCard.mapHint} label={text.helpsCard.map}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M2 2h5v5H2zM9 9h5v5H9z" />
                <path d="M9 2h5v5H9zM2 9h5v5H2z" opacity=".35" />
            </svg>
        </HoldButton>
    );
}

/**
 * The button held to see the board bare, without the arrows and the squares the AI, the coach and the player drew on it, nor the helps' signs (Stefano): an eye shut.
 */
export function BareButton({ bare, onBare, text }: { bare: boolean; onBare: (on: boolean) => void; text: Text; })
{
    return (
        <HoldButton on={bare} onHold={onBare} title={text.helpsCard.bareHint} label={text.helpsCard.bare} kind="bare-button">
            <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" />
                <circle cx="8" cy="8" r="2" />
                <path d="M2.5 2.5l11 11" />
            </svg>
        </HoldButton>
    );
}

/**
 * The coach's hint, a line that opens on its words and the legend of what it draws (D-88): in the helps' card a tinted row behind a bulb, as the tactics',
 * and on a phone under the board, beside the map, where its drawings are in sight (Zoe).
 */
export function HintLine({ hint, open, onOpen, text }: { hint: CoachHint; open: boolean; onOpen: (open: boolean) => void; text: Text; })
{
    const words = text.helpsCard;

    return (
        <details class="coach-hint" open={open} onToggle={(event) => onOpen(event.currentTarget.open)}>
            <summary>
                <RowIcon>
                    <path d="M5.5 10.5C4.3 9.7 3.5 8.4 3.5 7a4.5 4.5 0 0 1 9 0c0 1.4-.8 2.7-2 3.5V12h-5Z" />
                    <path d="M6.5 14.2h3" />
                </RowIcon>
                {open ? words.hideHint : words.showHint}
            </summary>
            <span class="note">
                <Marked text={hint.text} />
            </span>
            {hint.arrows === undefined && hint.squares === undefined ? null : <Legend review={hint} words={words.drawn} />}
        </details>
    );
}

/** An icon the mouse holds, while what it shows lasts; a finger, or the keyboard, turns it on and off (D-78). */
function HoldButton({ on, onHold, title, label, kind, children }: {
    on: boolean;
    onHold: (on: boolean) => void;
    title: string;
    label: string;
    kind?: string;
    children: ComponentChildren;
})
{
    // A click carries its pointer's type: none from the keyboard.
    const mouse = (event: Event): boolean => event instanceof PointerEvent && event.pointerType === "mouse";

    return (
        <button
            type="button"
            class={kind === undefined ? "hold-button" : `hold-button ${kind}`}
            aria-pressed={on}
            aria-label={label}
            title={title}
            onPointerDown={(event) => mouse(event) && onHold(true)}
            onPointerUp={(event) => mouse(event) && onHold(false)}
            onPointerLeave={(event) => mouse(event) && onHold(false)}
            onClick={(event) => !mouse(event) && onHold(!on)}
        >
            {children}
        </button>
    );
}

/** The coach's judgment of the player's move: its badge and the move in a row tinted in the badge's colour, which opens on its note (D-78, D-88). */
function Judged({ ply, text }: { ply: Ply; text: Text; })
{
    const { badge, note } = ply.review ?? {};
    const head = (
        <>
            {badge === undefined ? <NoteIcon /> : <BadgeIcon badge={badge} />}
            <b>
                <span class="move-number">{ply.number}{ply.side === "white" ? "." : "..."}</span>
                <Figurines san={ply.san} side={ply.side} />
            </b>{" "}
            {badge === undefined ? null : text.badges[badge]}
        </>
    );

    return (
        <div class={`move-note judged ${badge ?? ""}`} style={badge === undefined ? undefined : { "--row": `var(--badge-${badge})` }}>
            {note === undefined ? <span class="head">{head}</span> : (
                <details>
                    <summary class="head">{head}</summary>
                    <span class="note">
                        <Marked text={note} />
                    </span>
                </details>
            )}
        </div>
    );
}

/** The helps' sign before the card's title: a lifebuoy (Stefano). */
function HelpsIcon()
{
    return (
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="8.5" />
            <circle cx="12" cy="12" r="3.5" />
            <path d="M6 6L9.5 9.5M18 6L14.5 9.5M6 18L9.5 14.5M18 18L14.5 14.5" />
        </svg>
    );
}
