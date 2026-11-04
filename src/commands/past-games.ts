import { z } from "zod";
import { type GameRecord, writePgn } from "../core/index.ts";
import { archivedGame, archivedGames, archivedWhen } from "../games/index.ts";
import { gameFolder } from "../profiles/index.ts";
import { openingName } from "./opening-book.ts";
import { defineCommand } from "./registry.ts";

type Past = { games: string[]; } | { pgn: string; };

/** The AI's memory of the games played (D-57): how the latest went, one line each, or one game whole from the archive. */
export const pastGames = defineCommand({
    name: "past_games",
    description: "Lists the games played with this player, the latest first: when, your colour, the result, the opening, how long, and its name in the "
        + "archive. With game, that game's PGN with your comments and plans; to comment a game with the player, analyse_game. new_game already gives the "
        + "last three. Example: past_games {}.",
    input: z.object({ game: z.string().optional().describe("a game's name, as the list writes it: its PGN") }),
    readOnly: true,
    idempotent: true,
    run: ({ game }, context): Past => {
        const folder = gameFolder(context.folder);
        return game === undefined ? { games: pastGameLines(folder, listed) } : { pgn: writePgn(archivedGame(folder, game)) };
    },
    format: (past) => ("pgn" in past ? past.pgn : past.games.length === 0 ? "No game played yet." : past.games.join("\n")),
});

/** The latest games of the archive, one line each as the AI reads them: none when there is no archive. */
export function pastGameLines(folder: string, count: number): string[]
{
    return archivedGames(folder).slice(0, count).flatMap((name) => {
        try {
            return [pastGameLine(name, archivedGame(folder, name))];
        } catch {
            // A game the archive cannot read stays out of the memory.
            return [];
        }
    });
}

const listed = 20;

/** 2026-11-03 12:04, you (AI) played Black and won 0-1 (White resigns), B50 Sicilian Defense, 15 moves. games/2026-11-03-120423.pgn */
function pastGameLine(name: string, record: GameRecord): string
{
    const ai = record.tags.Black === "AI" ? "black" : "white";
    const result = record.tags.Result ?? "*";
    const outcome = result === "*" ? ", unfinished" : ` and ${resultFor(result, ai)} ${result}`;
    const termination = record.tags.Termination === undefined || result === "*" ? "" : ` (${record.tags.Termination})`;
    const opening = openingName(record);
    const moves = Math.ceil(record.moves.length / 2);
    return `${archivedWhen(name)}, you (AI) played ${ai === "white" ? "White" : "Black"}${outcome}${termination}${opening === undefined ? "" : `, ${opening}`}, ${moves} moves. ${name}`;
}

function resultFor(result: string, ai: "white" | "black"): string
{
    return result === "1/2-1/2" ? "drew" : (result === "1-0") === (ai === "white") ? "won" : "lost";
}
