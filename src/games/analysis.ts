// The game in analysis (D-69): analysis.json, in the folder of the profile's games, names the game analyse_game and annotate_game went over last, for the
// board page to show it once no game goes on; a new game ends it.
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { writeAtomically } from "./files.ts";

/** The game in analysis: its name as the lists write it, when the analysis last changed it, and whether the player brought it on the page and the AI has not gone over it yet (T-92). */
export interface Analysis
{
    readonly game: string;
    readonly at: string;
    readonly brought?: true;
}

/** Names the game in analysis, over the one before; written again each time its review changes, so the page hears of it. */
export function startAnalysis(folder: string, game: string, now: Date, brought = false): void
{
    writeAtomically(join(folder, fileName), `${JSON.stringify({ game, at: now.toISOString(), ...(brought ? { brought } : {}) }, null, 2)}\n`);
}

/** The game in analysis, or none when there is none, or analysis.json cannot be read. */
export function gameInAnalysis(folder: string): Analysis | undefined
{
    try {
        const analysis = JSON.parse(readFileSync(join(folder, fileName), "utf8")) as Partial<Analysis>;
        return typeof analysis.game === "string" && typeof analysis.at === "string"
            ? { game: analysis.game, at: analysis.at, ...(analysis.brought === true ? { brought: true } : {}) }
            : undefined;
    } catch {
        return undefined;
    }
}

/** Ends the analysis, when a new game starts. */
export function endAnalysis(folder: string): void
{
    rmSync(join(folder, fileName), { force: true });
}

const fileName = "analysis.json";
