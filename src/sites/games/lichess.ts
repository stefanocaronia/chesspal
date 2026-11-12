// The player's latest games on Lichess (D-110): finished, of standard chess, with their clocks and without the site's evaluations.
import { askSiteText, type Fetch } from "../request/index.ts";
import { gamesASite, type SiteGame, siteGameOf, type SiteGamesAnswer } from "./game.ts";

/** What Lichess gives of a name's latest games, the latest first. */
export async function lichessGames(account: string, fetch: Fetch, signal: AbortSignal): Promise<SiteGamesAnswer>
{
    // The speeds of standard chess alone, so that a player of variants still gets their last twenty standard games.
    const query = `max=${gamesASite}&perfType=ultraBullet,bullet,blitz,rapid,classical,correspondence&pgnInJson=true&clocks=true&evals=false&opening=false`;
    const answer = await askSiteText(`https://lichess.org/api/games/user/${encodeURIComponent(account)}?${query}`, "application/x-ndjson", fetch, signal);

    if (answer === undefined || (answer.status !== 200 && answer.status !== 404)) {
        return "unreached";
    }

    if (answer.status === 404) {
        return "unknown";
    }

    const lines = answer.text.split("\n").filter((line) => line.trim() !== "").map(objectOf);

    // An answer with text but no game in it, as a page of HTML, is no answer.
    if (lines.length > 0 && lines.every((line) => line === undefined)) {
        return "unreached";
    }

    return lines.flatMap(gameOf);
}

// Games not yet begun, or still going on.
const unfinished = new Set(["created", "started"]);

type LichessGame = { id?: unknown; variant?: unknown; speed?: unknown; status?: unknown; lastMoveAt?: unknown; pgn?: unknown; };

/** The JSON object of a line; none for a line that is not one. */
function objectOf(line: string): LichessGame | undefined
{
    try {
        const read: unknown = JSON.parse(line);
        return typeof read === "object" && read !== null && !Array.isArray(read) ? read as LichessGame : undefined;
    } catch {
        return undefined;
    }
}

/** The game of one line of Lichess's answer: none for a variant, a game not finished, or a line that is no game. */
function gameOf(game: LichessGame | undefined): SiteGame[]
{
    const { id, variant, speed, status, lastMoveAt, pgn } = game ?? {};

    if (typeof id !== "string" || variant !== "standard" || typeof status !== "string" || unfinished.has(status)) {
        return [];
    }

    if (typeof speed !== "string" || typeof lastMoveAt !== "number" || typeof pgn !== "string") {
        return [];
    }

    const read = siteGameOf("lichess", `lichess/${id}`, speed, new Date(lastMoveAt), pgn);
    return read === undefined ? [] : [read];
}
