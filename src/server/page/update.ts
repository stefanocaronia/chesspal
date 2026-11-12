// A newer Chesspal on npm (D-108): the page's server asks as it starts and every hour after; the table's page offers to install it, a chat's own page says
// the command to type.
import { answerTime, askSite } from "../../sites/index.ts";
import { isOlder, version } from "../../version.ts";
import { tellWatchers } from "./events.ts";
import type { Served } from "./page.ts";

/**
 * What the page shows of a newer Chesspal: its version, and on the table whether it is being installed, or installed and waiting for the game to end and
 * the chat to be at rest.
 */
export interface UpdateShown
{
    readonly version: string;
    readonly installing?: true;
    readonly installed?: true;
}

/** Asks npm for Chesspal's latest version now and every hour after, the pages told when it is newer than this one; how to stop. None in the tests. */
export function watchForUpdates(served: Served, every: number = anHour): () => void
{
    const fetch = served.context.fetch;

    if (fetch === undefined) {
        return () => undefined;
    }

    const ask = async (): Promise<void> => {
        const latest = await latestVersion(fetch);

        if (latest !== undefined && isOlder(version, latest) && latest !== served.newer) {
            served.newer = latest;
            tellWatchers(served.watchers);
        }
    };

    void ask();
    const timer = setInterval(() => void ask(), every);
    timer.unref();
    return () => clearInterval(timer);
}

/** The newer Chesspal the page shows, when npm has one. */
export function updateShown(served: Served): { update?: UpdateShown; }
{
    const { newer, updating } = served;

    if (newer === undefined) {
        return {};
    }

    return { update: { version: newer, ...(updating === "installed" ? { installed: true } : updating === undefined ? {} : { installing: true }) } };
}

/** Chesspal's latest version on npm, none when npm cannot be reached in time or answers something else. */
export async function latestVersion(fetch: typeof globalThis.fetch): Promise<string | undefined>
{
    const answer = await askSite(latestUrl, fetch, AbortSignal.timeout(answerTime));
    const said = (answer?.body as { version?: unknown; } | undefined)?.version;
    // Only a plain release: the version goes into npm's command line.
    return answer?.status === 200 && typeof said === "string" && /^\d+\.\d+\.\d+$/.test(said) ? said : undefined;
}

const latestUrl = "https://registry.npmjs.org/chesspal/latest";
const anHour = 60 * 60 * 1000;
