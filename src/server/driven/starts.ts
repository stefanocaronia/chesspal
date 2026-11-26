// The programs of the chats the table opens start one at a time: two that start together may renew the player's sign-in together, and one of them lose it.
// A program of a role starts only once the one before of the same role has exited: no role ever has two programs alive together.
import type { LineProcess, startLineProcess } from "../../hosts/index.ts";

/** How a host's program starts, as its driver takes it. */
export type ProgramStart = typeof startLineProcess;

/** A turn to start a program: `opened` once it said which chat it is, sat at its place, or failed, lets the next start. */
export interface StartTurn
{
    opened(): void;
}

/** The starts of the table's chats, in the order they are asked for. */
export interface Starts
{
    /** Waits for the program of `role` before to have exited, then for the start before to have opened, each for its longest at most. */
    next(role: string): Promise<StartTurn>;
    /** How a program of `role` starts, its exit heard: whether it ended by itself or was stopped. */
    starter(role: string): ProgramStart;
}

/** How long a start waits for the one before to open, and for the program before of its role to exit, in ms; the start itself, injected in tests. */
export interface StartsOptions
{
    readonly start: ProgramStart;
    readonly longest?: number;
    readonly exitLongest?: number;
}

/**
 * Starts one at a time, each let go after `longest` milliseconds at most: one that never says which chat it is holds the others no longer. A program let go
 * ends by itself within the driver's grace, or is stopped then: `exitLongest` is longer, and only a program never closed holds its role's next start that long.
 */
export function oneByOne({ start, longest = 20_000, exitLongest = 15_000 }: StartsOptions): Starts
{
    let last: Promise<void> = Promise.resolve();
    const alive = new Map<string, number>();
    const waiting = new Map<string, (() => void)[]>();

    const exited = (role: string): void => {
        const left = (alive.get(role) ?? 1) - 1;

        if (left > 0) {
            alive.set(role, left);
            return;
        }

        alive.delete(role);
        waiting.get(role)?.splice(0).forEach((done) => done());
    };

    const gone = (role: string): Promise<void> => {
        if ((alive.get(role) ?? 0) === 0) {
            return Promise.resolve();
        }

        return new Promise((done) => {
            const timer = setTimeout(done, exitLongest);
            timer.unref();
            waiting.set(role, [...(waiting.get(role) ?? []), () => {
                clearTimeout(timer);
                done();
            }]);
        });
    };

    const queued = (): Promise<StartTurn> => {
        let opened = (): void => undefined;
        const done = new Promise<void>((resolve) => (opened = resolve));
        const before = last;
        last = done;
        return before.then(() => {
            const timer = setTimeout(opened, longest);
            timer.unref();
            return {
                opened: () => {
                    clearTimeout(timer);
                    opened();
                },
            };
        });
    };

    return {
        next: async (role) => {
            await gone(role);
            return queued();
        },
        starter: (role) => (command, args, options) => {
            const program = start(command, args, options);
            alive.set(role, (alive.get(role) ?? 0) + 1);
            return heardEnd(program, () => exited(role));
        },
    };
}

/** The program, `ended` told once it exited by itself or was stopped; its own end told to its listener as before. */
function heardEnd(program: LineProcess, ended: () => void): LineProcess
{
    let heard = false;
    let listener: ((reason: string) => void) | undefined;
    let reason: string | undefined;
    let told = false;

    const end = (): void => {
        if (!heard) {
            heard = true;
            ended();
        }
    };

    const tell = (): void => {
        if (!told && reason !== undefined && listener !== undefined) {
            told = true;
            listener(reason);
        }
    };

    program.onEnd((why) => {
        end();
        reason = why;
        tell();
    });
    return {
        get pid()
        {
            return program.pid;
        },
        write: (line) => program.write(line),
        closeInput: () => program.closeInput(),
        onLine: (heardLine) => program.onLine(heardLine),
        onEnd: (given) => {
            listener = given;
            tell();
        },
        stop: () => {
            // A program stopped tells no end: it is taken for gone.
            program.stop();
            end();
        },
    };
}
