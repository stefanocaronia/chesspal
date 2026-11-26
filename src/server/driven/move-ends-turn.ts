// The AI's move that ends its turn: the table interrupts the chat there, sparing the host one more request only to say what it played, which nobody reads.
import type { MovePlayed } from "../../commands/index.ts";

/**
 * Whether a tool's result, as the chat gets it, asks nothing more of the AI in its turn: ai_move played, the game going on, no words of the player's to
 * answer. After the AI's move the player is to move and no draw offer of theirs stands, and a chat the table drives has no agents to start.
 */
export function moveEndsTurn(tool: string, result: unknown): boolean
{
    if (tool !== "ai_move") {
        return false;
    }

    const { game, words = [] } = result as MovePlayed;
    return game.end === undefined && words.length === 0;
}
