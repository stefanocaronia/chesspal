// A question to a site's public API (D-24): JSON over HTTPS, without a key, named as Chesspal and nothing of the player's besides the name asked.
import { version } from "../version.ts";

/** How Chesspal fetches: the global fetch, or the tests' own. */
export type Fetch = typeof globalThis.fetch;

/** What a site answered: its status and its JSON, none when it sent none. */
export interface SiteAnswer
{
    readonly status: number;
    readonly body?: unknown;
}

/** The longest the sites may take to answer, together, in milliseconds: the page waits for them. */
export const answerTime = 5000;

/** Asks a site for JSON: what it answered, or undefined when it could not be reached before `signal` gave up. */
export async function askSite(url: string, fetch: Fetch, signal: AbortSignal): Promise<SiteAnswer | undefined>
{
    try {
        const response = await fetch(url, { headers: { "Accept": "application/json", "User-Agent": `Chesspal/${version}` }, signal });
        const body: unknown = await response.json().catch(() => undefined);
        return body === undefined ? { status: response.status } : { status: response.status, body };
    } catch {
        return undefined;
    }
}
