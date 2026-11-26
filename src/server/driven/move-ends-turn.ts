// The AI's move that ends its turn: the table interrupts the chat there, sparing the host one more request only to say what it played, which nobody reads.
import type { MovePlayed } from "../../commands/index.ts";

/**
 * Whether a tool's result, as the chat gets it, asks nothing more of the AI in its turn: ai_move played, the game going on with the player to move, no
 * draw offer of theirs standing, no words of theirs to answer, no agent to start.
 */
export function moveEndsTurn(tool: string, result: unknown): boolean
{
    if (tool !== "ai_move") {
        return false;
    }

    const { game, words = [], agents = [] } = result as MovePlayed & { agents?: readonly string[]; };
    return game.end === undefined && game.turn !== game.ai && game.drawOffer !== "player" && words.length === 0 && agents.length === 0;
}
