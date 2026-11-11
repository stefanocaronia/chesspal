// The player's ratings on the sites they named (D-105): both asked together, and what a site that does not answer said before kept.
import type { Accounts, SiteReading, SiteReadings } from "../profiles/index.ts";
import { chesscomReading } from "./chesscom.ts";
import { lichessReading } from "./lichess.ts";
import type { Fetch } from "./request.ts";

/** What Lichess and chess.com say now of the player's names there, at `now`; a site that cannot be reached keeps what it said before of the same name. */
export async function readSites(accounts: Accounts, fetch: Fetch, before: SiteReadings | undefined, now: Date): Promise<SiteReadings>
{
    const [lichess, chesscom] = await Promise.all([
        accounts.lichess === undefined ? undefined : lichessReading(accounts.lichess, fetch).then((read) => settled(accounts.lichess!, read, before?.lichess)),
        accounts.chesscom === undefined ? undefined : chesscomReading(accounts.chesscom, fetch).then((read) => settled(accounts.chesscom!, read, before?.chesscom)),
    ]);
    return { read: now.toISOString(), ...(lichess === undefined ? {} : { lichess }), ...(chesscom === undefined ? {} : { chesscom }) };
}

/** Whether the readings are of other names than the profile's now, or a site did not answer: they are read again then, whatever their age. */
export function readingsStale(readings: SiteReadings | undefined, accounts: Accounts | undefined): boolean
{
    const stale = (reading: SiteReading | undefined, account: string | undefined): boolean => reading === undefined ? account !== undefined : account === undefined || !sameName(reading.account, account) || reading.unreached === true;
    return stale(readings?.lichess, accounts?.lichess) || stale(readings?.chesscom, accounts?.chesscom);
}

function settled(account: string, read: SiteReading | undefined, before: SiteReading | undefined): SiteReading
{
    if (read !== undefined) {
        return read;
    }

    return before !== undefined && sameName(before.account, account) ? { ...before, account, unreached: true } : { account, unreached: true };
}

// The sites take a name in capitals or not.
function sameName(one: string, other: string): boolean
{
    return one.toLowerCase() === other.toLowerCase();
}
