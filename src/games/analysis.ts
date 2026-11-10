// The game in analysis (D-69): analysis.json, in the folder of the profile's games, names the game analyse_game and annotate_game went over last, for the
// board page to show it once no game goes on; a new game ends it.
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { writeAtomically } from "./files.ts";

/**
 * The game in analysis: its name as the lists write it, when the analysis last changed it, whether the player brought it on the page and the AI has not
 * gone over it yet, the moves whose note the chat corrected with the player, which the analyst leaves (D-101), and the run of the analyst that took it.
 */
export interface Analysis
{
    readonly game: string;
    readonly at: string;
    readonly brought?: true;
    readonly corrected?: readonly string[];
    readonly analyst?: AnalystRun;
}

/** The run of the analyst agent that took a game, as the host names it, the game it took and when. */
export interface AnalystRun
{
    readonly game: string;
    readonly run: string;
    readonly since: string;
}

/**
 * How a game is named in analysis: brought to the page by the player, with the moves the chat just corrected, taken by a run of the analyst, or afresh,
 * without the corrections and the analyst it had.
 */
export interface AnalysisStart
{
    readonly brought?: boolean;
    readonly corrected?: readonly string[];
    readonly analyst?: AnalystRun;
    readonly afresh?: boolean;
}

/**
 * Names the game in analysis, over the one before; written again each time its review changes, so the page hears of it. The same game keeps its corrections
 * unless it starts afresh, in one write, so that the page never sees it leave the analysis; the analyst stays with the game it took, whichever the page
 * opens meanwhile (Federico), and goes when that game starts afresh.
 */
export function startAnalysis(folder: string, game: string, now: Date, { brought = false, corrected = [], analyst, afresh = false }: AnalysisStart = {}): void
{
    const before = gameInAnalysis(folder);
    const same = !afresh && before?.game === game;
    const kept = [...new Set([...(same ? before.corrected ?? [] : []), ...corrected])];
    const held = afresh && before?.analyst?.game === game ? undefined : before?.analyst;
    writeAnalysis(folder, {
        game,
        at: now.toISOString(),
        ...(brought ? { brought: true } : {}),
        ...(kept.length === 0 ? {} : { corrected: kept }),
        ...withAnalyst(analyst ?? held),
    });
}

/** Lets the analyst go from the game it took, when that game's review is deleted while the page shows another. */
export function forgetAnalyst(folder: string): void
{
    const analysis = gameInAnalysis(folder);

    if (analysis?.analyst !== undefined) {
        const { game, at, brought, corrected } = analysis;
        writeAnalysis(folder, { game, at, ...(brought === undefined ? {} : { brought }), ...(corrected === undefined ? {} : { corrected }) });
    }
}

/** The game in analysis, or none when there is none, or analysis.json cannot be read. */
export function gameInAnalysis(folder: string): Analysis | undefined
{
    try {
        const analysis = JSON.parse(readFileSync(join(folder, fileName), "utf8")) as Partial<Analysis>;
        const corrected = Array.isArray(analysis.corrected) ? analysis.corrected.filter((move) => typeof move === "string") : [];
        return typeof analysis.game === "string" && typeof analysis.at === "string"
            ? {
                game: analysis.game,
                at: analysis.at,
                ...(analysis.brought === true ? { brought: true } : {}),
                ...(corrected.length === 0 ? {} : { corrected }),
                ...withAnalyst(isAnalystRun(analysis.analyst) ? analysis.analyst : undefined),
            }
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

function writeAnalysis(folder: string, analysis: Analysis): void
{
    writeAtomically(join(folder, fileName), `${JSON.stringify(analysis, null, 2)}\n`);
}

function withAnalyst(analyst: AnalystRun | undefined): { analyst?: AnalystRun; }
{
    return analyst === undefined ? {} : { analyst: { game: analyst.game, run: analyst.run, since: analyst.since } };
}

function isAnalystRun(value: unknown): value is AnalystRun
{
    const run = value as Partial<AnalystRun> | undefined;
    return typeof run?.game === "string" && typeof run.run === "string" && typeof run.since === "string";
}
