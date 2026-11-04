// The new game's dialog (D-48, T-58): the player's colour, the AI's level with what it sees there (D-61), and the clock.
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { type AiLevel, aiLevels, type Side } from "../core/index.ts";
import { Dialog } from "./dialog.tsx";
import { Piece } from "./pieces.tsx";
import type { Text } from "./text.ts";

/** What the player chooses: their colour, the AI's level, and the clock, none for a game without one. */
export interface NewGameChoice
{
    readonly colour: Side | "random";
    readonly level: AiLevel;
    readonly clock?: string;
}

/** The clocks offered: long enough for an AI that takes 10 to 30 seconds a move (D-13), with the seconds added at each move. */
export const clocks: readonly string[] = ["10+5", "15+10", "30+20"];

/** The dialog the + opens, with the choices of the game before; the game going on, if any, goes to the archive unfinished when the new one starts. */
export function NewGameDialog({ open, choice, going, onStart, onClose, text }: {
    open: boolean;
    choice: NewGameChoice;
    going: boolean;
    onStart: (choice: NewGameChoice) => void;
    onClose: () => void;
    text: Text;
})
{
    return (
        <Dialog open={open} title={text.newGame} onClose={onClose} text={text}>
            <NewGameForm choice={choice} going={going} onStart={onStart} text={text} />
        </Dialog>
    );
}

const colours = ["white", "black", "random"] as const;

/** The colours by their king, the chosen set's silhouette in fixed colours, which both themes show (T-94); either colour by both kings. */
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
function NewGameForm({ choice, going, onStart, text }: { choice: NewGameChoice; going: boolean; onStart: (choice: NewGameChoice) => void; text: Text; })
{
    const words = text.start;
    const [colour, setColour] = useState(choice.colour);
    const [level, setLevel] = useState(choice.level);
    const [clock, setClock] = useState(choice.clock);
    // A clock of the game before that the dialog does not offer, such as one asked in the chat, is offered too.
    const offered = choice.clock === undefined || clocks.includes(choice.clock) ? clocks : [...clocks, choice.clock];

    const start = (event: Event): void => {
        event.preventDefault();
        onStart({ colour, level, ...(clock === undefined ? {} : { clock }) });
    };

    return (
        <form class="profile-form new-game" onSubmit={start}>
            <fieldset>
                <legend>{words.colour}</legend>
                <div class="row">
                    {colours.map((id) => <Option key={id} group="colour" on={colour === id} onPick={() => setColour(id)} label={words.colours[id]} icon={colourIcons[id]} first={choice.colour === id} />)}
                </div>
            </fieldset>
            <fieldset>
                <legend>{words.level}</legend>
                <div class="levels">
                    {aiLevels.map((id) => <Option key={id} group="level" on={level === id} onPick={() => setLevel(id)} label={words.levels[id][0]} note={words.levels[id][1]} />)}
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
