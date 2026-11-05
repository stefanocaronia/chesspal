// The game's clock (D-13): a time control, the time each side has left, and whether a side can still mate when the other's flag falls (FIDE 6.9).
import type { Side } from "./game.ts";

/** A time control: the time each side starts with and the time added after each of its moves, in milliseconds. */
export interface TimeControl
{
    readonly base: number;
    readonly increment: number;
}

/** The time each side has left, in milliseconds, at the start of the turn of the side to move, `since` (an ISO date). */
export interface Clock
{
    readonly control: TimeControl;
    readonly left: Readonly<Record<Side, number>>;
    readonly since: string;
    /** The clock waits for the player to start it, on the board page or with their first move: no side's time runs until then. */
    readonly waiting?: true;
}

/** A time control written as minutes and seconds added, as Lichess and chess.com write it: 10+5, 3+0, 0.5+0; the minutes make whole seconds. */
export function timeControlOf(text: string): TimeControl
{
    const match = /^\s*(\d+(?:\.\d+)?)\s*\+\s*(\d+)\s*$/.exec(text);
    const seconds = Number(match?.[1]) * 60;
    const base = Math.round(seconds) * second;
    const increment = Number(match?.[2]) * second;

    if (match === null || Math.abs(seconds - Math.round(seconds)) > 1e-9 || base <= 0 || base > 180 * minute || increment > 180 * second) {
        throw new Error(`"${text}" is not a time control: write minutes, in whole seconds, and seconds added, such as 10+5, 3+0 or 0.5+0, up to 180+180.`);
    }

    return { base, increment };
}

/** A time control as minutes and seconds added: 10+5. */
export function timeControlText({ base, increment }: TimeControl): string
{
    return `${base / minute}+${increment / second}`;
}

/** A time control as PGN's TimeControl tag writes it, in seconds: 600+5. */
export function timeControlTag({ base, increment }: TimeControl): string
{
    return `${Math.round(base / second)}+${Math.round(increment / second)}`;
}

/** A time control from PGN's TimeControl tag, in seconds: 600+5, or 600 with nothing added; none for a tag of another form, such as - or ?. */
export function timeControlOfTag(tag: string): TimeControl | undefined
{
    const [, base, increment] = /^\s*(\d+)(?:\+(\d+))?\s*$/.exec(tag) ?? [];
    return base === undefined || Number(base) === 0 ? undefined : { base: Number(base) * second, increment: Number(increment ?? 0) * second };
}

/** The clock at the start of a game: each side with the whole time, `waiting` for the player to start it or running at once. */
export function startClock(control: TimeControl, now: Date, waiting: boolean): Clock
{
    const clock = { control, left: { white: control.base, black: control.base }, since: now.toISOString() };
    return waiting ? { ...clock, waiting: true } : clock;
}

/** The clock started `now`, the turn of the side to move beginning then; a clock already running stays as it is. */
export function clockStarted(clock: Clock, now: Date): Clock
{
    return clock.waiting === true ? { control: clock.control, left: clock.left, since: now.toISOString() } : clock;
}

/** The time each side has left `now`: the side to move, `turn`, has spent the time since its turn began; never below nothing, and nothing while it waits. */
export function timeLeft(clock: Clock, turn: Side, now: Date): Record<Side, number>
{
    const spent = clock.waiting === true ? 0 : Math.max(0, now.getTime() - Date.parse(clock.since));
    return { ...clock.left, [turn]: Math.max(0, clock.left[turn] - spent) };
}

/**
 * The clock after `mover`'s move `now`: the time spent taken off, less an `allowance` for time that was not theirs, the increment added, and the other side's
 * turn beginning. A clock that waits takes nothing off and stays waiting, unless the move `starts` it: the player's first.
 */
export function clockAfterMove(clock: Clock, mover: Side, now: Date, allowance = 0, starts = false): Clock
{
    if (clock.waiting === true) {
        return starts ? clockStarted(clock, now) : { ...clock, since: now.toISOString() };
    }

    const left = timeLeft(clock, mover, new Date(now.getTime() - allowance));
    return { ...clock, left: { ...left, [mover]: left[mover] + clock.control.increment }, since: now.toISOString() };
}

/** A time as a clock shows it, cut to the second: 4:32, 1:02:03. */
export function clockText(milliseconds: number): string
{
    const seconds = Math.floor(milliseconds / second);
    const [hours, minutes] = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60];
    const rest = String(seconds % 60).padStart(2, "0");
    return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}

/** The time left after a move as PGN's [%clk] writes it, in a move's comment: [%clk 0:04:32]. */
export function clockTag(milliseconds: number): string
{
    const text = clockText(milliseconds);
    return `[%clk ${text.split(":").length === 2 ? `0:${text.padStart(5, "0")}` : text}]`;
}

/** The time left a move's comment gives as [%clk 0:04:32], in milliseconds; none without one. */
export function clockOfComment(comment: string): number | undefined
{
    const [, hours, minutes, seconds] = /\[%clk (\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)\]/.exec(comment) ?? [];
    return hours === undefined ? undefined : Math.round(((Number(hours) * 60 + Number(minutes)) * 60 + Number(seconds)) * second);
}

/**
 * Whether `side` could still mate by some series of legal moves, as a fallen flag asks (FIDE 6.9), by Lichess's rule: not with the king alone; not with
 * king and one knight unless the other side has a piece other than queens to block its king; not with bishops alone, all on squares of one colour, when the
 * other side has no knight or pawn; with anything else it could, if the other side helped.
 */
export function canMate(fen: string, side: Side): boolean
{
    const squares = boardSquares(fen);
    const own = squares.filter(({ letter }) => (letter === letter.toUpperCase()) === (side === "white")).map(({ letter }) => letter.toLowerCase());
    const other = squares.filter(({ letter }) => (letter === letter.toUpperCase()) !== (side === "white")).map(({ letter }) => letter.toLowerCase());

    if (own.length === 0) {
        return false;
    }

    if (own.length === 1 && own[0] === "n") {
        return other.some((letter) => letter !== "q");
    }

    if (own.every((letter) => letter === "b")) {
        const colours = new Set(squares.filter(({ letter }) => letter.toLowerCase() === "b").map(({ dark }) => dark));
        return colours.size > 1 || other.some((letter) => letter === "n" || letter === "p");
    }

    return true;
}

/** The pieces of a FEN but the kings, each with whether its square is dark. */
function boardSquares(fen: string): { letter: string; dark: boolean; }[]
{
    const rows = (fen.split(" ")[0] ?? "").split("/");
    return rows.flatMap((row, index) => {
        let file = 0;
        const found: { letter: string; dark: boolean; }[] = [];

        for (const letter of row) {
            if (/\d/.test(letter)) {
                file += Number(letter);
            } else {
                if (!/k/i.test(letter)) {
                    found.push({ letter, dark: (file + (8 - index)) % 2 === 1 });
                }

                file += 1;
            }
        }

        return found;
    });
}

const second = 1000;
const minute = 60 * second;
