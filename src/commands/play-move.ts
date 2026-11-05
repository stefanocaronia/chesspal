// A move of the AI or of the player on the current game: played, timed by the clock, saved, and archived when it ends the game.
import { clockAfterMove, clockTag } from "../core/index.ts";
import { archiveEnded, type CurrentGame, endOf, forgetThoughts, saveGame, talkLine } from "../games/index.ts";
import { gameGoingOn, type MovePlayed, summaryOf, withThought } from "./game-summary.ts";
import { colourName } from "./view.ts";

/** Who plays a move: the AI, or the player through the AI. */
export type Mover = "ai" | "player";

/** What comes with a move: the AI's comment, or the player's words from the board page, saved with it (T-65), and a draw offer (D-65). */
export interface WithMove
{
    comment?: string;
    offerDraw?: boolean;
    said?: { text: string; at: Date; };
    /** Milliseconds of the mover's turn that were not theirs, not taken off their clock (D-36). */
    allowance?: number;
}

/**
 * Plays a move for one side `now` and saves the game, with the time it took and the clock after it in its comment ([%clk]). A refused move, or words refused
 * with it, change nothing: it throws the message `refused` writes from the core's.
 */
export function playMove(folder: string, now: Date, mover: Mover, text: string, refused: (message: string, legal: readonly string[]) => string, { comment, said, offerDraw = false, allowance = 0 }: WithMove = {}): MovePlayed
{
    // A flag falls only past the allowance.
    const before = gameToMove(folder, mover, new Date(now.getTime() - allowance));
    const { game } = before;
    const position = game.position;
    // The words are checked before the move, which changes the live game; they count as said after it.
    const line = said === undefined ? undefined : talkLine(before, mover, said.text, said.at, game.record.moves.length + 1);

    if (mover === "ai" && before.clock?.waiting === true) {
        throw new Error("The clocks wait for the player to start the game with Start on the board page: don't move yet, the doorbell wakes you then. Nothing changed.");
    }

    if (offerDraw && game.record.moves.length === 0) {
        throw new Error("A draw can be offered once each side has made a move: play the move without offer_draw. Nothing changed.");
    }

    const played = game.play(text);

    if (!played.played) {
        throw new Error(refused(played.message, played.legal));
    }

    const clock = before.clock === undefined ? undefined : clockAfterMove(before.clock, position.turn, now, allowance, mover === "player");
    // A move declines the other side's draw offer; the mover's own stands, and the move carries it in the record as FIDE writes it, (=) (D-65). A move that
    // ends the game leaves no offer.
    const offers = (offerDraw || before.drawOffer === mover) && endOf(game) === undefined;
    const current = { ...before, drawOffer: offers ? mover : undefined, ...(clock === undefined ? {} : { clock }) };
    const words = [offers ? "(=)" : undefined, comment, clock === undefined ? undefined : clockTag(clock.left[position.turn])].filter((part) => part !== undefined);

    if (words.length > 0) {
        game.annotate(game.record.moves.length, { comment: words.join(" ") });
    }

    if (line !== undefined) {
        current.talk.push(line);
    }

    saveGame(folder, current);

    // The AI's thoughts on the player's time were for the position its move leaves (D-72).
    if (mover === "ai") {
        forgetThoughts(folder);
    }

    const { archive, warning } = endOf(game) === undefined ? {} : archiveEnded(folder, current);
    const result: MovePlayed = { move: `${position.moveNumber}${position.turn === "white" ? "." : "..."}${played.move.san}`, game: withThought(summaryOf(current, now, archive), folder, current) };

    if (played.note !== undefined) {
        result.note = played.note;
    }

    if (warning !== undefined) {
        result.warning = warning;
    }

    return result;
}

function gameToMove(folder: string, mover: Mover, now: Date): CurrentGame
{
    const current = gameGoingOn(folder, now);
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
