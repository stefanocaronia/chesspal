// The helps on the page (D-78, Zoe's sketch B): the board says where, the card says what, the facts the AI sees at the game's level and only those; and
// the coach's words (D-88).
import { type ComponentChildren, Fragment } from "preact";
import { useState } from "preact/hooks";
import type { PieceFacts, Profile, Side } from "../../core/index.ts";
import { Notch } from "../board/marks.tsx";
import { BadgeIcon, NoteIcon } from "../game/badges.tsx";
import { FoldButton, useCardFold } from "../game/card-fold.tsx";
import { Figurines } from "../game/move-list.tsx";
import type { CoachHint, Ply } from "../game/plies.ts";
import { Figurine } from "../pieces/pieces.tsx";
import { Legend, Marked } from "../talk/talk.tsx";
import type { HelpsCardText, Text } from "../text.ts";
import { groupOf, type HelpsView, pinSquares, riskSquares, squaresOf, type StrategyCell, type StrategyGroup, type StrategyLine, strategyOf, type StrategyRow, type TacticLine } from "./view.ts";

/**
 * The helps' card, between the opening and the moves: the coach's words, then the tactics in lines, the strategy in a table and the control map, seen while
 * its button or M is held, and the board without its drawings while their button is. A line under the pointer lights its squares on the board. Its title
 * folds it to the title and opens it again (Stefano).
 */
export function HelpsCard({ helps, judged, hint, hintOpen, onHint, onPoint, onMap, mapping, onBare, bare, text }: {
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
 * The coach's hint, a line that opens on its words and the legend of what it draws (D-88): in the helps' card, and on a phone under the board, beside the
 * map, where its drawings are in sight (Zoe).
 */
export function HintLine({ hint, open, onOpen, text }: { hint: CoachHint; open: boolean; onOpen: (open: boolean) => void; text: Text; })
{
    const words = text.helpsCard;

    return (
        <details class="coach-hint" open={open} onToggle={(event) => onOpen(event.currentTarget.open)}>
            <summary>{open ? words.hideHint : words.showHint}</summary>
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

/** The coach's judgment of the player's move: its badge and the move in a line, which opens on its note (D-78, D-88). */
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
        <div class={`move-note judged ${badge ?? ""}`}>
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

/**
 * The tactics in lines (D-91): one a kind of fact and a side, its count, red when it threatens the player and green when it is their chance; a click opens
 * its pieces, each with its squares (Stefano).
 */
function Tactics({ helps, opened, onOpen, onPoint, text }: {
    helps: HelpsView;
    opened: ReadonlySet<string>;
    onOpen: (key: string, open: boolean) => void;
    onPoint: (squares: readonly string[]) => void;
    text: Text;
})
{
    const words = text.helpsCard;
    const point = pointing(onPoint);
    const calm = !helps.lines.some((line) => line.kind === "risk" || line.kind === "pin");

    return (
        <ul class="help-rows">
            {calm
                ? (
                    <li class="safe">
                        <RowIcon>
                            <circle cx="8" cy="8" r="6.5" />
                            <path d="M5.2 8.2l2 2 3.8-4" />
                        </RowIcon>
                        {words.nothingAtRisk}
                    </li>
                )
                : null}
            {helps.lines.map((line) => {
                const key = line.kind === "loose" ? "loose" : `${line.kind} ${line.side}`;
                const open = opened.has(key);
                return (
                    <li key={key} class={`help-line ${line.kind} ${line.tone}${open ? " open" : ""}`}>
                        <button type="button" class="line-head" aria-expanded={open} onClick={() => onOpen(key, !open)} {...point(squaresOf(line))}>
                            <LineIcon kind={line.kind} />
                            <span class="line-name">{line.kind === "loose" ? words.loose : words.line(line.kind, line.side, helps.you, line.kind !== "check" || line.toMove)}</span>
                            <LineCount line={line} helps={helps} words={words} />
                        </button>
                        {open ? <LineDetails line={line} helps={helps} point={point} text={text} /> : null}
                    </li>
                );
            })}
        </ul>
    );
}

/** What the pointer on a line or a cell does: it lights the line's squares; a touch keeps them lit until the position changes, as a square in the AI's words. */
function pointing(onPoint: (squares: readonly string[]) => void): (squares: readonly string[]) => Pointing
{
    return (squares) => ({
        onPointerEnter: () => onPoint(squares),
        onPointerLeave: (event: PointerEvent) => event.pointerType === "mouse" && onPoint([]),
    });
}

interface Pointing
{
    onPointerEnter: () => void;
    onPointerLeave: (event: PointerEvent) => void;
}

/** A line's sign: the corner of a piece at risk, a pin's link, a check's plus, the loose pieces' i; its colour is the line's. */
function LineIcon({ kind }: { kind: TacticLine["kind"]; })
{
    if (kind === "risk") {
        return <Notch />;
    }

    if (kind === "loose") {
        return <InfoIcon />;
    }

    return (
        <RowIcon>
            {kind === "pin"
                ? <path d="M6.5 9.5l3-3M7.5 4.5l1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1M8.5 11.5l-1 1a2.5 2.5 0 0 1-3.5-3.5l1-1" />
                : (
                    <>
                        <circle cx="8" cy="8" r="6.5" />
                        <path d="M8 5v6M5 8h6" />
                    </>
                )}
        </RowIcon>
    );
}

/** How many: the loose pieces by side, each after its pawn, the player's first (Zoe); the others in one number. */
function LineCount({ line, helps, words }: { line: TacticLine; helps: HelpsView; words: HelpsCardText; })
{
    if (line.kind !== "loose") {
        return <b class="count">{line.items.length}</b>;
    }

    const name = (side: Side): string => helps.you === undefined ? words[side] : side === helps.you ? words.yours : words.theirs;
    const counts = helps.sides.map((side) => ({ side, count: line.items.filter((piece) => piece.side === side).length })).filter(({ count }) => count > 0);

    return (
        <span class="counts">
            {counts.map(({ side, count }) => (
                <span key={side} title={name(side)} aria-label={`${name(side)} ${count}`}>
                    <Figurine letter="P" side={side} />
                    <b class="count">{count}</b>
                </span>
            ))}
        </span>
    );
}

/** A line opened: its pieces, each lighting its own squares; the checks in figures; the loose pieces by side. */
function LineDetails({ line, helps, point, text }: { line: TacticLine; helps: HelpsView; point: (squares: readonly string[]) => Pointing; text: Text; })
{
    const words = text.helpsCard;

    switch (line.kind) {
        case "risk":
            return (
                <ul class="line-details">
                    {line.items.map((risk) => (
                        <li key={risk.piece.square} {...point(riskSquares(risk))}>
                            {text.piece(risk.piece.piece, risk.piece.side)} <Squares squares={[risk.piece.square]} /> · {words.attackers}: <Squares squares={risk.piece.attackers} />
                            {risk.why === "undefended" ? null : (
                                <>
                                    {" "}· {words.defenders}: <Squares squares={risk.piece.defenders} />
                                </>
                            )} · {words[risk.why]}
                        </li>
                    ))}
                </ul>
            );
        case "pin":
            return (
                <ul class="line-details">
                    {line.items.map((pin) => (
                        <li key={pin.piece.square} {...point(pinSquares(pin))}>
                            {text.piece(pin.piece.piece, pin.piece.side)} <Squares squares={[pin.piece.square]} /> {words.pinnedTo(pin.to.piece)} <Squares squares={[pin.to.square]} />, {words.pinnedBy(pin.by.piece)}{" "}
                            <Squares squares={[pin.by.square]} />
                        </li>
                    ))}
                </ul>
            );
        case "check":
            return (
                <p class="line-details">
                    {line.items.map((check) => (
                        <span key={check} class="help-move">
                            <Figurines san={check} side={line.side} />
                        </span>
                    ))}
                </p>
            );
        case "loose":
            return (
                <p class="line-details">
                    {helps.sides.map((side) => <Pieces key={side} pieces={line.items.filter((piece) => piece.side === side)} />)}
                </p>
            );
    }
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

/** The icon before a line of facts, in its kind's colour (Stefano): a pin's link, nothing at risk's tick, a check's plus, the loose pieces' i. */
function RowIcon({ children }: { children: ComponentChildren; })
{
    return (
        <span class="row-icon" aria-hidden="true">
            <svg viewBox="0 0 16 16">{children}</svg>
        </span>
    );
}

/** An i in a ring, before the loose pieces and the strategy's notes. */
function InfoIcon()
{
    return (
        <RowIcon>
            <circle cx="8" cy="8" r="6.5" />
            <path d="M8 7.3V11M8 4.9v.1" />
        </RowIcon>
    );
}

/** Pieces of one side, each its figure and its square. */
function Pieces({ pieces }: { pieces: readonly PieceFacts[]; })
{
    return pieces.length === 0 ? null : (
        <span class="help-pieces">
            {pieces.map((piece) => (
                <span key={piece.square} class="help-move">
                    <Figurine letter={piece.piece} side={piece.side} />
                    <b class="square-name">{piece.square}</b>
                </span>
            ))}
        </span>
    );
}

function Squares({ squares }: { squares: readonly string[]; })
{
    return <b class="square-name">{squares.join(", ")}</b>;
}

/**
 * The strategy (Stefano): the phase and the open files on top, the squares each side controls in a bar, the table in groups each under its figure, a count
 * or a tick in each cell, and the notes in lines as the tactics'. The player's side comes first, with no colour of good or bad (D-91).
 */
function Strategy({ helps, onPoint, text }: { helps: HelpsView; onPoint: (squares: readonly string[]) => void; text: Text; })
{
    const words = text.helpsCard;
    const profile = helps.strategy;
    const { draw, pawnEnding } = profile;
    const point = pointing(onPoint);
    // A line opens under it at a click or a tap, on its name's meaning and each side's squares or files, since a phone has no pointer for a title (Rosa).
    const [explained, setExplained] = useState<StrategyRow | undefined>(undefined);
    const lines = strategyOf(profile);
    const sideName = (side: Side): string => side === helps.you ? `${words[side]} ${words.you}` : words[side];
    const notes = [
        profile.oppositeBishops ? words.oppositeBishops : undefined,
        draw.repetitions > 1 ? words.repetitions(draw.repetitions) : undefined,
        draw.fiftyMovesLeft <= fiftyMovesShown ? words.fiftyMoves(draw.fiftyMovesLeft) : undefined,
        draw.insufficient ? words.insufficient : undefined,
        ...(pawnEnding?.squares ?? []).map((square) => words.pawnSquare(square.pawn, square.caught)),
        pawnEnding?.opposition === undefined ? undefined : words.opposition(pawnEnding.opposition),
    ].filter((note) => note !== undefined);

    return (
        <div class="strategy">
            <p class="strategy-head">
                <span class="phase">{words.phases[profile.phase]}</span>
                <span>
                    {words.openFiles}: <Chips items={profile.openFiles} />
                </span>
            </p>
            <ControlBar controlled={profile.controlled} sides={helps.sides} sideName={sideName} words={words} />
            <table class="strategy-table">
                <thead>
                    <tr>
                        <th />
                        {helps.sides.map((side) => (
                            <th key={side}>
                                <Figurine letter="P" side={side} />
                                {sideName(side)}
                            </th>
                        ))}
                    </tr>
                </thead>
                {groups.map(({ group, letter }) => {
                    const shown = lines.filter((line) => groupOf[line.row] === group);
                    return shown.length === 0 ? null : (
                        <tbody key={group}>
                            <tr class="group">
                                <th colSpan={3}>
                                    <Figurine letter={letter} side="white" />
                                    {words.groups[group]}
                                </th>
                            </tr>
                            {shown.map((line) => {
                                const [name, meaning] = words.rows[line.row];
                                const open = explained === line.row;
                                const listed = helps.sides.filter((side) => typeof line[side] === "object");
                                return (
                                    <Fragment key={line.row}>
                                        <tr class={open ? "open" : undefined} {...point(squaresIn(line))}>
                                            <th>
                                                <button type="button" class="term" title={meaning} aria-expanded={open} onClick={() => setExplained(open ? undefined : line.row)}>
                                                    {name}
                                                </button>
                                            </th>
                                            {helps.sides.map((side) => (
                                                <td key={side}>
                                                    <Cell cell={line[side]} words={words} />
                                                </td>
                                            ))}
                                        </tr>
                                        {open
                                            ? (
                                                <tr class="meaning">
                                                    <td colSpan={3}>
                                                        {meaning}
                                                        {listed.map((side) => (
                                                            <span key={side} class="listed">
                                                                {sideName(side)}: <Chips items={line[side] as readonly string[]} />
                                                            </span>
                                                        ))}
                                                    </td>
                                                </tr>
                                            )
                                            : null}
                                    </Fragment>
                                );
                            })}
                        </tbody>
                    );
                })}
            </table>
            {notes.length === 0 ? null : (
                <ul class="help-rows">
                    {notes.map((note) => (
                        <li key={note} class="info">
                            <InfoIcon />
                            {note}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

// The groups of the strategy's table in their order, each with its figure.
const groups: readonly { group: StrategyGroup; letter: string; }[] = [{ group: "pawns", letter: "P" }, { group: "pieces", letter: "N" }, { group: "king", letter: "K" }];

// The fifty-move count shows only when the draw is near: ten moves each, or less.
const fiftyMovesShown = 20;

/** The squares a side's cells of a strategy's line name, to light on the board; files and islands light none. */
function squaresIn(line: StrategyLine): readonly string[]
{
    return [line.white, line.black].flatMap((cell) => typeof cell === "object" ? cell.filter((item) => /^[a-h][1-8]$/.test(item)) : []);
}

/**
 * The squares only one side controls and those both do, in a bar as long as their counts, the player's side on the left; its title says it in words.
 */
function ControlBar({ controlled, sides, sideName, words }: {
    controlled: Profile["controlled"];
    sides: readonly [Side, Side];
    /** A side's name, "(you)" after the player's, as the table under it says (Zoe). */
    sideName: (side: Side) => string;
    words: HelpsCardText;
})
{
    const { white, black, contested } = controlled;
    const [left, right] = sides;
    const parts = [{ side: left, count: controlled[left] }, { side: "both", count: contested }, { side: right, count: controlled[right] }].filter(({ count }) => count > 0);

    return (
        <div class="control" title={words.controlled(white, black, contested)}>
            <span class="control-title">{words.control}</span>
            <span class="control-bar" role="img" aria-label={words.controlled(white, black, contested)}>
                {parts.map(({ side, count }) => <span key={side} class={side} style={{ flexGrow: count }}>{count}</span>)}
            </span>
            <span class="control-legend" aria-hidden="true">
                <span>{sideName(left)}</span>
                <span>{words.both}</span>
                <span>{sideName(right)}</span>
            </span>
        </div>
    );
}

/** Squares, files or islands in chips; none as a faint dash. */
function Chips({ items }: { items: readonly string[]; })
{
    return items.length === 0 ? <span class="none">–</span> : <>{items.map((item) => <b key={item} class="chip">{item}</b>)}</>;
}

/** A cell of the strategy (Stefano): how many squares, files or islands, a count in bold, a yes as a tick, nothing as a faint dash. */
function Cell({ cell, words }: { cell: StrategyCell; words: HelpsCardText; })
{
    const none = <span class="none">–</span>;

    if (typeof cell === "object") {
        return cell.length === 0 ? none : <b class="count">{cell.length}</b>;
    }

    if (typeof cell === "number") {
        return cell === 0 ? none : <b class="count">{cell}</b>;
    }

    if (typeof cell === "boolean") {
        return cell
            ? (
                <span class="yes" role="img" aria-label={words.yes} title={words.yes}>
                    <svg viewBox="0 0 16 16">
                        <path d="M3.5 8.5l3 3 6-7" />
                    </svg>
                </span>
            )
            : none;
    }

    if (cell === "unknown") {
        return none;
    }

    return cell === "not-yet" || cell === "no-more" ? <span class="soft">{cell === "not-yet" ? words.notYet : words.noMore}</span> : <b class="chip">{cell}</b>;
}
