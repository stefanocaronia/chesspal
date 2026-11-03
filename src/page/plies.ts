// The moves of a game as the page shows them: each with its side and number, and the comment the player may read; and the AI's last words.
import type { GameRecord, Side } from "../core/index.ts";

/** A move of a record with its side and number, as the record's start position counts them, and its comment for the player. */
export interface Ply
{
    readonly san: string;
    readonly comment?: string;
    readonly side: Side;
    readonly number: number;
}

/**
 * The moves of a record, each with its side and number: a game may start from a position where Black moves first. A comment keeps only its words: the
 * commands in it, such as the AI's plan that an ended game shows, are not for the page.
 */
export function pliesOf(record: GameRecord): Ply[]
{
    const [, turn, , , , number] = (record.tags.FEN ?? "").split(" ");
    const first = Number(number) || 1;
    const offset = turn === "b" ? 1 : 0;
    return record.moves.map((move, index) => {
        const comment = move.comment?.replace(/\s*\[%[^\]]*\]/g, "").trim();
        const ply = { san: move.san, side: (index + offset) % 2 === 0 ? "white" : "black", number: first + Math.floor((index + offset) / 2) } as const;
        return comment === undefined || comment === "" ? ply : { ...ply, comment };
    });
}

/** A line said on the board page, with the moves the game had then (T-65). */
export interface TalkLine
{
    readonly who: "player" | "ai";
    readonly text: string;
    readonly ply: number;
}

/** The AI's last words: what it said on the page after its last move, or else the comment on that move. */
export function lastWords(plies: readonly Ply[], ai: Side, talk: readonly TalkLine[]): string | undefined
{
    const lastMove = plies.findLastIndex((ply) => ply.side === ai);
    const said = talk.findLast((line) => line.who === "ai");
    return said !== undefined && said.ply > lastMove ? said.text : plies[lastMove]?.comment;
}
