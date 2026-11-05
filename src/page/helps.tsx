// The helps on the page (D-78, Zoe's sketch B): the board says where, the card says what, the facts the AI sees at the game's level and only those.
import { useState } from "preact/hooks";
import type { PieceFacts, Profile, Side } from "../core/index.ts";
import { type HelpsView, type StrategyCell, strategyOf } from "./helps-view.ts";
import { Figurines } from "./move-list.tsx";
import { Figurine } from "./pieces.tsx";
import type { HelpsCardText, Text } from "./text.ts";

/** The corner folded in ink on a piece at risk: on the board, and before its line in the card. */
export function Notch()
{
    return (
        <span class="help-notch" aria-hidden="true">
            <svg viewBox="0 0 10 10">
                <path d="M0.5 0.5V9.5H9.5Z" />
                <circle cx="2.9" cy="7.1" r="1.1" />
            </svg>
        </span>
    );
}

/**
 * The helps' card, between the opening and the moves: the tactics in lines, the strategy in a table and the control map, seen while its button
 * or M is held. A line under the pointer lights its squares on the board.
 */
export function HelpsCard({ helps, onPoint, onMap, mapping, text }: {
    helps: HelpsView;
    onPoint: (squares: readonly string[]) => void;
    onMap: (held: boolean) => void;
    mapping: boolean;
    text: Text;
})
{
    const [tab, setTab] = useState<"tactics" | "strategy">("tactics");
    const words = text.helpsCard;

    return (
        <section class="card helps-card" aria-label={words.title}>
            <h3 class="helps-title">
                {words.title}
            </h3>
            <div class="tabs" role="tablist">
                <button type="button" role="tab" aria-selected={tab === "tactics"} onClick={() => setTab("tactics")}>{words.tactics}</button>
                <button type="button" role="tab" aria-selected={tab === "strategy"} onClick={() => setTab("strategy")}>{words.strategy}</button>
                <MapButton mapping={mapping} onMap={onMap} held text={text} />
            </div>
            {tab === "tactics" ? <Tactics helps={helps} onPoint={onPoint} text={text} /> : <Strategy profile={helps.strategy} text={text} />}
        </section>
    );
}

/**
 * The map's button (D-78): the mouse holds it to see the map; a finger, or the keyboard, turns it on and off. In the card's tabs it says it is held; on a
 * phone it sits under the board.
 */
export function MapButton({ mapping, onMap, held, text }: { mapping: boolean; onMap: (on: boolean) => void; held: boolean; text: Text; })
{
    // A click carries its pointer's type: none from the keyboard.
    const mouse = (event: Event): boolean => event instanceof PointerEvent && event.pointerType === "mouse";

    return (
        <button
            type="button"
            class="map-button"
            aria-pressed={mapping}
            title={text.helpsCard.mapHint}
            onPointerDown={(event) => mouse(event) && onMap(true)}
            onPointerUp={(event) => mouse(event) && onMap(false)}
            onPointerLeave={(event) => mouse(event) && onMap(false)}
            onClick={(event) => !mouse(event) && onMap(!mapping)}
        >
            <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M2 2h5v5H2zM9 9h5v5H9z" />
                <path d="M9 2h5v5H9zM2 9h5v5H2z" opacity=".35" />
            </svg>
            {text.helpsCard.map}
            {held ? <small>({text.helpsCard.hold})</small> : null}
        </button>
    );
}

function Tactics({ helps, onPoint, text }: { helps: HelpsView; onPoint: (squares: readonly string[]) => void; text: Text; })
{
    const words = text.helpsCard;
    // A row lights its squares while the pointer is on it; a touch keeps them lit until the position changes, as a square in the AI's words (T-111).
    const point = (squares: readonly string[]) => ({
        onPointerEnter: () => onPoint(squares),
        onPointerLeave: (event: PointerEvent) => event.pointerType === "mouse" && onPoint([]),
    });

    const other = helps.toMove === "white" ? "black" : "white";
    const loose = helps.loose.map((piece) => piece.square);

    return (
        <ul class="help-rows">
            {helps.atRisk.map(({ piece, why }) => (
                <li key={`risk ${piece.square}`} class="points" {...point([piece.square, ...piece.attackers])}>
                    <Notch />
                    {text.piece(piece.piece, piece.side)} <Squares squares={[piece.square]} /> · {words.attackers}: <Squares squares={piece.attackers} />
                    {why === "undefended" ? null : (
                        <>
                            {" "}· {words.defenders}: <Squares squares={piece.defenders} />
                        </>
                    )} · {words[why]}
                </li>
            ))}
            {helps.pins.map(({ piece, by, to }) => (
                <li key={`pin ${piece.square}`} class="points" {...point([piece.square, by.square, to.square])}>
                    <span class="row-icon" aria-hidden="true">⛓</span>
                    {text.piece(piece.piece, piece.side)} <Squares squares={[piece.square]} /> {words.pinnedTo(to.piece)} <Squares squares={[to.square]} />, {words.pinnedBy(by.piece)} <Squares squares={[by.square]} />
                </li>
            ))}
            {helps.atRisk.length === 0 && helps.pins.length === 0 ? <li class="quiet">{words.nothingAtRisk}</li> : null}
            {helps.checks.length === 0 ? null : <Checks name={words.checks(helps.toMove, true)} checks={helps.checks} side={helps.toMove} />}
            {helps.otherChecks.length === 0 ? null : <Checks name={words.checks(other, false)} checks={helps.otherChecks} side={other} />}
            {loose.length === 0 ? null : (
                <li key="loose" class="points quiet" {...point(loose)}>
                    {words.loose}: <Pieces pieces={helps.loose.filter((piece) => piece.side === "white")} />
                    <Pieces pieces={helps.loose.filter((piece) => piece.side === "black")} />
                </li>
            )}
        </ul>
    );
}

/** A side's checks in SAN, drawn with the move list's figures (D-50). */
function Checks({ name, checks, side }: { name: string; checks: readonly string[]; side: Side; })
{
    return (
        <li>
            <span class="row-icon" aria-hidden="true">+</span>
            {name}: {checks.map((check) => (
                <span key={check} class="help-move">
                    <Figurines san={check} side={side} />
                </span>
            ))}
        </li>
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

function Strategy({ profile, text }: { profile: Profile; text: Text; })
{
    const words = text.helpsCard;
    const files = profile.openFiles.length === 0 ? "–" : profile.openFiles.join(", ");
    const { draw, pawnEnding } = profile;
    const notes = [
        words.openFiles(files),
        words.controlled(profile.controlled.white, profile.controlled.black, profile.controlled.contested),
        words.phases[profile.phase],
        profile.oppositeBishops ? words.oppositeBishops : undefined,
        draw.repetitions > 1 ? words.repetitions(draw.repetitions) : undefined,
        draw.fiftyMovesLeft <= fiftyMovesShown ? words.fiftyMoves(draw.fiftyMovesLeft) : undefined,
        draw.insufficient ? words.insufficient : undefined,
        ...(pawnEnding?.squares ?? []).map((square) => words.pawnSquare(square.pawn, square.caught)),
        pawnEnding?.opposition === undefined ? undefined : words.opposition(pawnEnding.opposition),
    ];

    return (
        <div class="strategy">
            <table class="profile-table">
                <thead>
                    <tr>
                        <th />
                        <th>{words.white}</th>
                        <th>{words.black}</th>
                    </tr>
                </thead>
                <tbody>
                    {strategyOf(profile).map((line) => {
                        const [name, meaning] = words.rows[line.row];
                        return (
                            <tr key={line.row}>
                                <th title={meaning}>{name}</th>
                                <td>{cellText(line.white, words)}</td>
                                <td>{cellText(line.black, words)}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            <p class="profile-foot">{notes.filter((note) => note !== undefined).join(" · ")}</p>
        </div>
    );
}

// The fifty-move count shows only when the draw is near: ten moves each, or less.
const fiftyMovesShown = 20;

function cellText(cell: StrategyCell, words: HelpsCardText): string
{
    if (typeof cell === "object") {
        return cell.length === 0 ? "–" : cell.join(", ");
    }

    if (typeof cell === "number") {
        return String(cell);
    }

    if (typeof cell === "boolean") {
        return cell ? words.yes : "–";
    }

    return cell === "not-yet" ? words.notYet : cell === "no-more" ? words.noMore : cell === "unknown" ? "–" : cell;
}
