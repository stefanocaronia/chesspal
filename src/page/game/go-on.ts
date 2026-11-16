// What a new game started in analysis goes on from: the position on the board and the moves that led to it.
import { type Game, movesOnly, writePgn } from "../../core/index.ts";

/** What a new game goes on from, as `new_game` takes it: the moves to the position as PGN, with the FEN the game started from if any; the FEN alone when no move led to it. */
export function goOnFrom(game: Game): string
{
    const { record } = game;

    if (record.moves.length === 0) {
        return game.position.fen;
    }

    const tags: Record<string, string> = record.tags.FEN === undefined ? {} : { SetUp: "1", FEN: record.tags.FEN };
    return writePgn(movesOnly({ tags, moves: record.moves }));
}
