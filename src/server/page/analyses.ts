// The analyses the page lists: the games brought to study and those played here, to analyse or open again on the board page, or to delete with their
// review or the review alone (D-92); and the player's latest games on the sites, to bring one (D-110).
import type { IncomingMessage, ServerResponse } from "node:http";
import { bookOpening, deleteGame, deleteReview, siteGames, SiteGamesRefused } from "../../commands/index.ts";
import { type AiModel, aiModelIn, annotatorOf, type GameRecord, isReviewed, leadOf, reviewOf } from "../../core/index.ts";
import { archivedGame, archivedGames, archivedGameUnplayed, gameInAnalysis, gameStemOf, keptGame, keptGames } from "../../games/index.ts";
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
    /** A review begun and not finished, its notes or the analyst that took it, which the page lets the player write again or delete (Stefano). */
    readonly begun?: true;
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
    const taken = gameInAnalysis(folder)?.analyst?.game;
    return names.flatMap((name) => itemOf(name, () => name.startsWith("study/") ? withBookOpening(keptGame(folder, name)) : archivedListed(folder, name), taken === name));
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

/**
 * Sends the player's latest games on the sites, as site_games gives them with their PGNs (D-110); its refusal as a 409, with the code the page says it by in
 * its own words: a game going on, no name on the sites, no network.
 */
export function sendSiteGames(response: ServerResponse, served: Served): void
{
    runRoute(response, async () => {
        try {
            sendJson(response, 200, await siteGames.run({}, served.context));
        } catch (error) {
            if (!(error instanceof SiteGamesRefused)) {
                throw error;
            }

            sendJson(response, 409, { error: error.message, refusal: error.refusal });
        }
    });
}

const deletions: Readonly<Record<string, typeof deleteGame | typeof deleteReview>> = { "/api/delete-game": deleteGame, "/api/delete-review": deleteReview };

// A game as the list reads it: its record, and the name of the opening it reached.
interface Listed
{
    readonly record: GameRecord;
    readonly opening: string | undefined;
}

/**
 * A game of the archive for the list: its moves taken as written, not played, when the archive wrote its PlyCount, with its opening's tags, none for a game
 * that has none; a game an older Chesspal archived is read whole, its opening looked up.
 */
function archivedListed(folder: string, name: string): Listed
{
    const unplayed = archivedGameUnplayed(folder, name);
    return /^\d+$/.test(unplayed.tags.PlyCount ?? "") ? { record: unplayed, opening: unplayed.tags.Opening } : withBookOpening(archivedGame(folder, name));
}

function withBookOpening(record: GameRecord): Listed
{
    return { record, opening: bookOpening(record)?.name };
}

function itemOf(name: string, read: () => Listed, taken: boolean): AnalysisItem[]
{
    let record: GameRecord;
    let opening: string | undefined;

    try {
        ({ record, opening } = read());
    } catch {
        // A game that cannot be read stays out of the list.
        return [];
    }

    // A game closed before any move has nothing to analyse; a position brought to study without moves stays, to open again or delete.
    if (record.moves.length === 0 && name.startsWith("games/")) {
        return [];
    }

    const { tags } = record;
    const date = tags.Date === undefined || tags.Date.includes("?") ? undefined : tags.Date;
    const aiModel = aiModelIn(record);
    const site = tags.Site === undefined || /^[?\-\s]*$/.test(tags.Site) ? undefined : tags.Site;
    const signed = annotatorOf(record);
    const annotator = signed === undefined ? undefined : { model: signed.annotator, ...(signed.effort === undefined ? {} : { effort: signed.effort }) };
    const reviewed = isReviewed(record);
    const begun = !reviewed && (taken || reviewBegun(record));

    return [{
        name,
        white: tags.White ?? "?",
        black: tags.Black ?? "?",
        ...(aiModel === undefined ? {} : { aiModel }),
        ...(date === undefined ? {} : { date }),
        result: tags.Result ?? "*",
        ...(opening === undefined ? {} : { opening }),
        moves: Math.ceil(record.moves.length / 2),
        reviewed,
        ...(begun ? { begun: true } : {}),
        ...(annotator === undefined ? {} : { annotator }),
        ...(site === undefined ? {} : { site }),
    }];
}

/** Whether a game holds part of a review on its moves: a note, a badge but the book's, which Chesspal puts there, or who is ahead. */
function reviewBegun(record: GameRecord): boolean
{
    return record.moves.some(({ comment }) => {
        const review = reviewOf(comment);
        return review?.note !== undefined || (review?.badge !== undefined && review.badge !== "book") || leadOf(comment) !== undefined;
    });
}
