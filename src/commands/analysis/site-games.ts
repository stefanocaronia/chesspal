// The player's latest games on Lichess and Chess.com (D-110), from the names in the profile in use, to study one: asked anew each time, never kept.
import { z } from "zod";
import { accountSide, type Side } from "../../core/index.ts";
import { activeProfile, type RatingSite } from "../../profiles/index.ts";
import { readSiteGames, type SiteGame, type SiteGames } from "../../sites/index.ts";
import { noGameGoingOn } from "../answers/index.ts";
import { siteText } from "../profiles/index.ts";
import { type Context, defineCommand } from "../registry/index.ts";

/** A game of the list, with the side the player had when one of their names on the sites is on one side alone (D-93). */
export interface ListedGame extends SiteGame
{
    readonly player?: Side;
}

/** The latest games on the sites, with the player's side in each. */
export interface ListedGames extends Omit<SiteGames, "games">
{
    readonly games: readonly ListedGame[];
}

/** Why the list is refused, for the page to say it in the player's words: a game going on, no name on the sites, or no network to ask them. */
export class SiteGamesRefused extends Error
{
    readonly refusal: "game-going" | "no-accounts" | "no-network";

    constructor(refusal: SiteGamesRefused["refusal"], message: string)
    {
        super(message);
        this.refusal = refusal;
    }
}

/** The latest games on the sites, one line each without their PGN, the latest first; the page gets the PGNs too. */
export const siteGames = defineCommand({
    name: "site_games",
    description: "Lists the player's latest finished games on Lichess and Chess.com, from their names there in the profile, the latest first: the side "
        + "they had and the opponent, with the ratings, how it went, the speed, the day, and the game's name. analyse_game takes that name as game, and "
        + "keeps the game to study. Never while a game goes on. Example: site_games {}.",
    input: z.object({}),
    readOnly: true,
    openWorld: true,
    run: async (input, context): Promise<ListedGames> => {
        refusedWhilePlaying(context);
        return profileSiteGames(context);
    },
    format: ({ games, answered, unreached, unknown }) => {
        const none = games.length === 0 && answered.length > 0 ? ["No finished game of standard chess on the sites."] : [];
        const missed = [
            ...(unreached.length === 0 ? [] : [`${sitesText(unreached)} could not be reached: tell the player, and ask again when they ask.`]),
            ...(unknown.length === 0 ? [] : [`${sitesText(unknown)} ${unknown.length === 1 ? "has" : "have"} no player by the profile's name there: the player can correct it in the profile.`]),
        ];
        const next = games.length === 0 ? [] : [`To go over one, analyse_game with game set to its name, such as {"game": "${games[0]!.name}"}.`];
        return [...games.map(gameLine), ...none, ...missed, ...next].join("\n");
    },
});

/**
 * The latest games on the sites of the profile in use, or on one of them alone, each with the player's side; refused when the profile names no account
 * there, or when Chesspal cannot ask the network.
 */
export async function profileSiteGames(context: Context, only?: RatingSite): Promise<ListedGames>
{
    const { accounts } = activeProfile(context.home());
    const asked = only === undefined ? accounts : only === "lichess" ? { lichess: accounts?.lichess } : { chesscom: accounts?.chesscom };

    if (asked?.lichess === undefined && asked?.chesscom === undefined) {
        throw new SiteGamesRefused(
            "no-accounts",
            `Tell the player: put your name on ${only === undefined ? "Lichess or Chess.com" : siteText[only]} in your profile, with the pencil beside your name in Who's playing? on the board page. Nothing changed.`,
        );
    }

    if (context.fetch === undefined) {
        throw new SiteGamesRefused("no-network", "Chesspal cannot reach the sites from here. Nothing changed.");
    }

    const read = await readSiteGames(asked, context.fetch);
    return { ...read, games: read.games.map((game) => withPlayer(game, accounts)) };
}

/** Refused while a game goes on, as every analysis is, with the page's code. */
export function refusedWhilePlaying(context: Context): void
{
    try {
        noGameGoingOn(context);
    } catch (error) {
        throw new SiteGamesRefused("game-going", (error as Error).message);
    }
}

function withPlayer(game: SiteGame, accounts: { lichess?: string; chesscom?: string; } | undefined): ListedGame
{
    const player = accountSide({ White: game.white, Black: game.black, Site: game.site }, accounts);
    return player === undefined ? game : { ...game, player };
}

/** chess.com/live/186997906366: White (3476) vs BATEK_HA_TPAKTOPE (3102), won, blitz, 2026-11-11; from both sides when the player's is not known. */
function gameLine(game: ListedGame): string
{
    const rated = (name: string, rating: number | undefined) => rating === undefined ? name : `${name} (${rating})`;
    const when = `${game.speed}, ${game.played.slice(0, 10)}.`;

    if (game.player === undefined) {
        return `${game.name}: ${rated(game.white, game.whiteRating)} vs ${rated(game.black, game.blackRating)}, ${game.result}, ${when}`;
    }

    const white = game.player === "white";
    const you = rated(white ? "White" : "Black", white ? game.whiteRating : game.blackRating);
    const opponent = white ? rated(game.black, game.blackRating) : rated(game.white, game.whiteRating);
    const went = game.result === "1/2-1/2" ? "drew" : (game.result === "1-0") === white ? "won" : "lost";
    return `${game.name}: ${you} vs ${opponent}, ${went}, ${when}`;
}

function sitesText(sites: readonly RatingSite[]): string
{
    return sites.map((site) => siteText[site]).join(" and ");
}
