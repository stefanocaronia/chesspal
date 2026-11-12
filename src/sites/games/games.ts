// The player's latest games on the sites they named (D-110): asked together, merged the latest first; nothing kept on disk.
import type { Accounts, RatingSite } from "../../profiles/index.ts";
import type { Fetch } from "../request/index.ts";
import { chesscomGames } from "./chesscom.ts";
import { latestFirst, type SiteGame, type SiteGamesAnswer } from "./game.ts";
import { lichessGames } from "./lichess.ts";

/** The latest games of the sites asked, the latest first; the sites that gave their list, those that could not be reached, and those with no player of that name. */
export interface SiteGames
{
    readonly games: readonly SiteGame[];
    readonly answered: readonly RatingSite[];
    readonly unreached: readonly RatingSite[];
    readonly unknown: readonly RatingSite[];
}

/** What Lichess and Chess.com give now of the player's latest games there, each asked only for a name it has: a site that fails never fails the other. */
export async function readSiteGames(accounts: Accounts, fetch: Fetch): Promise<SiteGames>
{
    const signal = AbortSignal.timeout(siteGamesTime);
    const ask = async (site: RatingSite, account: string | undefined, games: typeof lichessGames): Promise<(readonly [RatingSite, SiteGamesAnswer])[]> => account === undefined ? [] : [[site, await games(account, fetch, signal)]];
    const answers = (await Promise.all([ask("lichess", accounts.lichess, lichessGames), ask("chess.com", accounts.chesscom, chesscomGames)])).flat();
    const sitesThat = (said: (answer: SiteGamesAnswer) => boolean): RatingSite[] => answers.filter(([, answer]) => said(answer)).map(([site]) => site);
    return {
        games: answers.flatMap(([, answer]) => typeof answer === "string" ? [] : answer).sort(latestFirst),
        answered: sitesThat((answer) => typeof answer !== "string"),
        unreached: sitesThat((answer) => answer === "unreached"),
        unknown: sitesThat((answer) => answer === "unknown"),
    };
}

/** The site of a game's name as the list writes it. */
export function siteOfGameName(name: string): RatingSite
{
    return name.startsWith("lichess/") ? "lichess" : "chess.com";
}

// The longest the sites may take to give the games, together, in milliseconds: a month of Chess.com's can be long.
const siteGamesTime = 10_000;
