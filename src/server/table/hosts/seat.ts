// The seat `chesspal play` takes at the table (D-104): the play process notes itself in the table's folder while its host runs, one at a time, and the table
// asks it there to start its host again, a clean chat for a new game (D-57).
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { writeAtomically } from "../../../games/index.ts";

/** The play process in the seat: its process id and its host. */
export interface Seat
{
    readonly pid: number;
    readonly host: string;
}

/** Takes the seat for this play process, over a request left for one before it; it throws while another one, alive, holds it. */
export function takeSeat(folder: string, seat: Seat, alive: (pid: number) => boolean = isAlive): void
{
    const held = seatHeld(folder, alive);

    if (held !== undefined && held.pid !== seat.pid) {
        throw new Error(`A chat in ${held.host} already plays at the table, in another window: play there, or close it, then try again.`);
    }

    // chesspal play may come before the table has ever been opened.
    mkdirSync(folder, { recursive: true });
    rmSync(join(folder, againFile), { force: true });
    writeAtomically(join(folder, seatFile), `${JSON.stringify(seat)}\n`);
}

/** Leaves the seat, when this play process still holds it. */
export function leaveSeat(folder: string, pid: number): void
{
    if (seatIn(folder)?.pid === pid) {
        rmSync(join(folder, seatFile), { force: true });
    }
}

/** Asks the play process in the seat to start its host again: whether one alive holds it, and was asked. */
export function askAgain(folder: string, alive: (pid: number) => boolean = isAlive): boolean
{
    const held = seatHeld(folder, alive);

    if (held === undefined) {
        return false;
    }

    writeAtomically(join(folder, againFile), `${JSON.stringify({ pid: held.pid })}\n`);
    return true;
}

/** Whether the table asked this play process to start its host again; the request is taken. */
export function askedAgain(folder: string, pid: number): boolean
{
    const asked = (jsonIn(join(folder, againFile)) as { pid?: unknown; } | undefined)?.pid === pid;

    if (asked) {
        rmSync(join(folder, againFile), { force: true });
    }

    return asked;
}

const seatFile = "play.json";
const againFile = "play-again.json";

function seatHeld(folder: string, alive: (pid: number) => boolean): Seat | undefined
{
    const seat = seatIn(folder);
    return seat !== undefined && alive(seat.pid) ? seat : undefined;
}

function seatIn(folder: string): Seat | undefined
{
    const seat = jsonIn(join(folder, seatFile)) as { pid?: unknown; host?: unknown; } | undefined;
    return typeof seat?.pid === "number" && typeof seat.host === "string" ? { pid: seat.pid, host: seat.host } : undefined;
}

function jsonIn(path: string): unknown
{
    try {
        return JSON.parse(readFileSync(path, "utf8")) as unknown;
    } catch {
        return undefined;
    }
}

// Signal 0 only asks whether the process is there; EPERM says it is, another user's.
function isAlive(pid: number): boolean
{
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return (error as NodeJS.ErrnoException).code === "EPERM";
    }
}
