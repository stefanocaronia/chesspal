// The finished games, as PGN in games/ (D-9, D-41), with the AI's plans for the analyst (D-21); and the games played elsewhere, kept to study in study/ (D-68).
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { type GameRecord, movesOnly, pgnDate, readPgn, readPgnTags, readPgnUnplayed, unsigned, withAiHost, withAiModel, writePgn } from "../core/index.ts";
import { aiHostOf, aiModelOf } from "./ai-model.ts";
import { coachWords, withCoach } from "./coach.ts";
import { type CurrentGame, endOf, loadGame } from "./current-game.ts";
import { makeFolder, writeAtomically } from "./files.ts";
import { withoutPlans } from "./plans.ts";

/** Where the game goes in the archive, in the player's folder: named by when it started, in the player's time, games/2026-11-02-153012.pgn. */
export function archiveName(current: CurrentGame): string
{
    return nameAt(new Date(current.started));
}

/** Whether the game over still in game.json is this one of the archive, named as listed; a game.json Chesspal cannot read is no game. */
export function isOverOnTable(folder: string, name: string): boolean
{
    try {
        const current = loadGame(folder);
        return current !== undefined && endOf(current.game) !== undefined && archiveName(current) === name;
    } catch {
        return false;
    }
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
 * Writes the game to the archive, with the plans, how it ended, the AI's model and host last noted (D-82, D-97) and the opening's tags, and gives its name;
 * the same game again rewrites the same file. A game closed before any move is not kept, as Lichess aborts it: none.
 */
export function archiveGame(folder: string, current: CurrentGame, opening: OpeningTags): string | undefined
{
    if (current.game.record.moves.length === 0) {
        return undefined;
    }

    const name = archiveName(current);
    const path = join(folder, name);

    try {
        makeFolder(dirname(path));
        writeAtomically(path, writePgn(withListTags(withAiHost(withAiModel(endedRecord(folder, current), aiModelOf(folder)), aiHostOf(folder)), opening)));
    } catch (error) {
        throw new Error(`Chesspal could not archive the game: ${(error as Error).message}`, { cause: error });
    }

    return name;
}

/**
 * Archives a game that has ended: its name in the archive, none for a game closed before any move, or, when that fails, a warning, since the game is saved in
 * game.json all the same.
 */
export function archiveEnded(folder: string, current: CurrentGame, opening: OpeningTags): { archive?: string; warning?: string; }
{
    try {
        const archive = archiveGame(folder, current, opening);
        return archive === undefined ? {} : { archive };
    } catch (error) {
        return { warning: `${(error as Error).message} The game is saved in game.json: it goes to the archive when a new game starts.` };
    }
}

/**
 * Writes the coach's judgments into a game over already in the archive, beside what the analyst may have written there since (Federico);
 * archives the game when it is not there.
 */
export function archiveCoached(folder: string, current: CurrentGame, opening: OpeningTags): { archive?: string; warning?: string; }
{
    const name = archivedName(folder, current);

    if (name === undefined) {
        return archiveEnded(folder, current, opening);
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

/**
 * The opening a game reached, in its ECO and Opening tags, as the commands name it: none from another position or outside the book. With the PlyCount the
 * archive adds, a game is listed from its tags alone.
 */
export interface OpeningTags
{
    readonly ECO?: string;
    readonly Opening?: string;
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

/** A game of the archive by its name, as listed, with its moves as written, neither checked nor played: for its tags and comments, quickly. */
export function archivedGameUnplayed(folder: string, name: string): GameRecord
{
    const [record] = readPgnUnplayed(gameText(folder, "games", name));

    if (record === undefined) {
        throw new Error(`${name} holds no game Chesspal can read.`);
    }

    return record;
}

/** The tags of a game of the archive by its name, as listed, read without its moves; refused as archivedGame refuses. */
export function archivedTags(folder: string, name: string): Readonly<Record<string, string>>
{
    return readPgnTags(gameText(folder, "games", name));
}

/**
 * Whether the archive wrote a game's list tags, its PlyCount with its ECO and Opening, or none for a game that has no opening: a numeric PlyCount says so.
 * A game an older Chesspal archived has none, and is read whole.
 */
export function hasListTags(tags: Readonly<Record<string, string>>): boolean
{
    return /^\d+$/.test(tags.PlyCount ?? "");
}

/** The refusal of a game asked by a name no game has, apart from a game that is there and cannot be read. */
export class GameMissing extends Error
{
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
    const path = listedPath(folder, name, "to write again");

    try {
        writeAtomically(path, writePgn(record));
    } catch (error) {
        throw new Error(`Chesspal could not write ${name}: ${(error as Error).message}`, { cause: error });
    }
}

/** Deletes a game of a profile, played or kept to study, by its name as listed (D-92), its review with it. */
export function deleteGame(folder: string, name: string): void
{
    const path = listedPath(folder, name, "to delete");

    try {
        rmSync(path);
    } catch (error) {
        throw new Error(`Chesspal could not delete ${name}: ${(error as Error).message}`, { cause: error });
    }
}

/** The file of a game by its name as listed, games/… or study/…; refused when there is none, saying what it was wanted for. */
function listedPath(folder: string, name: string, wanted: string): string
{
    const [, shelf, file] = /^(games|study)\/(.*)$/.exec(name) ?? [];

    if (shelf === undefined || !namePattern.test(file ?? "") || !existsSync(join(folder, name))) {
        throw new Error(`There is no ${name} ${wanted}: give a game's name as past_games or study_games writes it.`);
    }

    return join(folder, name);
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
    const [record] = readPgn(gameText(folder, shelf, name));

    if (record === undefined) {
        throw new Error(`${name} holds no game Chesspal can read.`);
    }

    return record;
}

function gameText(folder: string, shelf: Shelf, name: string): string
{
    // The name as listed, or without its folder or its .pgn.
    const file = `${(name.startsWith(`${shelf}/`) ? name.slice(shelf.length + 1) : name).trim().replace(/\.pgn$/, "")}.pgn`;
    const { what, list } = shelves[shelf];

    if (!namePattern.test(file)) {
        throw new GameMissing(`${name} is no game ${what}: give a name as ${list} writes it, such as ${shelf}/2026-11-02-153012.pgn.`);
    }

    try {
        return readFileSync(join(folder, shelf, file), "utf8");
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;

        // Only a file that is not there is a missing game: one busy or locked by another process is there, and may be read in a moment.
        if (code === "ENOENT") {
            throw new GameMissing(`There is no ${name} among the games ${what}: give a name as ${list} writes it.`);
        }

        throw new Error(`${name} could not be read (${code ?? (error as Error).message}): try again in a moment.`, { cause: error });
    }
}

/** Whether two records are the same game: the same tags and the same moves, whatever their comments say. */
function sameGame(one: GameRecord | undefined, other: GameRecord | undefined): boolean
{
    // Who signed a review is not the game: one the AI reviewed, or brought again with Lichess's Annotator, is the one kept.
    const shape = (record: GameRecord | undefined): string => JSON.stringify([record === undefined ? undefined : unsigned(record.tags), record?.moves.map((move) => move.san)]);
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

/** The record with the tags past_games lists it from: the opening's, the commands' alone whatever the game brought, and how many plies it has. */
function withListTags(record: GameRecord, opening: OpeningTags): GameRecord
{
    const tags = Object.fromEntries(Object.entries(record.tags).filter(([name]) => name !== "ECO" && name !== "Opening" && name !== "PlyCount"));
    return { ...record, tags: { ...tags, ...opening, PlyCount: String(record.moves.length) } };
}

function withTermination(record: GameRecord, outcome: CurrentGame["game"]["outcome"]): GameRecord
{
    return outcome.over && record.tags.Termination === undefined ? { ...record, tags: { ...record.tags, Termination: outcome.ending } } : record;
}
