// The player's latest games on Lichess and Chess.com (D-110), above the paste field: a row each, which brings that game to study as a pasted PGN would.
import { useEffect, useState } from "preact/hooks";
import type { Side } from "../../core/index.ts";
import { Piece } from "../pieces/pieces.tsx";
import type { Text } from "../text.ts";
import { OutcomeBadge, outcomeOf } from "./outcome.tsx";
import { useRowKeys } from "./rows.ts";
import type { Accounts } from "./studied.ts";

/** A game of the list as the server gives it (`GET /api/site-games`), with the side the player had when their name there tells it. */
export interface SiteGame
{
    readonly site: Site;
    readonly name: string;
    readonly white: string;
    readonly black: string;
    readonly whiteRating?: number;
    readonly blackRating?: number;
    readonly result: string;
    readonly speed: string;
    readonly played: string;
    readonly moves: number;
    readonly player?: Side;
    readonly pgn: string;
}

/**
 * The list, asked of the server when the step opens and the profile has a name on a site. `picked` is the game being sent, whose row keeps the accent and
 * a spinner while the others wait; `problem`, why the server refused it, shown under the list; `onProfile` opens the profile, where the names go.
 */
export function SiteGameList({ accounts, picked, problem, onPick, onProfile, text }: {
    accounts: Accounts | undefined;
    picked: string | undefined;
    problem: string | undefined;
    onPick: (game: SiteGame) => void;
    onProfile: () => void;
    text: Text;
})
{
    const words = text.study;
    const named = accounts?.lichess !== undefined || accounts?.chesscom !== undefined;
    const answer = useSiteGames(named, words.siteGamesRefused);
    const rowKeys = useRowKeys();

    if (!named) {
        return (
            <div class="field analyses site-games">
                <span>{words.siteGames}</span>
                <p class="none">
                    {`${words.siteGamesNoAccount} `}
                    <button class="add-names" type="button" onClick={onProfile}>{words.siteGamesProfile}</button>
                </p>
            </div>
        );
    }

    return (
        <div class="field analyses site-games">
            <span>{words.siteGames}</span>
            {answer === undefined
                ? (
                    <div class="asking" role="status">
                        <span class="spinner" aria-hidden="true" />
                        {words.siteGamesLoading}
                    </div>
                )
                : "refusal" in answer
                ? <p class="site-problem">{answer.refusal}</p>
                : (
                    <>
                        <SiteProblems answer={answer} text={text} />
                        {answer.games.length === 0
                            ? (answer.answered.length === 0 ? null : <p class="none">{words.siteGamesNone}</p>)
                            : (
                                <ul class={`games${picked === undefined ? "" : " picking"}`} aria-label={words.siteGames} {...rowKeys}>
                                    {answer.games.map((game) => <GameRow key={game.name} game={game} picked={picked} onPick={onPick} text={text} />)}
                                </ul>
                            )}
                        {problem === undefined ? null : <p class="problem" role="alert">{problem}</p>}
                    </>
                )}
        </div>
    );
}

type Site = "lichess" | "chess.com";

/** The list as the server gives it: the games, the latest first, the sites that gave theirs, and those that did not answer or have no player by that name. */
interface SiteGames
{
    readonly games: readonly SiteGame[];
    readonly answered: readonly Site[];
    readonly unreached: readonly Site[];
    readonly unknown: readonly Site[];
}

const siteNames: Readonly<Record<Site, string>> = { "lichess": "Lichess", "chess.com": "Chess.com" };

/** The sites that did not answer, both in one line, and those without a player by the profile's name, in the profile window's words. */
function SiteProblems({ answer, text }: { answer: SiteGames; text: Text; })
{
    const silent = answer.unreached.length === 2 ? [text.study.bothUnreached] : answer.unreached.map((site) => text.profile.unreached(siteNames[site]));
    return (
        <>
            {silent.map((line) => <p key={line} class="site-problem unreached">{line}</p>)}
            {answer.unknown.map((site) => <p key={site} class="site-problem">{text.profile.notFound(siteNames[site])}</p>)}
        </>
    );
}

/** A game's row: the side the player had, the opponent and their rating, when, how fast and how long, the site, the result and how it went for the player. */
function GameRow({ game, picked, onPick, text }: { game: SiteGame; picked: string | undefined; onPick: (game: SiteGame) => void; text: Text; })
{
    const words = text.study;
    const rated = (name: string, rating: number | undefined): string => rating === undefined ? name : `${name} (${rating})`;
    const white = rated(game.white, game.whiteRating);
    const black = rated(game.black, game.blackRating);
    const opponent = game.player === undefined ? `${white} – ${black}` : game.player === "white" ? black : white;
    const outcome = game.player === undefined ? undefined : outcomeOf(game.result, game.player);
    const chosen = picked === game.name;

    return (
        <li class={`game${chosen ? " picked" : ""}`}>
            <button class="reopen" type="button" disabled={picked !== undefined} onClick={() => onPick(game)}>
                {game.player === undefined ? null : (
                    <span class="tile" role="img" title={words.playedAs[game.player]} aria-label={words.playedAs[game.player]}>
                        <Piece letter={game.player === "white" ? "K" : "k"} />
                    </span>
                )}
                <span class="what">
                    <b class="who">{opponent}</b>
                    <span class="meta">
                        {[whenOf(game.played, text.language), words.speed(game.speed), words.moves(game.moves)].join(" · ")}
                        <span class="site">{` · ${siteNames[game.site]}`}</span>
                    </span>
                </span>
                <span class="score">
                    <b>{scoreOf(game.result)}</b>
                    {chosen ? <span class="spinner" aria-hidden="true" /> : outcome === undefined ? <span /> : <OutcomeBadge outcome={outcome} words={words} />}
                </span>
            </button>
        </li>
    );
}

/** When a game ended, in the player's time: «11 nov, 18:26», with the year when it is not this one. */
function whenOf(played: string, language: string): string
{
    const when = new Date(played);
    const day = when.toLocaleDateString(language, { day: "numeric", month: "short", ...(when.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }) });
    return `${day}, ${when.toLocaleTimeString(language, { hour: "2-digit", minute: "2-digit" })}`;
}

/** A result as the row shows it: 1–0, 0–1 or ½–½. */
function scoreOf(result: string): string
{
    return result === "1/2-1/2" ? "½–½" : result.replace("-", "–");
}

/** The list asked of the server once, when there is a name to ask by: none while it comes; a refusal in the player's words when the server gives its code. */
function useSiteGames(asked: boolean, refused: Readonly<Record<string, string>>): SiteGames | { refusal: string; } | undefined
{
    const [answer, setAnswer] = useState<SiteGames | { refusal: string; } | undefined>(undefined);

    useEffect(() => {
        if (!asked) {
            return;
        }

        void fetch("/api/site-games")
            .then(async (response) => {
                if (response.ok) {
                    return await response.json() as SiteGames;
                }

                const { error, refusal } = (await response.json()) as { error?: string; refusal?: string; };
                return { refusal: (refusal === undefined ? undefined : refused[refusal]) ?? error ?? response.statusText };
            })
            .catch((error: unknown) => ({ refusal: (error as Error).message }))
            .then(setAnswer);
    }, [asked]);

    return answer;
}
