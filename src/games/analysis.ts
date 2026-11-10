// The game in analysis (D-69): analysis.json, in the folder of the profile's games, names the game analyse_game and annotate_game went over last, for the
// board page to show it once no game goes on; a new game ends it.
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { writeAtomically } from "./files.ts";

/**
 * The game in analysis: its name as the lists write it, when the analysis last changed it, whether the player brought it on the page and the AI has not
 * gone over it yet, and the moves whose note the chat corrected with the player, which the analyst leaves (D-101).
 */
export interface Analysis
{
    readonly game: string;
    readonly at: string;
    readonly brought?: true;
    readonly corrected?: readonly string[];
}

/** How a game is named in analysis: brought to the page by the player, with the moves the chat just corrected, or afresh, without the corrections it had. */
export interface AnalysisStart
{
    readonly brought?: boolean;
    readonly corrected?: readonly string[];
    readonly afresh?: boolean;
}

/**
 * Names the game in analysis, over the one before; written again each time its review changes, so the page hears of it. The same game keeps its corrections
 * unless it starts afresh, in one write, so that the page never sees it leave the analysis.
 */
export function startAnalysis(folder: string, game: string, now: Date, { brought = false, corrected = [], afresh = false }: AnalysisStart = {}): void
{
    const before = afresh ? undefined : gameInAnalysis(folder);
    const kept = [...new Set([...(before?.game === game ? before.corrected ?? [] : []), ...corrected])];
    const analysis = { game, at: now.toISOString(), ...(brought ? { brought } : {}), ...(kept.length === 0 ? {} : { corrected: kept }) };
    writeAtomically(join(folder, fileName), `${JSON.stringify(analysis, null, 2)}\n`);
}

/** The game in analysis, or none when there is none, or analysis.json cannot be read. */
export function gameInAnalysis(folder: string): Analysis | undefined
{
    try {
        const analysis = JSON.parse(readFileSync(join(folder, fileName), "utf8")) as Partial<Analysis>;
        const corrected = Array.isArray(analysis.corrected) ? analysis.corrected.filter((move) => typeof move === "string") : [];
        return typeof analysis.game === "string" && typeof analysis.at === "string"
            ? { game: analysis.game, at: analysis.at, ...(analysis.brought === true ? { brought: true } : {}), ...(corrected.length === 0 ? {} : { corrected }) }
            : undefined;
    } catch {
        return undefined;
    }
}

/** Ends the analysis, when a new game starts or its review is deleted. */
export function endAnalysis(folder: string): void
{
    rmSync(join(folder, fileName), { force: true });
}

const fileName = "analysis.json";
