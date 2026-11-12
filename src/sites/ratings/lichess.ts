// The player's rating on Lichess (D-105): their profile, then the date of their last game at the speed that counts.
import type { SiteReading } from "../../profiles/index.ts";
import { askSite, type Fetch } from "../request/index.ts";
import { counted, type Played } from "./choice.ts";

/** What Lichess says of a name: undefined when it could not be reached. */
export async function lichessReading(account: string, fetch: Fetch, signal: AbortSignal): Promise<SiteReading | undefined>
{
    const user = await askSite(`${address}/${encodeURIComponent(account)}`, fetch, signal);

    if (user === undefined || (user.status !== 200 && user.status !== 404)) {
        return undefined;
    }

    const profile = user.body as { disabled?: boolean; perfs?: Record<string, { rating?: unknown; rd?: unknown; prov?: unknown; games?: unknown; } | undefined>; } | undefined;

    // A closed account is no player any more.
    if (user.status === 404 || profile?.disabled === true) {
        return { account, found: false };
    }

    const chosen = counted((speed) => {
        const speedRating = profile?.perfs?.[speed];
        return typeof speedRating?.rating === "number" && typeof speedRating.rd === "number" && typeof speedRating.games === "number"
            ? { value: speedRating.rating, deviation: speedRating.rd, established: speedRating.prov !== true && speedRating.games > 0 }
            : undefined;
    });

    if (chosen === undefined) {
        return { account, found: true };
    }

    const played = await lastPlayed(account, chosen.speed, fetch, signal);
    return { account, found: true, rating: { ...chosen, site: "lichess", ...(played === undefined ? {} : { played }) } };
}

const address = "https://lichess.org/api/user";

// The day of the last game at that speed, from the speed's statistics: the profile gives only when the player was last seen.
async function lastPlayed(account: string, speed: Played["speed"], fetch: Fetch, signal: AbortSignal): Promise<string | undefined>
{
    const statistics = await askSite(`${address}/${encodeURIComponent(account)}/perf/${speed}`, fetch, signal);
    const last = (statistics?.body as { stat?: { playStreak?: { lastDate?: unknown; }; }; } | undefined)?.stat?.playStreak?.lastDate;
    return typeof last === "string" && /^\d{4}-\d{2}-\d{2}/.test(last) ? last.slice(0, 10) : undefined;
}
