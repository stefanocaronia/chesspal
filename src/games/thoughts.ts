// What the AI thought on the player's time (D-72): its answers to the player's likely replies, in thoughts.json beside game.json, hidden from the player
// as its plan is (D-29), and kept only for the position they were thought on: the next position's replace them.
import { readFileSync } from "node:fs";
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

/** The key of the position the player is to move in: the game, by its start, and how many moves it has. */
export function thoughtKey(current: CurrentGame, ply = current.game.record.moves.length): string
{
    return `${current.started}#${ply}`;
}

/**
 * Keeps a thought for a position, in place of one for the same reply; thoughts of another position go. The thoughts kept now. A thought kept while the AI
 * ponders shows it still at work.
 */
export function keepThought(folder: string, key: string, thought: Thought, now: Date): Thought[]
{
    const kept = keptAt(folder, key);
    const thoughts = [...kept.thoughts.filter((one) => one.reply !== thought.reply), thought];

    if (thoughts.length > mostThoughts) {
        throw new Error(`You have ${mostThoughts} thoughts for this position already: they are enough. Nothing changed.`);
    }

    write(folder, { ...kept, thoughts, ...(kept.pondering === undefined ? {} : { pondering: now.toISOString() }) });
    return thoughts;
}

/** The thought for the player's last move, when the AI is to move and thought of it on their time. */
export function thoughtForLastMove(folder: string, current: CurrentGame): Thought | undefined
{
    const { moves } = current.game.record;
    const last = moves.at(-1);
    return last === undefined ? undefined : keptAt(folder, thoughtKey(current, moves.length - 1)).thoughts.find((thought) => thought.reply === last.san);
}

/** Since when the AI has waited for the player's move in a position: the first time it asked, `now` then, kept with its thoughts. */
export function waitingSince(folder: string, key: string, now: Date): Date
{
    const kept = keptAt(folder, key);

    if (kept.since !== undefined) {
        return new Date(kept.since);
    }

    write(folder, { ...kept, since: now.toISOString() });
    return now;
}

/**
 * Notes whether the AI thinks on the player's time in a position now, from its first look until it waits for their move, for the page's sign: in the file,
 * since in Codex the agent that thinks has a process of its own (D-98).
 */
export function notePondering(folder: string, key: string, pondering: boolean, now: Date): void
{
    const { pondering: before, ...kept } = keptAt(folder, key);

    if (pondering) {
        write(folder, { ...kept, pondering: now.toISOString() });
    } else if (before !== undefined) {
        write(folder, kept);
    }
}

/**
 * Until when the AI is seen thinking on the player's time in a position, as noted: a while after its last look or thought, so that an agent stopped before
 * it waits (Esc, its host closed) does not leave the sign on until the player moves.
 */
export function ponderingUntil(folder: string, key: string): Date | undefined
{
    const kept = read(folder);
    return kept?.key === key && kept.pondering !== undefined ? new Date(new Date(kept.pondering).getTime() + ponderSignFor) : undefined;
}

/** Whether the AI thinks on the player's time in a position now, as noted. */
export function ponderingOn(folder: string, key: string, now: Date): boolean
{
    const until = ponderingUntil(folder, key);
    return until !== undefined && now < until;
}

// An agent thinks on one reply in well under this; one silent for longer has stopped.
const ponderSignFor = 5 * 60_000;

/** The most thoughts kept for a position: a few likely replies, not every legal one. */
const mostThoughts = 8;

const fileName = "thoughts.json";

const thoughtsFile = z.object({
    key: z.string(),
    thoughts: z.array(z.object({ reply: z.string(), move: z.string(), why: z.string() })),
    since: z.iso.datetime().optional(),
    // The time of the AI's last look or thought while it ponders.
    pondering: z.iso.datetime().optional(),
});

type ThoughtsFile = z.infer<typeof thoughtsFile>;

/** What is kept for a position: nothing yet when the file is for another, or missing. */
function keptAt(folder: string, key: string): ThoughtsFile
{
    const kept = read(folder);
    return kept?.key === key ? kept : { key, thoughts: [] };
}

function read(folder: string): ThoughtsFile | undefined
{
    try {
        return thoughtsFile.parse(JSON.parse(readFileSync(join(folder, fileName), "utf8")));
    } catch {
        // None yet, or one Chesspal cannot read: thoughts are only a help, and the next one written replaces it.
        return undefined;
    }
}

function write(folder: string, kept: ThoughtsFile): void
{
    writeAtomically(join(folder, fileName), `${JSON.stringify(kept, null, 2)}\n`);
}
