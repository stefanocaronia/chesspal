// A game to study (D-68): one that is over, played here or kept to study, and any position of it, by its moves as the analysis numbers them. While a game
// goes on, nothing is studied: the analysis would help the game being played (D-60, D-62).
import { z } from "zod";
import { Game, type GameRecord } from "../core/index.ts";
import { archivedGame, archivedGames, archivedName, type CurrentGame, endOf, gameInAnalysis, keptGame, listedName, type Shown } from "../games/index.ts";
import { gameFolder } from "../profiles/index.ts";
import { gameAt } from "./clock.ts";
import type { Context } from "./context.ts";
import { colourName } from "./view.ts";

/** What look and position take to show any position of a game that is over. */
export const studyInput = {
    game: z.string().optional().describe("a game's name, as past_games, study_games or analyse_game writes it: one of its positions; without it, the game on the board page"),
    move: z.string().optional().describe("the position after this move of a game over, as analyse_game numbers it: 12. for White's, 12... for Black's"),
};

/** A game to study: its record, and its name in the archive when it is there. */
export interface Studied
{
    readonly record: GameRecord;
    readonly name?: string;
}

/** A position of a game: the game as it stood after a move, and that move as the analysis writes it (12...Kf8); none at the start. */
export interface StudiedPosition
{
    readonly game: Game;
    readonly move?: string;
}

/** The current game when it is over, or none; refused while it goes on, for every game: games are analysed once the one being played is over. */
export function noGameGoingOn(context: Context): CurrentGame | undefined
{
    const current = gameAt(gameFolder(context.home()), context.now());

    if (current !== undefined && endOf(current.game) === undefined) {
        throw new Error(
            "A game is going on: games are analysed once it is over, this one and the others, and not by you from a PGN or a file either. Tell the player, and go "
                + "over it when it ends. Nothing changed.",
        );
    }

    return current;
}

/** The game played or kept to study by that name; without one, the current game over, or else the latest of the archive; refused while a game goes on. */
export function gameToStudy(context: Context, name?: string): Studied
{
    const current = noGameGoingOn(context);
    const folder = gameFolder(context.home());

    if (name !== undefined) {
        return namedGame(context, name);
    }

    // A game closed before any move has nothing to study: the one before it is the last played.
    if (current !== undefined && current.game.record.moves.length > 0) {
        // The archive's record, which keeps the AI's review (D-69).
        const archived = archivedName(folder, current);
        return archived === undefined ? { record: current.game.record } : { record: archivedGame(folder, archived), name: archived };
    }

    for (const latest of archivedGames(folder)) {
        const record = archivedGame(folder, latest);

        if (record.moves.length > 0) {
            return { record, name: latest };
        }
    }

    throw new Error("There is no game to study: play one with new_game, or give analyse_game the PGN of a game played elsewhere.");
}

/**
 * The game look and position show: without a name, for the chat, the one in analysis on the board page, which the player's words there name by their move
 * alone (D-101, Priya); else as gameToStudy. An agent names its game, since the page may turn to another meanwhile.
 */
export function gameShown(context: Context, name?: string): Studied
{
    const analysis = name === undefined && context.agent === undefined ? gameInAnalysis(gameFolder(context.home())) : undefined;

    if (analysis === undefined) {
        return gameToStudy(context, name);
    }

    noGameGoingOn(context);
    return namedGame(context, analysis.game);
}

/** A game played or kept to study by its name as the lists write it, or without its folder or its .pgn; refused when it is not there. */
export function namedGame(context: Context, name: string): Required<Studied>
{
    const folder = gameFolder(context.home());
    const full = listedName(folder, name);
    return { record: full.startsWith("study/") ? keptGame(folder, full) : archivedGame(folder, full), name: full };
}

/** The index of a move in the game's record, given as analyse_game numbers it: 12. for White's, 12... for Black's, 12...Kf8 too. */
export function moveIndex(record: GameRecord, move: string): number
{
    return plyOf(record, moveNumbers(record), move);
}

/**
 * A position of a game over as the board page shows it in analysis (D-101): the game's name, how many of its moves it shows, and the last of them numbered;
 * none for a game or a position there is not, or while a game goes on.
 */
export function shownPosition(context: Context, game: string, at: number): Shown | undefined
{
    try {
        noGameGoingOn(context);
        const { name, record } = namedGame(context, game);

        if (!Number.isInteger(at) || at < 0 || at > record.moves.length) {
            return undefined;
        }

        return at === 0 ? { game: name, at } : { game: name, at, move: `${moveNumbers(record)[at - 1]!}${record.moves[at - 1]!.san}` };
    } catch {
        return undefined;
    }
}

/** The number of each move of a game as the analysis writes it: 1. for White's first move, 1... for Black's. */
export function moveNumbers(record: GameRecord): string[]
{
    const start = new Game({ tags: record.tags, moves: [] }).position;
    const blackFirst = start.turn === "black" ? 1 : 0;

    return record.moves.map((move, index) => {
        const ply = index + blackFirst;
        return `${start.moveNumber + Math.floor(ply / 2)}${ply % 2 === 0 ? "." : "..."}`;
    });
}

/**
 * The game as it stood after a move, given by its number (12. for White's, 12... for Black's) and, if wanted, the move itself (12...Kf8), which decides
 * the side when the dots do not; after the last move without one.
 */
export function positionAfter(record: GameRecord, move?: string): StudiedPosition
{
    const numbers = moveNumbers(record);
    const ply = move === undefined ? numbers.length - 1 : plyOf(record, numbers, move);

    if (ply < 0) {
        return { game: new Game(record) };
    }

    return { game: new Game({ ...record, moves: record.moves.slice(0, ply + 1) }), move: `${numbers[ply]}${record.moves[ply]!.san}` };
}

/** A tag PGN leaves unknown with ? or -, as nothing. */
export function knownTag(tag: string | undefined): string | undefined
{
    return tag === undefined || /^[?.\-\s]*$/.test(tag) ? undefined : tag;
}

/** Where a position of a game studied stands: After 12...Kf8 in games/2026-11-02-153012.pgn: White to move. */
export function positionLine({ game, move }: StudiedPosition, name?: string): string
{
    const where = `${move === undefined ? "At the start" : `After ${move}`}${name === undefined ? "" : ` in ${name}`}`;
    const { outcome, position } = game;
    return `${where}: ${outcome.over ? `the board ends the game by ${outcome.ending}` : `${colourName(position.turn)} to move`}.`;
}

function plyOf(record: GameRecord, numbers: readonly string[], move: string): number
{
    const [, number, dots, san] = movePattern.exec(move) ?? [];

    if (number === undefined) {
        throw new Error(`"${move}" is not a move of the game: give its number as analyse_game writes it, 12. for White's move and 12... for Black's, such as 12...Kf8.`);
    }

    if (numbers.length === 0) {
        throw new Error("This game has no moves: look and position without move show its position.");
    }

    const white = numbers.indexOf(`${Number(number)}.`);
    const black = numbers.indexOf(`${Number(number)}...`);
    const plies = (dots === "..." || dots === "…" ? [black] : [white, black]).filter((ply) => ply >= 0);
    const found = san === undefined ? plies[0] : plies.find((ply) => isMove(record, ply, san));

    if (found === undefined) {
        const played = [white, black].filter((ply) => ply >= 0).map((ply) => `${numbers[ply]}${record.moves[ply]!.san}`);
        const there = played.length === 0 ? `its moves go from ${numbers[0]}${record.moves[0]!.san} to ${numbers.at(-1)}${record.moves.at(-1)!.san}` : `move ${number} is ${played.join(" ")}`;
        throw new Error(`There is no ${move.trim()} in this game: ${there}.`);
    }

    return found;
}

/** Whether the move written is the one the game played at that ply, however it is written: Nf3, g1f3, Nf3+. */
function isMove(record: GameRecord, ply: number, written: string): boolean
{
    const played = new Game({ ...record, moves: record.moves.slice(0, ply) }).playRecorded(written);
    return played.played && played.move.san === record.moves[ply]!.san;
}

const movePattern = /^\s*(\d+)\s*(\.\.\.|\.|…)?\s*(\S+)?\s*$/;
