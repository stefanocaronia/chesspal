// Writing the player's files safely: whole or not at all, with failures that say what to do (D-27).
import { mkdirSync, renameSync, rmdirSync, rmSync, statSync, writeFileSync } from "node:fs";

/** Writes a file whole or not at all: a temporary file beside it, then renamed over it (D-27). A failure says what to do about it. */
export function writeAtomically(path: string, text: string | Uint8Array): void
{
    const temporary = `${path}.${process.pid}.tmp`;

    try {
        writeFileSync(temporary, text);
        renameOver(temporary, path);
    } catch (error) {
        throw new Error(problemOf(error as NodeJS.ErrnoException, path), { cause: error });
    } finally {
        rmSync(temporary, { force: true });
    }
}

/**
 * Runs `write` while this process alone holds the file's lock, a folder beside it made only if missing, cheaper than a file on Windows: another process
 * waits, a second at most. A lock older than two seconds is of a process that stopped while it held it, and goes.
 */
export function whileLocked<T>(path: string, write: () => T): T
{
    const lock = `${path}.lock`;

    for (let attempt = 1;; attempt++) {
        try {
            mkdirSync(lock);
            break;
        } catch (error) {
            // Windows refuses to make a folder another process is deleting: the lock is still held.
            if (!["EEXIST", "EPERM", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")) {
                throw new Error(`${lock} could not be made (${(error as Error).message}): check that its folder can be written.`, { cause: error });
            }

            if (isStale(lock)) {
                rmSync(lock, { recursive: true, force: true });
            } else if (attempt === lockAttempts) {
                throw new Error(`${lock} is held by another Chesspal writing the game: try again in a moment, or delete that folder when no Chesspal runs.`);
            } else {
                Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
            }
        }
    }

    try {
        return write();
    } finally {
        rmdirSync(lock);
    }
}

/** Makes a folder, and those above it, when missing. A failure says what to do about it. */
export function makeFolder(path: string): void
{
    try {
        mkdirSync(path, { recursive: true });
    } catch (error) {
        throw new Error(`${path} could not be made (${(error as Error).message}): check that it is a folder, and can be written.`, { cause: error });
    }
}

/** A stamp of a file that changes whenever it is written, whoever writes it; undefined when there is none. */
export function stampOf(path: string): string | undefined
{
    // The file's id changes at every rename: a write within the same tick of the clock, and of the same size, is seen too.
    const stats = statSync(path, { bigint: true, throwIfNoEntry: false });
    return stats === undefined ? undefined : `${stats.ino}:${stats.mtimeNs}:${stats.size}`;
}

const attempts = 10;

// A lock is waited for 5 ms at a time, a second at most; one older than two seconds is of a process that stopped while it held it.
const lockAttempts = 200;
const staleLock = 2_000;

function isStale(lock: string): boolean
{
    const stats = statSync(lock, { throwIfNoEntry: false });
    return stats !== undefined && Date.now() - stats.mtimeMs > staleLock;
}

/**
 * Renames a file or a folder. Windows refuses while another program holds a file in it open (an editor, an antivirus, a sync client): Chesspal waits a
 * little and tries again, half a second at most.
 */
export function renameOver(from: string, to: string): void
{
    for (let attempt = 1;; attempt++) {
        try {
            renameSync(from, to);
            return;
        } catch (error) {
            if (attempt === attempts || !isHeld(error as NodeJS.ErrnoException)) {
                throw error;
            }

            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10 * attempt);
        }
    }
}

function isHeld(error: NodeJS.ErrnoException): boolean
{
    return error.syscall === "rename" && (error.code === "EPERM" || error.code === "EACCES" || error.code === "EBUSY");
}

function problemOf(error: NodeJS.ErrnoException, path: string): string
{
    if (isHeld(error)) {
        return `${path} is held open by another program, or is read-only (${error.code}, ${attempts} tries): close that program, or make the file writable.`;
    }

    return `${path} could not be written (${error.message}): check that its folder can be written.`;
}
