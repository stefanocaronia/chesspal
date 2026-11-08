// The finished games, as PGN in games/ (D-9, D-41), with the AI's plans for the analyst (D-21); and the games played elsewhere, kept to study in study/ (D-68).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type GameRecord, movesOnly, pgnDate, readPgn, withAiModel, writePgn } from "../core/index.ts";
import { aiModelOf } from "./ai-model.ts";
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

/**
 * Writes the game to the archive, with the plans, how it ended and the AI's model last noted (D-82), and gives its name; the same game again rewrites the
 * same file.
 */
export function archiveGame(folder: string, current: CurrentGame): string
{
    const name = archiveName(current);
    const path = join(folder, name);

    try {
        makeFolder(dirname(path));
        writeAtomically(path, writePgn(withAiModel(endedRecord(current), aiModelOf(folder))));
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
    return gameNames(folder, "games");
}

/** A game of the archive by its name, as listed; refused when it is not there, or cannot be read. */
export function archivedGame(folder: string, name: string): GameRecord
{
    return gameNamed(folder, "games", name);
}

/** The names of the games kept to study in a profile's folder, the latest kept first: study/2026-11-04-153012.pgn. */
export function keptGames(root: string): string[]
{
    return gameNames(root, "study");
}

/** A game kept to study by its name, as listed; refused when it is not there, or cannot be read. */
export function keptGame(root: string, name: string): GameRecord
{
    return gameNamed(root, "study", name);
}

/** When an archived game started, from its name, in the player's time: 2026-11-02 15:30. */
export function archivedWhen(name: string): string
{
    const [, day, hour, minute] = /(\d{4}-\d{2}-\d{2})-(\d{2})(\d{2})/.exec(name) ?? [];
    return day === undefined ? name : `${day} ${hour}:${minute}`;
}

/**
 * Keeps a game played elsewhere to study (D-68) in a profile's folder, apart from the games played here, and gives its name, by `now`:
 * study/2026-11-04-153012.pgn; the same game again keeps the name it has.
 */
export function keepToStudy(root: string, record: GameRecord, now: Date): string
{
    const text = writePgn(record);
    // The same game, whatever the review and the book's badges written on it since.
    const [written] = readPgn(text);
    const kept = keptGames(root).find((name) => sameGame(readPgn(readFileSync(join(root, name), "utf8"))[0], written));

    if (kept !== undefined) {
        return kept;
    }

    let name = nameAt(now, "study");

    for (let second = 1; existsSync(join(root, name)); second++) {
        name = nameAt(new Date(now.getTime() + second * 1_000), "study");
    }

    try {
        makeFolder(join(root, "study"));
        writeAtomically(join(root, name), text);
    } catch (error) {
        throw new Error(`Chesspal could not keep the game to study: ${(error as Error).message}`, { cause: error });
    }

    return name;
}

/** Writes again a game of a profile, played or kept to study, by its name as listed: with the AI's review (D-69). */
export function rewriteGame(folder: string, name: string, record: GameRecord): void
{
    const [, shelf, file] = /^(games|study)\/(.*)$/.exec(name) ?? [];

    if (shelf === undefined || !namePattern.test(file ?? "") || !existsSync(join(folder, name))) {
        throw new Error(`There is no ${name} to write again: give a game's name as past_games or study_games writes it.`);
    }

    try {
        writeAtomically(join(folder, name), writePgn(record));
    } catch (error) {
        throw new Error(`Chesspal could not write ${name}: ${(error as Error).message}`, { cause: error });
    }
}

// The games of a profile, played here or kept to study: each with how the AI lists them.
type Shelf = "games" | "study";
const shelves = { games: { what: "of the archive", list: "past_games" }, study: { what: "kept to study", list: "study_games" } };
const namePattern = /^\d{4}-\d{2}-\d{2}-\d{6}\.pgn$/;

function gameNames(folder: string, shelf: Shelf): string[]
{
    try {
        return readdirSync(join(folder, shelf)).filter((name) => namePattern.test(name)).sort().reverse().map((name) => `${shelf}/${name}`);
    } catch {
        return [];
    }
}

function gameNamed(folder: string, shelf: Shelf, name: string): GameRecord
{
    // The name as listed, or without its folder or its .pgn.
    const file = `${(name.startsWith(`${shelf}/`) ? name.slice(shelf.length + 1) : name).trim().replace(/\.pgn$/, "")}.pgn`;
    const { what, list } = shelves[shelf];

    if (!namePattern.test(file)) {
        throw new Error(`${name} is no game ${what}: give a name as ${list} writes it, such as ${shelf}/2026-11-02-153012.pgn.`);
    }

    let text: string;

    try {
        text = readFileSync(join(folder, shelf, file), "utf8");
    } catch {
        throw new Error(`There is no ${name} among the games ${what}: give a name as ${list} writes it.`);
    }

    const [record] = readPgn(text);

    if (record === undefined) {
        throw new Error(`${name} holds no game Chesspal can read.`);
    }

    return record;
}

/** The game as PGN for the player: while it goes on, without the AI's plans (D-29). */
export function playerPgn(current: CurrentGame): string
{
    return writePgn(endOf(current.game) === undefined ? withoutPlans(current.game.record) : endedRecord(current));
}

/** The game as PGN with its moves alone, without comments or plans, for Lichess or chess.com (T-59). */
export function movesPgn(current: CurrentGame): string
{
    return writePgn(movesOnly(endOf(current.game) === undefined ? current.game.record : endedRecord(current)));
}

/** Whether two records are the same game: the same tags and the same moves, whatever their comments say. */
function sameGame(one: GameRecord | undefined, other: GameRecord | undefined): boolean
{
    const shape = (record: GameRecord | undefined): string => JSON.stringify([record?.tags, record?.moves.map((move) => move.san)]);
    return one !== undefined && shape(one) === shape(other);
}

function nameAt(date: Date, shelf: Shelf = "games"): string
{
    const time = date.toTimeString().slice(0, 8).replaceAll(":", "");
    return `${shelf}/${pgnDate(date).replaceAll(".", "-")}-${time}.pgn`;
}

/** The record with its Termination tag, when the board ended the game and the tag is missing. */
function endedRecord({ game }: CurrentGame): GameRecord
{
    const { record, outcome } = game;
    return outcome.over && record.tags.Termination === undefined ? { ...record, tags: { ...record.tags, Termination: outcome.ending } } : record;
}
