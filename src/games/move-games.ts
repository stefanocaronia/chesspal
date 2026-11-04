// The player's games moved to another folder, all or none: the first profile takes the games played before there were profiles (D-23).
import { existsSync, renameSync } from "node:fs";
import { join } from "node:path";

/** Moves the current game and the archive from one folder to another, when they are there; when one cannot move, what moved goes back, and it throws. */
export function moveGames(from: string, to: string): void
{
    const moved: string[] = [];

    try {
        for (const name of names) {
            if (existsSync(join(from, name))) {
                renameSync(join(from, name), join(to, name));
                moved.push(name);
            }
        }
    } catch (error) {
        // Each goes back on its own: one held by another program stays, and the message says where.
        const stuck = moved.filter((name) => !movedBack(join(to, name), join(from, name)));
        const where = stuck.length === 0 ? `they are still in ${from}` : `${stuck.join(" and ")} stayed in ${to}`;
        throw new Error(`The games in ${from} could not move to ${to} (${(error as Error).message}): ${where}. Close the programs that hold them, then try again.`, { cause: error });
    }
}

// The current game, and the archive of the finished ones.
const names = ["game.json", "games"];

function movedBack(path: string, back: string): boolean
{
    try {
        renameSync(path, back);
        return true;
    } catch {
        return false;
    }
}
