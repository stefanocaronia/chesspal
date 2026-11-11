// The seat `chesspal play` takes at the table (D-104): the play process notes itself in the table's folder while its host runs, one at a time, and the table
// asks it there to start its host again, a clean chat for a new game (D-57).
import { mkdirSync, readFileSync, rmSync, statSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { writeAtomically } from "../../../games/index.ts";

/** The play process in the seat: its process id, its host, and the model and effort it started that host with, none for the host's own. */
export interface Seat
{
    readonly pid: number;
    readonly host: string;
    readonly model?: string | undefined;
    readonly effort?: string | undefined;
}

/**
 * Takes the seat for this play process, over a request left for one before it; it throws while another one holds it. A seat is held while its play
 * refreshes it: one closed with its window, or stopped, lets it go within `heldFor`, whatever process takes its id after it.
 */
export function takeSeat(folder: string, seat: Seat, now: Date = new Date()): void
{
    const held = seatHeld(folder, now);

    if (held !== undefined && held.pid !== seat.pid) {
        throw new Error(`A chat in ${held.host} already plays at the table, in another window: play there, or close it, then try again.`);
    }

    // chesspal play may come before the table has ever been opened.
    mkdirSync(folder, { recursive: true });
    rmSync(join(folder, againFile), { force: true });
    writeAtomically(join(folder, seatFile), `${JSON.stringify(seat)}\n`);
}

/** Tells the table this play process still holds the seat; nothing when it lost it. */
export function refreshSeat(folder: string, pid: number, now: Date = new Date()): void
{
    if (seatIn(folder)?.pid === pid) {
        utimesSync(join(folder, seatFile), now, now);
    }
}

/** Leaves the seat, when this play process still holds it. */
export function leaveSeat(folder: string, pid: number): void
{
    if (seatIn(folder)?.pid === pid) {
        rmSync(join(folder, seatFile), { force: true });
    }
}

/** Whether a play process holds the seat. */
export function seatTaken(folder: string, now: Date = new Date()): boolean
{
    return seatHeld(folder, now) !== undefined;
}

/** The play process that holds the seat, with the model and effort it started its host with; none when no one holds it. */
export function seatHeld(folder: string, now: Date = new Date()): Seat | undefined
{
    const seat = seatIn(folder);
    // A file's time is finer than a Date's: it is compared to the millisecond, as the Date is.
    const refreshed = statSync(join(folder, seatFile), { throwIfNoEntry: false })?.mtimeMs;
    return seat !== undefined && refreshed !== undefined && now.getTime() - Math.floor(refreshed) < seatTimes.heldFor ? seat : undefined;
}

/** Asks the play process in the seat to start its host again, or `again.host` in its place: whether one holds it, and was asked. */
export function askAgain(folder: string, now: Date = new Date(), again: Again = {}): boolean
{
    const held = seatHeld(folder, now);

    if (held === undefined) {
        return false;
    }

    writeAtomically(join(folder, againFile), `${JSON.stringify({ pid: held.pid, ...again })}\n`);
    return true;
}

/**
 * What the table asks the play process in the seat: to start its host again, or the host named in its place (D-107); `updated`, from the Chesspal just
 * installed, whose `chesspal play` then takes the seat (D-108).
 */
export interface Again
{
    readonly host?: string;
    readonly updated?: true;
}

/** What the table asked this play process, when it asked it to start its host again; the request is taken. */
export function askedAgain(folder: string, pid: number): Again | undefined
{
    const asked = jsonIn(join(folder, againFile)) as { pid?: unknown; host?: unknown; updated?: unknown; } | undefined;

    if (asked?.pid !== pid) {
        return undefined;
    }

    rmSync(join(folder, againFile), { force: true });
    return { ...(typeof asked.host === "string" ? { host: asked.host } : {}), ...(asked.updated === true ? { updated: true } : {}) };
}

/** How often a play process refreshes its seat, and how long the seat stays held without it. */
export const seatTimes = { refresh: 5_000, heldFor: 15_000 };

const seatFile = "play.json";
const againFile = "play-again.json";

function seatIn(folder: string): Seat | undefined
{
    const seat = jsonIn(join(folder, seatFile)) as { pid?: unknown; host?: unknown; model?: unknown; effort?: unknown; } | undefined;

    if (typeof seat?.pid !== "number" || typeof seat.host !== "string") {
        return undefined;
    }

    const text = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);
    return { pid: seat.pid, host: seat.host, model: text(seat.model), effort: text(seat.effort) };
}

function jsonIn(path: string): unknown
{
    try {
        return JSON.parse(readFileSync(path, "utf8")) as unknown;
    } catch {
        return undefined;
    }
}
