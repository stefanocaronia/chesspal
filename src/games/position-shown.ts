// The position a hook showed a chat outside its server (D-71), and the player's words on the board page it gave with it: `chesspal prompt` notes them
// after playing the move the player wrote alone, and the chat's server takes them before its next tool, so that the AI moves without asking for status
// and no tool gives those words again.
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { writeAtomically } from "./files.ts";

/**
 * The position shown to a chat by its session, as the host names it to its hooks: the game by its start, none when there is none, its plies, when, and the
 * keys of the player's words given with it.
 */
export interface PositionShown
{
    readonly session: string;
    readonly started?: string;
    readonly plies: number;
    readonly at: string;
    readonly given: readonly string[];
}

/** Notes the position shown to a chat, over the last one. */
export function notePositionShown(folder: string, shown: PositionShown): void
{
    writeAtomically(join(folder, fileName), `${JSON.stringify(shown)}\n`);
}

/** The position a hook showed a chat of the folder, or undefined when there is no note, or it cannot be read. */
export function positionShownNote(folder: string): PositionShown | undefined
{
    try {
        const shown = JSON.parse(readFileSync(join(folder, fileName), "utf8")) as Partial<PositionShown>;

        if (typeof shown.session !== "string" || typeof shown.at !== "string" || !Number.isInteger(shown.plies)) {
            return undefined;
        }

        // A note of an older Chesspal has no words.
        const given = Array.isArray(shown.given) ? shown.given.filter((key): key is string => typeof key === "string") : [];
        return { session: shown.session, ...(typeof shown.started === "string" ? { started: shown.started } : {}), plies: shown.plies!, at: shown.at, given };
    } catch {
        return undefined;
    }
}

/** Forgets the note; one that cannot go now is taken again, which changes nothing, or dropped once the game has moved on. */
export function forgetPositionShown(folder: string): void
{
    try {
        rmSync(join(folder, fileName), { force: true });
    } catch {
        // Another process holds it for a moment.
    }
}

const fileName = "position-shown.json";
