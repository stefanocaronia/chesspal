// The analyses the page lists: the games brought to study and those played here, to analyse or open again on the board page, or to delete with their
// review or the review alone (D-92).
import type { IncomingMessage, ServerResponse } from "node:http";
import { bookOpening, deleteGame, deleteReview } from "../../commands/index.ts";
import { type AiModel, aiModelIn, annotatorOf, type GameRecord, isReviewed } from "../../core/index.ts";
import { archivedGame, archivedGames, gameStemOf, keptGame, keptGames } from "../../games/index.ts";
import { gameFolder } from "../../profiles/index.ts";
import { bodyOf, isJson, jsonOf, runRoute, sendJson, textOf } from "./http.ts";
import type { Served } from "./page.ts";

/** An analysis as the page lists it: who played, with the AI's model (D-82), when, how it ended, its opening, how long, and whether the AI has reviewed it. */
export interface AnalysisItem
{
    readonly name: string;
    readonly white: string;
    readonly black: string;
    readonly aiModel?: AiModel;
    readonly date?: string;
    readonly result: string;
    readonly opening?: string;
    readonly moves: number;
    readonly reviewed: boolean;
    /** Who reviewed it (D-81). */
    readonly annotator?: AiModel;
    /** Where a game loaded from elsewhere was played, as its Site tag says: the player's name there makes it theirs (D-93). */
    readonly site?: string;
}

/** The games to analyse in the profile in use, the latest first, all of them for the page's search: those kept to study and those played, reviewed or not. */
export function analysesOf(home: string): AnalysisItem[]
{
    const folder = gameFolder(home);
    // By the time in their names, which orders kept and played games together.
    const stamp = (name: string): string => gameStemOf(name) ?? "";
    const names = [...keptGames(folder), ...archivedGames(folder)].sort((one, other) => stamp(other).localeCompare(stamp(one)));
    return names.flatMap((name) => itemOf(name, () => name.startsWith("study/") ? keptGame(folder, name) : archivedGame(folder, name)));
}

/** Answers the page's deletions, of a game or of its review alone, done as the command line does them: true when the request was one. */
export function answerAnalyses(request: IncomingMessage, response: ServerResponse, url: URL, served: Served): boolean
{
    const command = request.method === "POST" ? deletions[url.pathname] : undefined;

    if (command === undefined) {
        return false;
    }

    runRoute(response, async () => {
        const game = textOf(jsonOf(isJson(request) ? await bodyOf(request) : undefined)?.game);

        if (game === undefined) {
            sendJson(response, 400, { error: 'Send the game as JSON: {"game": "games/2026-11-02-153012.pgn"}.' });
            return;
        }

        try {
            sendJson(response, 200, await command.run({ game }, served.context));
        } catch (error) {
            sendJson(response, 409, { error: (error as Error).message });
        }
    });
    return true;
}

const deletions: Readonly<Record<string, typeof deleteGame | typeof deleteReview>> = { "/api/delete-game": deleteGame, "/api/delete-review": deleteReview };

function itemOf(name: string, read: () => GameRecord): AnalysisItem[]
{
    let record: GameRecord;

    try {
        record = read();
    } catch {
        // A game that cannot be read stays out of the list.
        return [];
    }

    const { tags } = record;
    const date = tags.Date === undefined || tags.Date.includes("?") ? undefined : tags.Date;
    const opening = bookOpening(record)?.name;
    const aiModel = aiModelIn(record);
    const site = tags.Site === undefined || /^[?\-\s]*$/.test(tags.Site) ? undefined : tags.Site;
    const signed = annotatorOf(record);
    const annotator = signed === undefined ? undefined : { model: signed.annotator, ...(signed.effort === undefined ? {} : { effort: signed.effort }) };

    return [{
        name,
        white: tags.White ?? "?",
        black: tags.Black ?? "?",
        ...(aiModel === undefined ? {} : { aiModel }),
        ...(date === undefined ? {} : { date }),
        result: tags.Result ?? "*",
        ...(opening === undefined ? {} : { opening }),
        moves: Math.ceil(record.moves.length / 2),
        reviewed: isReviewed(record),
        ...(annotator === undefined ? {} : { annotator }),
        ...(site === undefined ? {} : { site }),
    }];
}
