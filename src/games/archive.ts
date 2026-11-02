// The finished games, as PGN in games/ (D-9, D-41), with the AI's plans for the analyst (D-21).
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { type GameRecord, pgnDate, writePgn } from "../core/index.ts";
import { type CurrentGame, endOf } from "./current-game.ts";
import { makeFolder, writeAtomically } from "./files.ts";
import { withoutPlans } from "./plans.ts";

/** Where the game goes in the archive, in the player's folder: named by when it started, in the player's time, games/2026-11-02-153012.pgn. */
export function archiveName(current: CurrentGame): string
{
    return nameAt(new Date(current.started));
}

/**
 * When a new game starts: now, or the first second after it whose name in the archive is free and is not the game before's, which goes there later. Two
 * games started in the same second, when summer time ends or with the clock set back would otherwise share a name.
 */
export function startOfNewGame(folder: string, now: Date, before?: CurrentGame): Date
{
    const taken = before === undefined ? undefined : archiveName(before);
    let start = now;

    while (nameAt(start) === taken || existsSync(join(folder, nameAt(start)))) {
        start = new Date(start.getTime() + 1_000);
    }

    return start;
}

/** Writes the game to the archive, with the plans and how it ended, and gives its name; the same game again rewrites the same file. */
export function archiveGame(folder: string, current: CurrentGame): string
{
    const name = archiveName(current);
    const path = join(folder, name);

    try {
        makeFolder(dirname(path));
        writeAtomically(path, writePgn(endedRecord(current)));
    } catch (error) {
        throw new Error(`Chesspal could not archive the game: ${(error as Error).message}`, { cause: error });
    }

    return name;
}

/** The name of a game over in the archive, when it is there. */
export function archivedName(folder: string, current: CurrentGame): string | undefined
{
    if (endOf(current.game) === undefined) {
        return undefined;
    }

    const name = archiveName(current);
    return existsSync(join(folder, name)) ? name : undefined;
}

/** The game as PGN for the player: while it goes on, without the AI's plans (D-29). */
export function playerPgn(current: CurrentGame): string
{
    return writePgn(endOf(current.game) === undefined ? withoutPlans(current.game.record) : endedRecord(current));
}

function nameAt(date: Date): string
{
    const time = date.toTimeString().slice(0, 8).replaceAll(":", "");
    return `games/${pgnDate(date).replaceAll(".", "-")}-${time}.pgn`;
}

/** The record with its Termination tag, when the board ended the game and the tag is missing. */
function endedRecord({ game }: CurrentGame): GameRecord
{
    const { record, outcome } = game;
    return outcome.over && record.tags.Termination === undefined ? { ...record, tags: { ...record.tags, Termination: outcome.ending } } : record;
}
