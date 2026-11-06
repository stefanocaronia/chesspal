// The analyses the page lists (T-106): the games brought to study and those played here, to analyse or open again on the board page.
import { bookOpening } from "../commands/opening-book.ts";
import { closingOf, type GameRecord, gameReviewOf } from "../core/index.ts";
import { archivedGame, archivedGames, keptGame, keptGames } from "../games/index.ts";
import { gameFolder } from "../profiles/index.ts";

/** An analysis as the page lists it: who played, when, how it ended, its opening, how long, and whether the AI has reviewed it. */
export interface AnalysisItem
{
    readonly name: string;
    readonly white: string;
    readonly black: string;
    readonly date?: string;
    readonly result: string;
    readonly opening?: string;
    readonly moves: number;
    readonly reviewed: boolean;
}

/** The games to analyse in the data folder, the latest 20: the games kept to study and those played in the profile, reviewed or not. */
export function analysesOf(folder: string): AnalysisItem[]
{
    const names = [...keptGames(folder), ...archivedGames(gameFolder(folder))].sort((one, other) => stampOf(other).localeCompare(stampOf(one))).slice(0, shown);
    return names.flatMap((name) => itemOf(name, () => name.startsWith("study/") ? keptGame(folder, name) : archivedGame(gameFolder(folder), name)));
}

// Enough for now; a longer list would load more as it scrolls.
const shown = 20;

/** Whether the analyst has reviewed a game: its word on the whole game or on how it ended. The opponent's badges, given during the game with the helps on, are not a review (D-78). */
export function isReviewed(record: GameRecord): boolean
{
    return gameReviewOf(record) !== undefined || closingOf(record) !== undefined;
}

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

    return [{
        name,
        white: tags.White ?? "?",
        black: tags.Black ?? "?",
        ...(date === undefined ? {} : { date }),
        result: tags.Result ?? "*",
        ...(opening === undefined ? {} : { opening }),
        moves: Math.ceil(record.moves.length / 2),
        reviewed: isReviewed(record),
    }];
}

/** The time in a game's name, which orders kept and played games together: 2026-11-04-153012. */
function stampOf(name: string): string
{
    return /(\d{4}-\d{2}-\d{2}-\d{6})/.exec(name)?.[1] ?? "";
}
