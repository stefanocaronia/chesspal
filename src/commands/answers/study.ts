// A game to study (D-68): one that is over, played here or kept to study, and any position of it, by its moves as the analysis numbers them. While a game
// goes on, nothing is studied: the analysis would help the game being played (D-60, D-62).
import { z } from "zod";
import { carriedPlies, Game, type GameRecord } from "../../core/index.ts";
import { archivedGame, archivedGames, archivedName, type CurrentGame, endOf, gameInAnalysis, keptGame, listedName, type Shown, type ShownVariation } from "../../games/index.ts";
import { gameFolder } from "../../profiles/index.ts";
import type { Context } from "../registry/index.ts";
import { gameAt } from "./clock.ts";
import { colourName } from "./view.ts";

/** What look and position take to show any position of a game that is over. */
export const studyInput = {
    game: z.string().optional().describe("a game's name, as past_games, study_games or analyse_game writes it: one of its positions; without it, the game on the board page"),
    move: z.string().optional().describe("the position after this move of a game over, as analyse_game numbers it: 12. for White's, 12... for Black's"),
    line: z.string().max(800).optional().describe(
        "a variation played on a scratch board from the position move names, or from the number of its first move: 12...Kf8 13.Nxe5 Bxe2; the position after it. "
            + "The game stays as it is",
    ),
};

/** A game to study: its record, and its name in the archive when it is there. */
export interface Studied
{
    readonly record: GameRecord;
    readonly name?: string;
}

/**
 * A position of a game: the game as it stood after a move, and that move as the analysis writes it (12...Kf8); none at the start. After a variation, the
 * variation as PGN writes it and the game's own move it takes the place of, none past the game's end.
 */
export interface StudiedPosition
{
    readonly game: Game;
    readonly move?: string;
    readonly variation?: { readonly text: string; readonly instead?: string; };
}

/** A variation played on a scratch board (D-28): the position after it, each move numbered (12...Kf8, 13.Nxe5, 13...Bxe2), and the line as PGN writes it. */
interface PlayedLine
{
    readonly game: Game;
    readonly numbered: readonly string[];
    readonly text: string;
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

    // A game closed before any move of its own has nothing to study: the one before it is the last played.
    if (current !== undefined && current.game.record.moves.length > carriedPlies(current.game.record)) {
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
 * none for a game or a position there is not, or while a game goes on. With the variation the player played there (D-116), refused when it cannot be played.
 */
export function shownPosition(context: Context, game: string, at: number, variation?: VariationInput): Shown | undefined
{
    let studied;

    try {
        noGameGoingOn(context);
        studied = namedGame(context, game);
    } catch {
        return undefined;
    }

    const { name, record } = studied;

    if (!Number.isInteger(at) || at < 0 || at > record.moves.length) {
        return undefined;
    }

    const shown = at === 0 ? { game: name, at } : { game: name, at, move: `${moveNumbers(record)[at - 1]!}${record.moves[at - 1]!.san}` };
    return variation === undefined ? shown : { ...shown, variation: shownVariation(record, variation) };
}

/** A variation as the board page sends it (D-116): how many of the game's moves come before it, its moves, and how many of them the board shows. */
export interface VariationInput
{
    readonly at: number;
    readonly moves: readonly string[];
    readonly cursor: number;
}

/**
 * The position after a variation written as the AI writes it, 12...Kf8 13.Nxe5 Bxe2: from the position `move` names, or else from the number of its first
 * move; refused when neither says where it starts, or they disagree.
 */
export function positionAfterLine(record: GameRecord, move: string | undefined, line: string): StudiedPosition
{
    const moves = lineMoves(line);

    if (moves.length === 0) {
        throw new Error("The line has no moves: write them as PGN does, 12...Kf8 13.Nxe5 Bxe2.");
    }

    if (moves.length > mostLinePlies) {
        throw new Error(`The line has ${moves.length} moves: give at most ${mostLinePlies}.`);
    }

    const first = firstNumber.exec(moves[0]!);
    const from = move === undefined ? lineStart(record, first) : positionAfter(record, move).game.record.moves.length;
    const label = nextLabel(new Game({ ...record, moves: record.moves.slice(0, from) }));

    if (first !== null && label !== `${Number(first[1])}${first[2] === "." ? "." : "..."}`) {
        const where = move === undefined ? "" : ` after ${move.trim()}`;
        throw new Error(`The line starts with ${first[0]}, but the next move${where} is ${label}: number its first move so, or give move, the game's move it leaves from.`);
    }

    const played = playLine(record, from, moves);
    const instead = record.moves[from] === undefined ? undefined : `${moveNumbers(record)[from]!}${record.moves[from]!.san}`;
    return { game: played.game, variation: instead === undefined ? { text: played.text } : { text: played.text, instead } };
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

/**
 * Where a position of a game studied stands: After 12...Kf8 in games/2026-11-02-153012.pgn: White to move. After a variation, with the game's move it takes
 * the place of: After the variation 12...Kf8 13.Nxe5 Bxe2 (the game: 12...Qd7) in games/2026-11-02-153012.pgn: White to move.
 */
export function positionLine({ game, move, variation }: StudiedPosition, name?: string): string
{
    const after = variation === undefined
        ? move === undefined ? "At the start" : `After ${move}`
        : `After the variation ${variation.text} (${variation.instead === undefined ? "past the game's end" : `the game: ${variation.instead}`})`;
    const where = `${after}${name === undefined ? "" : ` in ${name}`}`;
    const { outcome, position } = game;
    return `${where}: ${outcome.over ? `the board ends the game by ${outcome.ending}` : `${colourName(position.turn)} to move`}.`;
}

/**
 * The variation the page showed with the player's words (D-116), its moves played from the game's first `at` on a scratch board: refused at the first that
 * cannot be played, or when the game has no such position. The moves are kept in SAN as chess.js writes them, whatever the page sent.
 */
function shownVariation(record: GameRecord, variation: VariationInput): ShownVariation
{
    const { at, moves, cursor } = variation;

    if (!Number.isInteger(at) || at < 0 || at > record.moves.length || moves.length === 0 || moves.length > mostLinePlies) {
        throw new Error(`A variation leaves from one of the game's ${record.moves.length + 1} positions and has 1 to ${mostLinePlies} moves.`);
    }

    if (!Number.isInteger(cursor) || cursor < 0 || cursor > moves.length) {
        throw new Error(`The variation shows one of its ${moves.length} moves, or none: its cursor goes from 0 to ${moves.length}.`);
    }

    const played = playLine(record, at, moves);
    const sans = played.game.record.moves.slice(at).map(({ san }) => san);
    return { at, moves: sans, cursor, text: played.text, ...(cursor === 0 ? {} : { move: played.numbered[cursor - 1]! }) };
}

/**
 * Plays moves on a scratch board from the game's first `from` moves (D-28), each in SAN, with figurines or as squares, with or without its number: refused
 * at the first that cannot be played, with why. The game itself never changes.
 */
function playLine(record: GameRecord, from: number, moves: readonly string[]): PlayedLine
{
    const game = new Game({ ...record, moves: record.moves.slice(0, from) });
    const numbered: string[] = [];

    for (const written of moves) {
        const label = nextLabel(game);
        const played = game.play(written);

        if (!played.played) {
            const before = numbered.length === 0 ? "" : ` after ${pgnText(numbered)}`;
            throw new Error(`${label}${written.replace(numberBefore, "")} cannot be played${before}: ${played.message} The game stays as it is.`);
        }

        numbered.push(`${label}${played.move.san}`);
    }

    return { game, numbered, text: pgnText(numbered) };
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

/** The most moves a variation holds, on the page and in look and position. */
const mostLinePlies = 100;

/** The number written before a move, 12. or 12... or 12…, and what it says. */
const firstNumber = /^(\d+)\s*(\.\.\.|…|\.)/;
const numberBefore = /^\d+\s*(?:\.+|…)\s*/;

/** The number the next move of a game takes as PGN writes it: 13. for White's, 13... for Black's. */
function nextLabel(game: Game): string
{
    const { moveNumber, turn } = game.position;
    return `${moveNumber}${turn === "white" ? "." : "..."}`;
}

/** Numbered moves as PGN writes them: the number before White's moves, and before the first when it is Black's. */
function pgnText(numbered: readonly string[]): string
{
    return numbered.map((move, index) => index > 0 && move.includes("...") ? move.replace(/^\d+\.\.\./, "") : move).join(" ");
}

/** A line's moves, each with the number written before it when there is one: "12... Kf8 13. Nxe5" is 12...Kf8 and 13.Nxe5. */
function lineMoves(line: string): string[]
{
    const moves: string[] = [];
    let number = "";

    for (const word of line.trim().split(/\s+/).filter((word) => word !== "")) {
        if (/^\d+\s*(?:\.+|…)$/.test(word)) {
            number = word;
        } else {
            moves.push(`${number}${word}`);
            number = "";
        }
    }

    return moves;
}

/** How many of the game's moves come before a line by the number of its first move, 12... after White's 12th; refused without one or out of the game. */
function lineStart(record: GameRecord, first: RegExpExecArray | null): number
{
    if (first === null) {
        throw new Error("Say where the line starts: number its first move, 12...Kf8, or give move, the game's move it leaves from.");
    }

    const start = new Game({ tags: record.tags, moves: [] }).position;
    const ply = (Number(first[1]) - start.moveNumber) * 2 + (first[2] === "." ? 0 : 1) - (start.turn === "black" ? 1 : 0);

    if (ply < 0 || ply > record.moves.length) {
        const numbers = moveNumbers(record);
        const span = numbers.length === 0 ? "it has no moves" : `its moves go from ${numbers[0]}${record.moves[0]!.san} to ${numbers.at(-1)}${record.moves.at(-1)!.san}`;
        throw new Error(`The game has no position before ${first[0]}: ${span}.`);
    }

    return ply;
}
