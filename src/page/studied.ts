// The players of a game in analysis (D-69), as the page shows them: a game played here names them Player and AI, one played elsewhere by their names.
import type { Side } from "../core/index.ts";

/** A side of the game in analysis: its player's name, and whose picture it takes: the player's, the AI's, or none. */
export interface StudiedSide
{
    readonly name: string;
    readonly who: "player" | "ai" | "other";
}

/** Both sides of a game in analysis, and the one at the bottom: the player's, when one of them is, else White. */
export function studiedSides(tags: Readonly<Record<string, string>>, you: string, ai: string, sides: Readonly<Record<Side, string>>): Record<Side, StudiedSide> & { bottom: Side; }
{
    const sideOf = (side: Side): StudiedSide => {
        const tag = (side === "white" ? tags.White : tags.Black)?.trim() ?? "";

        if (tag === "Player" || tag.toLowerCase() === you.trim().toLowerCase()) {
            return { name: you, who: "player" };
        }

        // A tag PGN leaves unknown names the side.
        return tag === "AI" ? { name: ai, who: "ai" } : { name: /^[?\-\s]*$/.test(tag) ? sides[side] : tag, who: "other" };
    };

    const white = sideOf("white");
    const black = sideOf("black");
    return { white, black, bottom: black.who === "player" && white.who !== "player" ? "black" : "white" };
}
