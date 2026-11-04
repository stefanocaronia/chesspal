// What the AI thought on the player's time (D-72): its answers to the player's likely replies, in thoughts.json beside game.json, hidden from the player
// as its plan is (D-29), and kept only for the position they were thought on.
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { CurrentGame } from "./current-game.ts";
import { writeAtomically } from "./files.ts";

/** The AI's answer to one reply of the player's: the reply and its move in SAN, and why in one sentence. */
export interface Thought
{
    readonly reply: string;
    readonly move: string;
    readonly why: string;
}

/** The most thoughts kept for a position: a few likely replies, not every legal one. */
export const mostThoughts = 8;

/** The key of the position the player is to move in: the game, by its start, and how many moves it has. */
export function thoughtKey(current: CurrentGame, ply = current.game.record.moves.length): string
{
    return `${current.started}#${ply}`;
}

/** The thoughts kept for a position, none when there are none for it. */
export function thoughtsAt(folder: string, key: string): Thought[]
{
    const kept = read(folder);
    return kept?.key === key ? kept.thoughts : [];
}

/** Keeps a thought for a position, in place of one for the same reply; thoughts of another position go. The thoughts kept now. */
export function keepThought(folder: string, key: string, thought: Thought): Thought[]
{
    const thoughts = [...thoughtsAt(folder, key).filter((one) => one.reply !== thought.reply), thought];

    if (thoughts.length > mostThoughts) {
        throw new Error(`You have ${mostThoughts} thoughts for this position already: they are enough. Nothing changed.`);
    }

    writeAtomically(join(folder, fileName), `${JSON.stringify({ key, thoughts }, null, 2)}\n`);
    return thoughts;
}

/** The thought for the player's last move, when the AI is to move and thought of it on their time. */
export function thoughtForLastMove(folder: string, current: CurrentGame): Thought | undefined
{
    const { moves } = current.game.record;
    const last = moves.at(-1);
    return last === undefined ? undefined : thoughtsAt(folder, thoughtKey(current, moves.length - 1)).find((thought) => thought.reply === last.san);
}

/** Forgets every thought: the AI has moved, and they were for a position gone. */
export function forgetThoughts(folder: string): void
{
    rmSync(join(folder, fileName), { force: true });
}

const fileName = "thoughts.json";

const thoughtsFile = z.object({ key: z.string(), thoughts: z.array(z.object({ reply: z.string(), move: z.string(), why: z.string() })) });

function read(folder: string): z.infer<typeof thoughtsFile> | undefined
{
    try {
        return thoughtsFile.parse(JSON.parse(readFileSync(join(folder, fileName), "utf8")));
    } catch {
        // None yet, or one Chesspal cannot read: thoughts are only a help, and the next one written replaces it.
        return undefined;
    }
}
