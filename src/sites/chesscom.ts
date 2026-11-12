// The player's rating on Chess.com (D-105): their statistics, with the date of the last game at each speed. Chess.com has no classical speed.
import type { SiteReading } from "../profiles/index.ts";
import { counted } from "./choice.ts";
import { askSite, type Fetch } from "./request/index.ts";

/** What Chess.com says of a name: undefined when it could not be reached. */
export async function chesscomReading(account: string, fetch: Fetch, signal: AbortSignal): Promise<SiteReading | undefined>
{
    const statistics = await askSite(`https://api.chess.com/pub/player/${encodeURIComponent(account.toLowerCase())}/stats`, fetch, signal);

    if (statistics === undefined || (statistics.status !== 200 && statistics.status !== 404)) {
        return undefined;
    }

    if (statistics.status === 404) {
        return { account, found: false };
    }

    const speeds = statistics.body as Record<string, { last?: { rating?: unknown; rd?: unknown; date?: unknown; }; } | undefined> | undefined;
    const chosen = counted((speed) => {
        const last = speeds?.[`chess_${speed}`]?.last;
        return typeof last?.rating === "number" && typeof last.rd === "number"
            ? { value: last.rating, deviation: last.rd, established: last.rd < provisional, ...(typeof last.date === "number" ? { played: dayOf(last.date) } : {}) }
            : undefined;
    });

    return chosen === undefined ? { account, found: true } : { account, found: true, rating: { ...chosen, site: "chess.com" } };
}

// Chess.com gives no provisional mark: a rating is provisional while its deviation (RD) is as wide as Lichess's provisional ones.
const provisional = 110;

function dayOf(seconds: number): string
{
    return new Date(seconds * 1000).toISOString().slice(0, 10);
}
