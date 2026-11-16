// The new game's dialog (D-48): the player's colour, the AI's level with what it sees there (D-61), and the clock; from a position of a game in analysis, the
// colour to move there.
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { type AiLevel, aiLevels, type Side } from "../../core/index.ts";
import { Figurines } from "../game/move-list.tsx";
import { moveNumberOf } from "../game/variation.ts";
import { Piece } from "../pieces/pieces.tsx";
import type { Text } from "../text.ts";
import { Dialog } from "./dialog.tsx";

/** What the player chooses: their colour, the AI's level, and the clock, none for a game without one. */
export interface NewGameChoice
{
    readonly colour: Side | "random";
    readonly level: AiLevel;
    readonly clock?: string;
}

/** The position a game replayed from analysis starts from: what it goes on from, the side to move there, which the player takes, and the move that led to it. */
export interface StartingPosition
{
    /** What the new game goes on from: a PGN of the moves to the position, or its FEN when none led to it. */
    readonly from: string;
    readonly turn: Side;
    /** None at the game's first position. */
    readonly after?: { readonly san: string; readonly side: Side; readonly number: number; };
}

/** The clocks offered: long enough for an AI that takes 10 to 30 seconds a move (D-13), with the seconds added at each move. */
export const clocks: readonly string[] = ["10+5", "15+10", "30+20"];

/**
 * The dialog the + opens, with the choices of the game before; the game going on, if any, goes to the archive unfinished when the new one starts. From a
 * position, the player plays the side to move there and chooses the rest.
 */
export function NewGameDialog({ open, choice, from, going, onStart, onClose, text }: {
    open: boolean;
    choice: NewGameChoice;
    from?: StartingPosition | undefined;
    going: boolean;
    onStart: (choice: NewGameChoice) => void;
    onClose: () => void;
    text: Text;
})
{
    return (
        <Dialog open={open} title={from === undefined ? text.newGame : text.replay} onClose={onClose} text={text}>
            <NewGameForm choice={choice} from={from} going={going} onStart={onStart} text={text} />
        </Dialog>
    );
}

const colours = ["white", "black", "random"] as const;

/** The colours by their king, the chosen set's silhouette in fixed colours, which both themes show; either colour by both kings. */
const colourIcons: Readonly<Record<(typeof colours)[number], ComponentChildren>> = {
    white: <Piece letter="K" small />,
    black: <Piece letter="k" small />,
    random: (
        <span class="kings">
            <Piece letter="K" small />
            <Piece letter="k" small />
        </span>
    ),
};

/** A clock face with the minutes each side has filled in, as a slice of the hour; with no minutes, the face crossed out: a game without a clock. */
function ClockIcon({ minutes }: { minutes?: number; })
{
    const angle = Math.min(minutes ?? 0, 59.9) / 60 * 2 * Math.PI;
    const end = `${(12 + 8 * Math.sin(angle)).toFixed(2)} ${(12 - 8 * Math.cos(angle)).toFixed(2)}`;

    return (
        <svg class="icon clock-icon" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="8" />
            {minutes === undefined ? <path d="M5 19L19 5" /> : <path class="slice" d={`M12 12V4A8 8 0 ${angle > Math.PI ? 1 : 0} 1 ${end}Z`} />}
        </svg>
    );
}

/** The form, made again at each opening with the choices it starts from. */
function NewGameForm({ choice, from, going, onStart, text }: {
    choice: NewGameChoice;
    from: StartingPosition | undefined;
    going: boolean;
    onStart: (choice: NewGameChoice) => void;
    text: Text;
})
{
    const words = text.start;
    const [colour, setColour] = useState(choice.colour);
    const [level, setLevel] = useState(choice.level);
    const [clock, setClock] = useState(choice.clock);
    // A clock of the game before that the dialog does not offer, such as one asked in the chat, is offered too.
    const offered = choice.clock === undefined || clocks.includes(choice.clock) ? clocks : [...clocks, choice.clock];

    const start = (event: Event): void => {
        event.preventDefault();
        onStart({ colour: from?.turn ?? colour, level, ...(clock === undefined ? {} : { clock }) });
    };

    return (
        <form class="profile-form new-game" onSubmit={start}>
            <fieldset>
                <legend>{words.colour}</legend>
                {from === undefined
                    ? (
                        <div class="row">
                            {colours.map((id) => <Option key={id} group="colour" on={colour === id} onPick={() => setColour(id)} label={words.colours[id]} icon={colourIcons[id]} first={choice.colour === id} />)}
                        </div>
                    )
                    : <FromPosition from={from} text={text} />}
            </fieldset>
            <fieldset>
                <legend>{words.level}</legend>
                <div class="levels">
                    {aiLevels.map((id) => <Option key={id} group="level" on={level === id} onPick={() => setLevel(id)} label={words.levels[id][0]} note={words.levels[id][1]} first={from !== undefined && choice.level === id} />)}
                </div>
                <p class="sees" aria-live="polite">{words.levels[level][2]}</p>
            </fieldset>
            <fieldset>
                <legend>
                    {words.clock} <small>{words.clockNote}</small>
                </legend>
                <div class="row">
                    <Option group="clock" on={clock === undefined} onPick={() => setClock(undefined)} label={words.noClock} icon={<ClockIcon />} />
                    {offered.map((id) => <Option key={id} group="clock" on={clock === id} onPick={() => setClock(id)} label={id} icon={<ClockIcon minutes={Number(id.split("+")[0])} />} />)}
                </div>
            </fieldset>
            {going ? <p class="note">{words.abandons}</p> : null}
            <button class="start" type="submit">{words.start}</button>
        </form>
    );
}

/** The colour the player takes from the position, the side to move there, and the move that led to it: not a choice, so not a radio. */
function FromPosition({ from: { turn, after }, text }: { from: StartingPosition; text: Text; })
{
    const words = text.start;

    return (
        <p class="from">
            <Piece letter={turn === "white" ? "K" : "k"} small />
            <span>
                <b>{words.colours[turn]}</b>
                <small>
                    {after === undefined ? words.fromFirst : (
                        <>
                            {words.fromAfter} {moveNumberOf(after, true)}
                            <Figurines san={after.san} side={after.side} />
                        </>
                    )}
                </small>
            </span>
        </p>
    );
}

/** One choice of a group, as the levels of the profile's form show them: an icon over its label, or a note under it; the `first` takes the focus when the dialog opens. */
function Option({ group, on, onPick, label, note, icon, first = false }: {
    group: string;
    on: boolean;
    onPick: () => void;
    label: string;
    note?: string;
    icon?: ComponentChildren;
    first?: boolean;
})
{
    return (
        <label class="level">
            <input type="radio" name={group} checked={on} onChange={onPick} autofocus={first} />
            <span>
                {icon}
                <b>{label}</b>
                {note === undefined ? null : <small>{note}</small>}
            </span>
        </label>
    );
}
