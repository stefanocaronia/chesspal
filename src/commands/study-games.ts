// The games kept to study (D-68): played elsewhere and brought to analyse_game as a PGN, in the folder of the profile that brought them.
import { z } from "zod";
import type { GameRecord } from "../core/index.ts";
import { keptGame, keptGames } from "../games/index.ts";
import { gameFolder } from "../profiles/index.ts";
import { openingName } from "./opening-book.ts";
import { defineCommand } from "./registry.ts";
import { knownTag } from "./study.ts";

/** The games kept to study, one line each, the latest kept first. */
export const studyGames = defineCommand({
    name: "study_games",
    description: "Lists the games kept to study, which the player brought from elsewhere, the latest kept first: who played, when, "
        + "the result, the opening, how long, and its name. analyse_game with pgn keeps a game here; analyse_game, look and position take its name as game. "
        + "Example: study_games {}.",
    input: z.object({}),
    readOnly: true,
    idempotent: true,
    run: (input, context): { games: string[]; } => {
        const folder = gameFolder(context.home());
        return { games: keptGames(folder).flatMap((name) => studyLines(folder, name)) };
    },
    format: ({ games }) => (games.length === 0 ? "No game kept to study yet: analyse_game with the PGN of a game played elsewhere keeps it here." : games.join("\n")),
});

/** Ann vs Bob, 2026.10.01: 1-0, C23 Bishop's Opening, 4 moves. study/2026-11-04-153012.pgn; none for a game that cannot be read. */
function studyLines(root: string, name: string): string[]
{
    let record: GameRecord;

    try {
        record = keptGame(root, name);
    } catch {
        // A game that cannot be read stays out of the list.
        return [];
    }

    const { tags, moves } = record;
    const date = knownTag(tags.Date);
    const result = tags.Result === undefined || tags.Result === "*" ? "result unknown" : tags.Result;
    const opening = openingName(record);
    const count = Math.ceil(moves.length / 2);
    const players = `${tags.White ?? "?"} vs ${tags.Black ?? "?"}${date === undefined ? "" : `, ${date}`}`;
    return [`${players}: ${result}${opening === undefined ? "" : `, ${opening}`}, ${count} ${count === 1 ? "move" : "moves"}. ${name}`];
}
