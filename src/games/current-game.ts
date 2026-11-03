// The player's current game on disk (D-27, D-41): game.json, its PGN and the talk on the board page inside, written whole at every change, and kept in
// memory while nobody else changes it.
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { type Clock, Game, readPgn, type Side, writePgn } from "../core/index.ts";
import { writeAtomically } from "./files.ts";

/** The player's current game, going on or over: the live game, and what game.json keeps beside its PGN. */
export interface CurrentGame
{
    readonly game: Game;
    /** The side the AI plays. */
    readonly ai: Side;
    /** When the game started, as an ISO date: it names the game in the archive. */
    readonly started: string;
    /** What the player and the AI said on the board page, beside the PGN and never in the archive (D-51). */
    readonly talk: TalkLine[];
    /** The clock, in a game with a time control (D-13). */
    readonly clock?: Clock;
}

/** Who speaks on the board page. */
export type Speaker = "player" | "ai";

/** A line said on the board page: who said it, its words, how many moves the game had then, and when, as an ISO date. */
export interface TalkLine
{
    readonly who: Speaker;
    readonly text: string;
    readonly ply: number;
    readonly at: string;
}

/** How a game ended: its result, and why when the record says it or the board decided it. */
export interface GameEnd
{
    readonly result: string;
    readonly termination?: string;
}

/** The current game of a folder, as it is on disk, or undefined when there is none. A game.json Chesspal cannot read throws: nothing overwrites it. */
export function loadGame(folder: string): CurrentGame | undefined
{
    const path = join(folder, fileName);
    const stamp = stampOf(path);

    if (stamp === undefined) {
        kept.delete(path);
        return undefined;
    }

    const known = kept.get(path);

    if (known?.stamp === stamp) {
        return known.current;
    }

    const current = parsed(readFileSync(path, "utf8"), path);
    kept.set(path, { stamp, current });
    return current;
}

/** Writes the current game to game.json, whole or not at all; from then on it is the one kept in memory. */
export function saveGame(folder: string, current: CurrentGame): void
{
    const path = join(folder, fileName);
    const file: GameFile = {
        format: 1,
        ai: current.ai,
        started: current.started,
        pgn: writePgn(current.game.record),
        ...(current.talk.length === 0 ? {} : { talk: current.talk }),
        ...(current.clock === undefined ? {} : { clock: savedClockOf(current.clock) }),
    };

    try {
        writeAtomically(path, `${JSON.stringify(file, null, 2)}\n`);
    } catch (error) {
        // The live game may hold a move the file does not: the next call reads the file again.
        kept.delete(path);
        throw new Error(`Chesspal could not save the game: ${(error as Error).message} Nothing changed.`, { cause: error });
    }

    kept.set(path, { stamp: stampOf(path) ?? "", current });
}

/** How the game ended, or undefined while it goes on: by the board, or by what the record says, such as a resignation. */
export function endOf(game: Game): GameEnd | undefined
{
    const { tags } = game.record;
    const { outcome } = game;

    if (tags.Result === undefined || tags.Result === "*") {
        return undefined;
    }

    const termination = tags.Termination ?? (outcome.over ? outcome.ending : undefined);
    return termination === undefined ? { result: tags.Result } : { result: tags.Result, termination };
}

const fileName = "game.json";

const savedLine = z.object({ who: z.enum(["player", "ai"]), text: z.string(), ply: z.int().min(0), at: z.iso.datetime() });
const savedClock = z.object({ base: z.int().positive(), increment: z.int().min(0), white: z.number().min(0), black: z.number().min(0), since: z.iso.datetime() });
const gameFile = z.object({
    format: z.literal(1),
    ai: z.enum(["white", "black"]),
    started: z.iso.datetime(),
    pgn: z.string(),
    talk: z.array(savedLine).optional(),
    clock: savedClock.optional(),
});
type GameFile = z.infer<typeof gameFile>;

// The games read or written in this process, by their file, with the file's stamp then: a call reads a file again only when another process changed it.
const kept = new Map<string, { stamp: string; current: CurrentGame; }>();

function stampOf(path: string): string | undefined
{
    // The file's id changes at every rename: a write within the same tick of the clock, and of the same size, is seen too.
    const stats = statSync(path, { bigint: true, throwIfNoEntry: false });
    return stats === undefined ? undefined : `${stats.ino}:${stats.mtimeNs}:${stats.size}`;
}

function parsed(text: string, path: string): CurrentGame
{
    try {
        const file = gameFile.parse(JSON.parse(text));
        const records = readPgn(file.pgn);
        const [record] = records;

        if (record === undefined || records.length > 1) {
            throw new Error(`its PGN holds ${records.length} games`);
        }

        const game = { game: new Game(record), ai: file.ai, started: file.started, talk: file.talk ?? [] };
        return file.clock === undefined ? game : { ...game, clock: clockOf(file.clock) };
    } catch (error) {
        throw new Error(`${path} is not a game Chesspal can read (${problemOf(error)}): ask the player to fix it or move it away, since Chesspal never overwrites it.`);
    }
}

/** The clock as game.json keeps it, flat, in milliseconds. */
function savedClockOf({ control, left, since }: Clock): z.infer<typeof savedClock>
{
    return { base: control.base, increment: control.increment, white: left.white, black: left.black, since };
}

function clockOf({ base, increment, white, black, since }: z.infer<typeof savedClock>): Clock
{
    return { control: { base, increment }, left: { white, black }, since };
}

function problemOf(error: unknown): string
{
    if (error instanceof z.ZodError) {
        return error.issues.map((issue) => `${issue.path.join(".") || "the file"}: ${issue.message}`).join("; ");
    }

    return (error as Error).message;
}
