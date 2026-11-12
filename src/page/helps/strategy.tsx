// The helps' strategy: the game's phase, the squares each side controls, and the positional facts in lines of a tile each, the player's side first.
import { useState } from "preact/hooks";
import type { Phase, Profile, Side } from "../../core/index.ts";
import type { HelpsCardText, Text } from "../text.ts";
import { InfoIcon, pointing } from "./rows.tsx";
import { groupOf, type HelpsView, type StrategyCell, type StrategyGroup, type StrategyLine, strategyOf, type StrategyRow } from "./view.ts";

/**
 * The strategy (Stefano): the phases with the current one in a pill, the bar of the squares each side controls, then the lines in groups, each a name and a
 * tile of a half per side, and the notes as the tactics'. The player's side comes first, with no colour of good or bad (D-91).
 */
export function Strategy({ helps, onPoint, text }: { helps: HelpsView; onPoint: (squares: readonly string[]) => void; text: Text; })
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
            <Phases current={profile.phase} words={words} />
            <ControlBar controlled={profile.controlled} sides={helps.sides} you={helps.you} words={words} />
            {groups.map((group) => {
                const shown = lines.filter((line) => groupOf[line.row] === group);
                return shown.length === 0 ? null : (
                    <ul key={group} class="strategy-rows">
                        {shown.map((line) => {
                            const [name, meaning] = words.rows[line.row];
                            const open = explained === line.row;
                            return (
                                <li key={line.row} class={open ? "open" : undefined} {...point(squaresIn(line))}>
                                    <div class="row-head">
                                        <button type="button" class="term" title={meaning} aria-expanded={open} onClick={() => setExplained(open ? undefined : line.row)}>
                                            {name}
                                        </button>
                                        <Tile line={line} sides={helps.sides} sideName={sideName} words={words} />
                                    </div>
                                    {open ? <Meaning line={line} meaning={meaning} sides={helps.sides} sideName={sideName} /> : null}
                                </li>
                            );
                        })}
                    </ul>
                );
            })}
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

// The strategy's groups in their order, apart only by a gap.
const groups: readonly StrategyGroup[] = ["pawns", "pieces", "king"];

const phases: readonly Phase[] = ["opening", "middlegame", "endgame"];

// The fifty-move count shows only when the draw is near: ten moves each, or less.
const fiftyMovesShown = 20;

/** The squares a side's cells of a strategy's line name, to light on the board; files and islands light none. */
function squaresIn(line: StrategyLine): readonly string[]
{
    if (line.row === "openFiles") {
        return [];
    }

    return [line.white, line.black].flatMap((cell) => typeof cell === "object" ? cell.filter((item) => /^[a-h][1-8]$/.test(item)) : []);
}

/** The game's three phases in a row of arrows: the current one full, those gone by lit, those to come not. */
function Phases({ current, words }: { current: Phase; words: HelpsCardText; })
{
    return (
        <ol class="phases">
            {phases.map((phase, at) => (
                <li key={phase} class={at < phases.indexOf(current) ? "done" : undefined} aria-current={phase === current ? "step" : undefined}>
                    {words.phases[phase]}
                </li>
            ))}
        </ol>
    );
}

/** The squares only one side controls and those both do, in a bar as long as their counts, the player's side on the left; each part's title says it in words. */
function ControlBar({ controlled, sides, you, words }: { controlled: Profile["controlled"]; sides: readonly [Side, Side]; you: Side | undefined; words: HelpsCardText; })
{
    const { white, black, contested } = controlled;
    const [left, right] = sides;
    const parts: { who: Side | "both"; count: number; }[] = [{ who: left, count: controlled[left] }, { who: "both", count: contested }, { who: right, count: controlled[right] }];

    return (
        <span class="control-bar" role="img" aria-label={words.controlled(white, black, contested)}>
            {parts.filter(({ count }) => count > 0).map(({ who, count }) => <span key={who} class={who} style={{ flexGrow: count }} title={words.controlledBy(who, count, who === you)}>{count}</span>)}
        </span>
    );
}

/** A line's tile: a half for each side, the player's first, in the bar's colours; the open files, both sides', in one half as wide as the two. */
function Tile({ line, sides, sideName, words }: { line: StrategyLine; sides: readonly [Side, Side]; sideName: (side: Side) => string; words: HelpsCardText; })
{
    if (line.row === "openFiles") {
        return (
            <span class="row-tile">
                <span class="both" title={words.bothSides}>
                    <span class="visually-hidden">{`${words.bothSides} `}</span>
                    <b class="count">{line.both.length}</b>
                </span>
            </span>
        );
    }

    return (
        <span class="row-tile">
            {sides.map((side) => (
                <span key={side} class={side} title={sideName(side)}>
                    <span class="visually-hidden">{`${sideName(side)} `}</span>
                    <Cell cell={line[side]} words={words} />
                </span>
            ))}
        </span>
    );
}

/** A line opened: its meaning, then each listed side's squares or files in chips; the open files with no side's name. */
function Meaning({ line, meaning, sides, sideName }: { line: StrategyLine; meaning: string; sides: readonly [Side, Side]; sideName: (side: Side) => string; })
{
    if (line.row === "openFiles") {
        return (
            <div class="meaning">
                {meaning}
                <span class="listed">
                    <Chips items={line.both} />
                </span>
            </div>
        );
    }

    return (
        <div class="meaning">
            {meaning}
            {sides.map((side) => {
                const cell = line[side];
                return typeof cell === "object"
                    ? (
                        <span key={side} class="listed">
                            {sideName(side)}: <Chips items={cell} />
                        </span>
                    )
                    : null;
            })}
        </div>
    );
}

/** Squares, files or islands in chips; none as a faint dash. */
function Chips({ items }: { items: readonly string[]; })
{
    return items.length === 0 ? <span class="none">–</span> : <>{items.map((item) => <b key={item} class="chip">{item}</b>)}</>;
}

/** A cell of the strategy (Stefano): a count in bold, a yes as a tick, nothing or not yet as a faint dash, no more as a faint cross: marks, not words. */
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

    if (cell === "not-yet") {
        return <span class="none" role="img" aria-label={words.notYet} title={words.notYet}>–</span>;
    }

    return cell === "no-more"
        ? (
            <span class="no" role="img" aria-label={words.noMore} title={words.noMore}>
                <svg viewBox="0 0 16 16">
                    <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
                </svg>
            </span>
        )
        : <b class="chip">{cell}</b>;
}
