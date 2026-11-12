// The move shown, kept in the page's address as #2026-11-04-184025/31: the game by its name and how many of its moves are shown, so that a reload keeps it and
// a link brings the player back to it.
import { useEffect, useRef, useState } from "preact/hooks";

/** A place in a game as the address keeps it: the game's name without its folder, and how many of its moves are shown, none for the game as it is. */
export interface Anchor
{
    readonly game: string;
    readonly plies?: number;
}

/** The place an address's hash names, or none: #2026-11-04-184025/31 a move of a game, #2026-11-04-184025 the game as it is. */
export function anchorOf(hash: string): Anchor | undefined
{
    const [, game, plies] = new RegExp(`^#?(${stem})(?:/(\\d{1,4}))?$`).exec(hash) ?? [];
    return game === undefined ? undefined : plies === undefined ? { game } : { game, plies: Number(plies) };
}

/** The hash of a place in a game, as anchorOf reads it. */
export function hashOf(anchor: Anchor): string
{
    return anchor.plies === undefined ? `#${anchor.game}` : `#${anchor.game}/${anchor.plies}`;
}

/** A game's name in the address, from its name in the player's folder: games/2026-11-04-184025.pgn and study/2026-11-04-184025.pgn are 2026-11-04-184025. */
export function anchorName(name: string): string | undefined
{
    return new RegExp(`(${stem})\\.pgn$`).exec(name)?.[1];
}

// A game's name without its folder and .pgn, the time it started, as games/archive.ts writes it: the page cannot import that module.
const stem = /\d{4}-\d{2}-\d{2}-\d{6}/.source;

/** The games the page knows, for the address: the one on the board, and the one in the player's folder, going on or just over. */
export interface AnchoredGames
{
    /** Whether the page has read the games yet. */
    readonly ready: boolean;
    readonly shown: string | undefined;
    readonly played: string | undefined;
    readonly going: boolean;
}

/**
 * What the page does with the place the address names: goes to its move on the game shown; refuses it while a game goes on; waits while its game opens
 * in analysis, `asked` already; else opens its game in analysis, but the game just played, which opens on the player's yes alone (D-89): the link waits
 * for it while the table is set (D-77), and goes once another game shows (Zoe).
 */
export function anchorAction(wanted: Anchor, games: AnchoredGames, asked: string | undefined): "view" | "refuse" | "drop" | "wait" | "open"
{
    if (wanted.game === games.shown) {
        return "view";
    }

    if (games.going) {
        return "refuse";
    }

    if (wanted.game === games.played) {
        return games.shown === undefined ? "wait" : "drop";
    }

    return wanted.game === asked ? "wait" : "open";
}

/** The hash of the move shown: the game alone at its end, and while it goes on, when the player wants the position as it is (Zoe). */
export function shownHash(games: AnchoredGames, viewing: number | undefined): string
{
    return games.shown === undefined ? "" : hashOf(viewing === undefined || games.going ? { game: games.shown } : { game: games.shown, plies: viewing });
}

/** Why the page did not open the game a link names: a game goes on, or the game is not in the profile. */
export type LinkIgnored = "going" | "gone";

/**
 * Keeps the move shown in the address, and goes to the place the address names as the page opens or as the player writes it (anchorAction); `open` opens a
 * game in analysis and says whether it did, and `ignored` says why a link was not followed. A link never shows its move on another game.
 */
export function useAnchor(
    games: AnchoredGames,
    viewing: number | undefined,
    view: (plies: number | undefined) => void,
    open: (game: string) => Promise<boolean>,
    ignored: (why: LinkIgnored) => void,
): void
{
    const { ready, shown, played, going } = games;
    const [wanted, setWanted] = useState(() => anchorOf(location.hash));
    const asked = useRef<string | undefined>(undefined);

    useEffect(() => {
        const heard = (): void => {
            asked.current = undefined;
            setWanted(anchorOf(location.hash));
        };

        window.addEventListener("hashchange", heard);
        return () => window.removeEventListener("hashchange", heard);
    }, []);

    useEffect(() => {
        if (!ready || wanted === undefined) {
            return;
        }

        const action = anchorAction(wanted, games, asked.current);

        if (action === "view") {
            view(wanted.plies);
        }

        if (action === "refuse") {
            ignored("going");
        }

        if (action === "view" || action === "refuse" || action === "drop") {
            setWanted(undefined);
        }

        if (action !== "open") {
            return;
        }

        const game = wanted.game;
        asked.current = game;
        void open(game).then((opened) => {
            // A place written since stays wanted (Federico).
            if (!opened && asked.current === game) {
                ignored("gone");
                setWanted(undefined);
            }
        });
    }, [ready, shown, played, going, wanted]);

    useEffect(() => {
        if (!ready || wanted !== undefined) {
            return;
        }

        const hash = shownHash(games, viewing);

        if (hash !== location.hash) {
            history.replaceState(history.state, "", hash === "" ? location.pathname + location.search : hash);
        }
    }, [ready, shown, going, viewing, wanted]);
}
