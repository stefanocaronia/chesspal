// The player's latest games on Chess.com (D-110): its archives by month, the last one, and the one before when the last holds too few.
import { askSite, type Fetch } from "../request/index.ts";
import { gamesASite, latestFirst, type SiteGame, siteGameOf, type SiteGamesAnswer } from "./game.ts";

/** What Chess.com gives of a name's latest games, the latest first. */
export async function chesscomGames(account: string, fetch: Fetch, signal: AbortSignal): Promise<SiteGamesAnswer>
{
    const archives = await askSite(`${address}${encodeURIComponent(account.toLowerCase())}/games/archives`, fetch, signal);

    if (archives === undefined || (archives.status !== 200 && archives.status !== 404)) {
        return "unreached";
    }

    if (archives.status === 404) {
        return "unknown";
    }

    // The months' addresses, the oldest first: the last two are read, the latest first.
    const listed = (archives.body as { archives?: unknown; } | undefined)?.archives;

    // A 200 without its list of months, as a page of HTML, is no answer.
    if (!Array.isArray(listed)) {
        return "unreached";
    }

    const months = listed.filter((month): month is string => typeof month === "string" && month.startsWith(address));
    const games: SiteGame[] = [];

    for (const monthAddress of months.slice(-2).reverse()) {
        const month = await monthGames(monthAddress, fetch, signal);

        // A month that cannot be read fails the site only when it gave no game yet.
        if (month === undefined) {
            if (games.length === 0) {
                return "unreached";
            }

            break;
        }

        games.push(...month);

        if (games.length >= gamesASite) {
            break;
        }
    }

    return games.sort(latestFirst).slice(0, gamesASite);
}

// Where Chess.com keeps a player's games: the months it lists are asked only there.
const address = "https://api.chess.com/pub/player/";

/** The games of standard chess of a month; undefined when it could not be read. */
async function monthGames(monthAddress: string, fetch: Fetch, signal: AbortSignal): Promise<SiteGame[] | undefined>
{
    const month = await askSite(monthAddress, fetch, signal);
    const listed = (month?.body as { games?: unknown; } | undefined)?.games;

    if (month?.status !== 200 || !Array.isArray(listed)) {
        return undefined;
    }

    return listed.flatMap((game: unknown) => {
        const { url, pgn, time_class: speed, rules, end_time: ended } = (game ?? {}) as { url?: unknown; pgn?: unknown; time_class?: unknown; rules?: unknown; end_time?: unknown; };

        if (rules !== "chess" || typeof url !== "string" || typeof pgn !== "string" || typeof speed !== "string" || typeof ended !== "number") {
            return [];
        }

        const read = siteGameOf("chess.com", `chess.com/${url.split("/").slice(-2).join("/")}`, speed, new Date(ended * 1000), pgn);
        return read === undefined ? [] : [read];
    });
}
