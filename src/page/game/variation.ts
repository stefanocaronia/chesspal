// A variation in analysis (D-116): from a position of the game the player moves White's and Black's pieces, one line and never a tree, kept by the page
// alone. Moving from its middle cuts it there; a move the game played only steps through the game.
import type { GameRecord, Side } from "../../core/index.ts";
import { stepped } from "./browse.ts";

/**
 * The line: how many of the game's moves come before it (`at`), its moves in SAN, and how many of them the board shows (`cursor`), 0 when the board is
 * back on the game and the line stays faded.
 */
export interface Variation
{
    readonly at: number;
    readonly moves: readonly string[];
    readonly cursor: number;
}

/** A move of the line with its number and side, for the moves' column and the words that name it. */
export interface LinePly
{
    readonly san: string;
    readonly number: number;
    readonly side: Side;
}

/** Where the board stands: on the game after `at` moves (`cursor` 0), or on a line that leaves it there. */
export interface Place
{
    readonly at: number;
    readonly cursor: number;
}

/** Whether the board shows a move of the line, not the game. */
export function onLine(line: Variation | undefined): line is Variation
{
    return line !== undefined && line.cursor > 0;
}

/**
 * The line after the player moves `san` where the board stands, and how many of the game's moves the board shows by then: on the game, its own next move
 * steps forward and the line's first move goes back into the line; any other starts a new line. On the line, its own next move steps forward and any other
 * cuts the line there and goes on with it.
 */
export function afterMove(line: Variation | undefined, game: readonly string[], shown: number, san: string): { line: Variation | undefined; shown: number; }
{
    if (line !== undefined && line.cursor > 0) {
        const moves = line.moves[line.cursor] === san ? line.moves : [...line.moves.slice(0, line.cursor), san];
        return { line: { at: line.at, moves, cursor: line.cursor + 1 }, shown: line.at };
    }

    if (game[shown] === san) {
        return { line: line === undefined ? undefined : { ...line, cursor: 0 }, shown: shown + 1 };
    }

    if (line?.at === shown && line.moves[0] === san) {
        return { line: { ...line, cursor: 1 }, shown };
    }

    return { line: { at: shown, moves: [san], cursor: 1 }, shown };
}

/** The line after a step back or forward through it: back from its first move the board is on the game again, where the line leaves it. */
export function stepLine(line: Variation, step: "back" | "forward"): Variation
{
    return { ...line, cursor: stepped(step, line.cursor, line.moves.length) };
}

/** The line with the board back on the game, the line kept faded. */
export function leaveLine(line: Variation | undefined): Variation | undefined
{
    return line === undefined ? undefined : { ...line, cursor: 0 };
}

/** The record of the position the board shows: the game's moves up to the line, then the line's up to its cursor. */
export function lineRecord(record: GameRecord, line: Variation): GameRecord
{
    const moves = [...record.moves.slice(0, line.at).map(({ san }) => san), ...line.moves.slice(0, line.cursor)];
    return { tags: record.tags, moves: moves.map((san) => ({ san })) };
}

/** The line's moves numbered from the position it leaves the game at, given by its move number and the side to move. */
export function linePlies(line: Variation, start: { moveNumber: number; turn: Side; }): LinePly[]
{
    let { moveNumber: number, turn: side } = start;

    return line.moves.map((san) => {
        const ply = { san, number, side };
        number += side === "black" ? 1 : 0;
        side = side === "white" ? "black" : "white";
        return ply;
    });
}

/** The moves written as a PGN writes them, 12...Kf8 13.Nxe5 Bxe2: the number before White's moves, and before the first when it is Black's. */
export function lineText(plies: readonly LinePly[]): string
{
    return plies.map((ply, index) => `${moveNumberOf(ply, index === 0)}${ply.san}`).join(" ");
}

/** The number written before a move of a line, 13. or 12..., none before Black's but the first. */
export function moveNumberOf(ply: LinePly, first: boolean): string
{
    return ply.side === "white" ? `${ply.number}.` : first ? `${ply.number}...` : "";
}

/** Whether the board goes from one place to another by more than one move, which shows the position at once instead of sliding a move. */
export function isJump(from: Place, to: Place): boolean
{
    if (from.cursor === 0 && to.cursor === 0) {
        return Math.abs(from.at - to.at) > 1;
    }

    if (from.cursor > 0 && to.cursor > 0) {
        return from.at !== to.at || Math.abs(from.cursor - to.cursor) > 1;
    }

    const [game, line] = from.cursor === 0 ? [from, to] : [to, from];
    return !(game.at === line.at && line.cursor === 1);
}
