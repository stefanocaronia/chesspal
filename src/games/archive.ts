// The finished games, as PGN in games/ (D-9, D-41), with the AI's plans for the analyst (D-21).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type GameRecord, pgnDate, readPgn, writePgn } from "../core/index.ts";
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

/** Archives a game that has ended: its name in the archive or, when that fails, a warning, since the game is saved in game.json all the same. */
export function archiveEnded(folder: string, current: CurrentGame): { archive?: string; warning?: string; }
{
    try {
        return { archive: archiveGame(folder, current) };
    } catch (error) {
        return { warning: `${(error as Error).message} The game is saved in game.json: it goes to the archive when a new game starts.` };
    }
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

/** The names of the games in the archive, the latest first: games/2026-11-02-153012.pgn. */
export function archivedGames(folder: string): string[]
{
    try {
        return readdirSync(join(folder, "games")).filter((name) => namePattern.test(name)).sort().reverse().map((name) => `games/${name}`);
    } catch {
        return [];
    }
}

/** A game of the archive by its name, as listed; refused when it is not there, or cannot be read. */
export function archivedGame(folder: string, name: string): GameRecord
{
    const file = name.replace(/^games\//, "");

    if (!namePattern.test(file)) {
        throw new Error(`${name} is no game of the archive: give a name as the list of past games writes it, such as games/2026-11-02-153012.pgn.`);
    }

    let text: string;

    try {
        text = readFileSync(join(folder, "games", file), "utf8");
    } catch {
        throw new Error(`There is no ${name} in the archive: give a name as the list of past games writes it.`);
    }

    const [record] = readPgn(text);

    if (record === undefined) {
        throw new Error(`${name} holds no game Chesspal can read.`);
    }

    return record;
}

/** When an archived game started, from its name, in the player's time: 2026-11-02 15:30. */
export function archivedWhen(name: string): string
{
    const [, day, hour, minute] = /(\d{4}-\d{2}-\d{2})-(\d{2})(\d{2})/.exec(name) ?? [];
    return day === undefined ? name : `${day} ${hour}:${minute}`;
}

const namePattern = /^\d{4}-\d{2}-\d{2}-\d{6}\.pgn$/;

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
