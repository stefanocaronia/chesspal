// A question to a site's public API (D-24): JSON or text over HTTPS, without a key, named as Chesspal and nothing of the player's besides the name asked.
import { version } from "../../version.ts";

/** How Chesspal fetches: the global fetch, or the tests' own. */
export type Fetch = typeof globalThis.fetch;

/** What a site answered: its status and its JSON, none when it sent none. */
export interface SiteAnswer
{
    readonly status: number;
    readonly body?: unknown;
}

/** What a site answered in text: its status and its text, as Lichess's games, one JSON object a line. */
export interface SiteText
{
    readonly status: number;
    readonly text: string;
}

/** The longest the sites may take to answer, together, in milliseconds: the page waits for them. */
export const answerTime = 5000;

/** Asks a site for JSON: what it answered, or undefined when it could not be reached before `signal` gave up. */
export async function askSite(url: string, fetch: Fetch, signal: AbortSignal): Promise<SiteAnswer | undefined>
{
    try {
        const response = await fetch(url, { headers: headersFor("application/json"), signal });
        // The whole body read here: one the signal cuts short is a site not reached, not an answer without JSON.
        const body = jsonOf(await response.text());
        return body === undefined ? { status: response.status } : { status: response.status, body };
    } catch {
        return undefined;
    }
}

/** Asks a site for text of the type `accept` names: what it answered, or undefined when it could not be reached, or stopped, before `signal` gave up. */
export async function askSiteText(url: string, accept: string, fetch: Fetch, signal: AbortSignal): Promise<SiteText | undefined>
{
    try {
        const response = await fetch(url, { headers: headersFor(accept), signal });
        return { status: response.status, text: await response.text() };
    } catch {
        return undefined;
    }
}

function jsonOf(text: string): unknown
{
    try {
        return JSON.parse(text) as unknown;
    } catch {
        return undefined;
    }
}

function headersFor(accept: string): Record<string, string>
{
    return { "Accept": accept, "User-Agent": `Chesspal/${version}` };
}
