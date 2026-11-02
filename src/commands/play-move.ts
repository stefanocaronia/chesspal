// A move of the AI or of the player on the current game: played, saved, and archived when it ends the game.
import { archiveGame, type CurrentGame, endOf, saveGame } from "../games/index.ts";
import { colourName, gameGoingOn, type MovePlayed, summaryOf } from "./game-summary.ts";

/** Who plays a move: the AI, or the player through the AI. */
export type Mover = "ai" | "player";

/** Plays a move for one side and saves the game. A refused move changes nothing: it throws the message `refused` writes from the core's. */
export function playMove(folder: string, mover: Mover, text: string, refused: (message: string, legal: readonly string[]) => string, comment?: string): MovePlayed
{
    const current = gameToMove(folder, mover);
    const { game } = current;
    const before = game.position;
    const played = game.play(text);

    if (!played.played) {
        throw new Error(refused(played.message, played.legal));
    }

    if (comment !== undefined) {
        game.annotate(game.record.moves.length, { comment });
    }

    saveGame(folder, current);
    const { archive, warning } = endOf(game) === undefined ? {} : archived(folder, current);
    const result: MovePlayed = { move: `${before.moveNumber}${before.turn === "white" ? "." : "..."}${played.move.san}`, game: summaryOf(current, archive) };

    if (played.note !== undefined) {
        result.note = played.note;
    }

    if (warning !== undefined) {
        result.warning = warning;
    }

    return result;
}

/** Archives a game that has ended: its name in the archive or, when that fails, a warning, since the game is saved in game.json all the same. */
export function archived(folder: string, current: CurrentGame): { archive?: string; warning?: string; }
{
    try {
        return { archive: archiveGame(folder, current) };
    } catch (error) {
        return { warning: `${(error as Error).message} The game is saved in game.json: it goes to the archive when a new game starts.` };
    }
}

function gameToMove(folder: string, mover: Mover): CurrentGame
{
    const current = gameGoingOn(folder);
    const { turn } = current.game.position;
    const aiToMove = turn === current.ai;

    if (mover === "player" && aiToMove) {
        throw new Error(`It is your move (${colourName(turn)}): call ai_move. Nothing changed.`);
    }

    if (mover === "ai" && !aiToMove) {
        throw new Error(`It is the player's move (${colourName(turn)}): wait for it, then call player_move. Nothing changed.`);
    }

    return current;
}
