// The player's ratings read again from the sites (D-105, D-106): when their names there change, and when the page opens a day after the last reading;
// never from a tool of the AI's.
import { listProfiles, type PlayerProfile, profileFolder, saveReadings } from "../profiles/index.ts";
import { type Fetch, readingsStale, readSites } from "../sites/index.ts";
import type { Context } from "./context.ts";

/** A day, in milliseconds: the page reads the ratings again once they are older. */
export const ratingsAge = 24 * 60 * 60 * 1000;

/**
 * Reads a profile's ratings again when its names on the sites changed, a site did not answer ten minutes ago or more, or the last reading is older than `olderThan`
 * milliseconds: whether new readings were kept. One reading at a time of the same names in this process.
 */
export function refreshRatings(context: Context, id: string, olderThan = Infinity): Promise<boolean>
{
    const home = context.home();
    const profile = listProfiles(home).find((one) => one.id === id);

    if (profile === undefined || context.fetch === undefined) {
        return Promise.resolve(false);
    }

    const key = [home, id, profile.accounts?.lichess, profile.accounts?.chesscom].join("\n");
    const going = reading.get(key);

    if (going !== undefined) {
        return going;
    }

    const read = readAgain(context, profile, context.fetch, olderThan).finally(() => reading.delete(key));
    reading.set(key, read);
    return read;
}

const reading = new Map<string, Promise<boolean>>();

async function readAgain(context: Context, { id, accounts, sites }: PlayerProfile, fetch: Fetch, olderThan: number): Promise<boolean>
{
    const home = context.home();
    const age = sites === undefined ? Infinity : context.now().getTime() - Date.parse(sites.read);

    if (!readingsStale(sites, accounts, context.now()) && age < olderThan) {
        return false;
    }

    if (accounts === undefined) {
        saveReadings(profileFolder(home, id), undefined);
        return true;
    }

    const read = await readSites(accounts, fetch, sites, context.now());
    // The names may have changed while the sites answered: what they said of the names before is not kept, and the change reads its own.
    const now = listProfiles(home).find((one) => one.id === id);

    if (now?.accounts?.lichess !== accounts.lichess || now?.accounts?.chesscom !== accounts.chesscom) {
        return false;
    }

    saveReadings(profileFolder(home, id), read);
    return true;
}
