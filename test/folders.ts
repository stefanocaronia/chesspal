import { rmSync } from "node:fs";

/** Removes a test's folder; a process that has just ended may still hold it on Windows, so it tries again for up to five seconds. */
export async function removeFolder(folder: string): Promise<void>
{
    for (let tried = 1;; tried++) {
        try {
            rmSync(folder, { recursive: true, force: true });
            return;
        } catch (error) {
            if (tried === tries || !held.has((error as NodeJS.ErrnoException).code ?? "")) {
                throw error;
            }

            await new Promise((done) => setTimeout(done, wait));
        }
    }
}

// What Windows answers while another process holds a folder or a file in it.
const held = new Set(["EBUSY", "EPERM", "ENOTEMPTY"]);
const tries = 50;
const wait = 100;
