// The clock in the commands (D-13): a flag that falls ends the game as soon as a command reads it, and the clock's line for the AI.
import { canMate, clockText, Game, type Side, timeControlText, timeLeft } from "../core/index.ts";
import { archiveEnded, type CurrentGame, endOf, loadGame, saveGame } from "../games/index.ts";
import { colourName } from "./view.ts";

/** What the AI reads of the clock: the time control, and the time each side has left when the command ran, in milliseconds. */
export interface ClockSummary
{
    control: string;
    left: Record<Side, number>;
}

/** The current game of a folder `now`, or undefined: a game whose side to move has run out of time is over, saved and archived first. */
export function gameAt(folder: string, now: Date): CurrentGame | undefined
{
    const current = loadGame(folder);

    if (current?.clock === undefined || endOf(current.game) !== undefined) {
        return current;
    }

    const { turn } = current.game.position;

    if (timeLeft(current.clock, turn, now)[turn] > 0) {
        return current;
    }

    const ended = outOfTime(current, turn, now);
    saveGame(folder, ended);
    // An archive that cannot be written leaves the game in game.json, where status shows it, until a new game archives it.
    archiveEnded(folder, ended);
    return ended;
}

/** The clock of a game `now`, as the AI reads it; none in a game without one. */
export function clockSummaryOf(current: CurrentGame, now: Date): ClockSummary | undefined
{
    const { clock, game } = current;

    if (clock === undefined) {
        return undefined;
    }

    const left = endOf(game) === undefined ? timeLeft(clock, game.position.turn, now) : { ...clock.left };
    return { control: timeControlText(clock.control), left };
}

/** The clock's line: Clock: you 4:32, player 5:01 (10+5). */
export function clockLine({ control, left }: ClockSummary, ai: Side): string
{
    const player = ai === "white" ? "black" : "white";
    return `Clock: you ${clockText(left[ai])}, player ${clockText(left[player])} (${control}).`;
}

/** The game lost on time by `loser`, or drawn when the other side could not mate with any series of legal moves (FIDE 6.9). */
function outOfTime(current: CurrentGame, loser: Side, now: Date): CurrentGame
{
    const winner = loser === "white" ? "black" : "white";
    const ending = canMate(current.game.position.fen, winner)
        ? { Result: loser === "white" ? "0-1" : "1-0", Termination: `${colourName(loser)} lost on time` }
        : { Result: "1/2-1/2", Termination: `${colourName(loser)} ran out of time and ${colourName(winner)} cannot mate` };
    const { record } = current.game;
    const clock = { ...current.clock!, left: { ...current.clock!.left, [loser]: 0 }, since: now.toISOString() };
    return { ...current, game: new Game({ ...record, tags: { ...record.tags, ...ending } }), clock };
}
