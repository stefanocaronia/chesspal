// The finished games, as PGN in games/ (D-9, D-41), with the AI's plans for the analyst (D-21); and the games played elsewhere, kept to study in study/ (D-68).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type GameRecord, movesOnly, pgnDate, readPgn, withAiModel, writePgn } from "../core/index.ts";
import { aiModelOf } from "./ai-model.ts";
import { coachWords, withCoach } from "./coach.ts";
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
        writeAtomically(path, writePgn(withAiModel(endedRecord(folder, current), aiModelOf(folder))));
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

/**
 * Writes the coach's judgments into a game over already in the archive, beside what the analyst may have written there since (Federico);
 * archives the game when it is not there.
 */
export function archiveCoached(folder: string, current: CurrentGame): { archive?: string; warning?: string; }
{
    const name = archivedName(folder, current);

    if (name === undefined) {
        return archiveEnded(folder, current);
    }

    try {
        writeAtomically(join(folder, name), writePgn(withCoach(archivedGame(folder, name), coachWords(folder, current))));
        return { archive: name };
    } catch (error) {
        return { warning: `Chesspal could not write the coach's words into ${name}: ${(error as Error).message}` };
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
    const stem = gameStemOf(name);
    return stem === undefined ? name : `${stem.slice(0, 10)} ${stem.slice(11, 13)}:${stem.slice(13, 15)}`;
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
// A game's name is the time it started, 2026-11-02-153012, with .pgn, in its shelf's folder (D-41): the only place that writes the format.
const stemPattern = /\d{4}-\d{2}-\d{2}-\d{6}/;
const namePattern = new RegExp(`^${stemPattern.source}\\.pgn$`);
const listedPattern = new RegExp(`^\\s*(?:(games|study)/)?(${stemPattern.source})(\\.pgn)?\\s*$`);

/** The time a game's name holds, 2026-11-02-153012, wherever it is in the text; undefined when there is none. */
export function gameStemOf(name: string): string | undefined
{
    return stemPattern.exec(name)?.[0];
}

/** Whether a text is a game's name as the lists write it, games/2026-11-02-153012.pgn, with or without its folder. */
export function isGameName(text: string): boolean
{
    return new RegExp(listedPattern.source, "i").exec(text)?.[3] !== undefined;
}

/**
 * A game's name as the lists write it, from a name without its folder or its .pgn too: 2026-11-04-173054 is games/2026-11-04-173054.pgn, or the game kept
 * to study by that name when no game played has it; any other name as it is, for the archive to refuse.
 */
export function listedName(folder: string, name: string): string
{
    const [, shelf, stem] = listedPattern.exec(name) ?? [];

    if (stem === undefined) {
        return name;
    }

    if (shelf !== undefined) {
        return `${shelf}/${stem}.pgn`;
    }

    const played = `games/${stem}.pgn`;
    const kept = `study/${stem}.pgn`;
    return !archivedGames(folder).includes(played) && keptGames(folder).includes(kept) ? kept : played;
}

/** The game as PGN for the player: while it goes on, without the AI's plans (D-29); once over, with the coach's judgments too (D-88). */
export function playerPgn(folder: string, current: CurrentGame): string
{
    return writePgn(endOf(current.game) === undefined ? withoutPlans(current.game.record) : endedRecord(folder, current));
}

/** The game as PGN with its moves alone, without comments or plans, for Lichess or chess.com. */
export function movesPgn(current: CurrentGame): string
{
    const { record, outcome } = current.game;
    return writePgn(movesOnly(endOf(current.game) === undefined ? record : withTermination(record, outcome)));
}

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

/** The record of a game over with the coach's judgments (D-88), and its Termination tag when the board ended the game and the tag is missing. */
function endedRecord(folder: string, current: CurrentGame): GameRecord
{
    const { record, outcome } = current.game;
    return withTermination(withCoach(record, coachWords(folder, current)), outcome);
}

function withTermination(record: GameRecord, outcome: CurrentGame["game"]["outcome"]): GameRecord
{
    return outcome.over && record.tags.Termination === undefined ? { ...record, tags: { ...record.tags, Termination: outcome.ending } } : record;
}
