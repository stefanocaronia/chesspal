import { z } from "zod";
import { writePgn } from "../../core/index.ts";
import { archivedGame, archivedGames, archivedTags, archivedWhen } from "../../games/index.ts";
import { gameFolder } from "../../profiles/index.ts";
import { openingName } from "../answers/index.ts";
import { defineCommand } from "../registry/index.ts";

type Past = { games: string[]; searched: true | undefined; } | { pgn: string; };

/** The AI's memory of the games played (D-57): how the latest went, one line each, or one game whole from the archive. */
export const pastGames = defineCommand({
    name: "past_games",
    description: "Lists the games played with this player, the latest first: when, your colour, the result, the opening, how long, and its name in the "
        + "archive. With search, only the games whose line holds every word of it; the colour and the result are yours, the AI's. With game, that game's "
        + "PGN with your comments and plans; to comment a game with the player, analyse_game. new_game already gives the last three. Example, the "
        + 'Sicilians the player lost: past_games {search: "Sicilian won"}.',
    input: z.object({
        search: z.string().optional().describe("words the game's line must all hold: a date, your colour, won, lost, drew or unfinished as you did, an opening"),
        game: z.string().optional().describe("a game's name, as the list writes it: its PGN"),
    }),
    readOnly: true,
    idempotent: true,
    run: ({ search, game }, context): Past => {
        const folder = gameFolder(context.home());
        return game === undefined ? { games: pastGameLines(folder, listed, search), searched: search?.trim() ? true : undefined } : { pgn: writePgn(archivedGame(folder, game)) };
    },
    format: (past) => {
        if ("pgn" in past) {
            return past.pgn;
        }

        return past.games.length > 0 ? past.games.join("\n") : past.searched ? "No game played holds all those words." : "No game played yet.";
    },
});

/**
 * The latest games of the archive, one line each as the AI reads them, those holding every word searched: none when there is no archive. A game closed
 * before any move is no game played. A game is read from its tags alone when the archive wrote the opening's and the plies', or else whole.
 */
export function pastGameLines(folder: string, count: number, search = ""): string[]
{
    const words = search.toLowerCase().split(/\s+/).filter((word) => word !== "");
    const lines: string[] = [];

    for (const name of archivedGames(folder)) {
        if (lines.length === count) {
            break;
        }

        try {
            const line = pastGameLine(folder, name);
            // The ending names the player's colour too, as "(Black resigns)": a colour searched is the AI's alone.
            const searched = line?.replace(/ \((?:White|Black) [^)]*\)/, "").toLowerCase();

            if (line !== undefined && words.every((word) => searched!.includes(word))) {
                lines.push(line);
            }
        } catch {
            // A game the archive cannot read stays out of the memory.
        }
    }

    return lines;
}

const listed = 20;

/** A game's line, from its tags when they say all of it, or else from the whole game: none for a game closed before any move. */
function pastGameLine(folder: string, name: string): string | undefined
{
    const tags = archivedTags(folder, name);
    const { ECO: eco, Opening: opening, PlyCount: plies = "" } = tags;

    // The archive that writes the plies writes the opening too, or none for a game that has none: from another position, or outside the book.
    if (/^\d+$/.test(plies)) {
        return lineOf(name, tags, Number(plies), eco === undefined || opening === undefined ? undefined : `${eco} ${opening}`);
    }

    const record = archivedGame(folder, name);
    return lineOf(name, record.tags, record.moves.length, openingName(record));
}

/** 2026-11-03 12:04, you (AI) played Black and won 0-1 (White resigns), B50 Sicilian Defense, 15 moves. games/2026-11-03-120423.pgn */
function lineOf(name: string, tags: Readonly<Record<string, string>>, plies: number, opening: string | undefined): string | undefined
{
    if (plies === 0) {
        return undefined;
    }

    const ai = tags.Black === "AI" ? "black" : "white";
    const result = tags.Result ?? "*";
    const outcome = result === "*" ? ", unfinished" : ` and ${resultFor(result, ai)} ${result}`;
    const termination = tags.Termination === undefined || result === "*" ? "" : ` (${tags.Termination})`;
    const moves = Math.ceil(plies / 2);
    return `${archivedWhen(name)}, you (AI) played ${ai === "white" ? "White" : "Black"}${outcome}${termination}${opening === undefined ? "" : `, ${opening}`}, ${moves} moves. ${name}`;
}

function resultFor(result: string, ai: "white" | "black"): string
{
    return result === "1/2-1/2" ? "drew" : (result === "1-0") === (ai === "white") ? "won" : "lost";
}
