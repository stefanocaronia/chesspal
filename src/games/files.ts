// Writing the player's files safely: whole or not at all, with failures that say what to do (D-27).
import { mkdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";

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
