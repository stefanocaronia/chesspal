// How a game ended, as the page names it (T-77): by the board, or by a resignation or a draw agreed, which only the record's Termination tag says (D-37).
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { Ending, Outcome } from "../core/index.ts";

/** The ways a game ends. */
export type HowEnded = Ending | "resignation" | "agreement" | "time";

/** How the game ended, from the board or the record's Termination tag; undefined while it goes on, or when the record does not say. */
export function howEnded(outcome: Outcome, termination: string | undefined): HowEnded | undefined
{
    if (outcome.over) {
        return outcome.ending;
    }

    // Ours, and those of games played elsewhere (D-68): "Game drawn by agreement", Lichess's "Time forfeit", chess.com's "X won by resignation" in any of
    // its languages, "X ha vinto per abbandono".
    if (/^draw agreed$|by agreement|per accordo/i.test(termination ?? "")) {
        return "agreement";
    }

    // A flag that fell (T-37): "Black lost on time", "Black ran out of time and White cannot mate".
    if (/ (lost on|ran out of|won on) time\b|time forfeit|per tempo/i.test(termination ?? "")) {
        return "time";
    }

    // "White resigns", or a draw (D-65): "White resigns and Black cannot mate".
    return / resigns\b|by resignation|per abbandono/i.test(termination ?? "") ? "resignation" : undefined;
}

/**
 * Whether the game ended a moment ago under the player's eyes, from going on to over, for as long as the page's effects on it last; a game already over when
 * the page reads it does not count. `state` is undefined until the page has the game.
 */
export function useJustEnded(state: "going" | "over" | undefined): boolean
{
    const before = useRef(state);
    const [just, setJust] = useState(false);

    // Before the page paints: a frame of the end at rest would show before its effects.
    useLayoutEffect(() => {
        const ended = before.current === "going" && state === "over";
        before.current = state;

        if (!ended) {
            return;
        }

        setJust(true);
        const timer = setTimeout(() => setJust(false), effectsLast);

        return () => {
            clearTimeout(timer);
            setJust(false);
        };
    }, [state]);

    return just;
}

/**
 * Whether the AI declined the player's draw offer by its move (D-65): their offer gone with a move more and the game going on, until the next move. `moves`
 * is how many the game has.
 */
export function useDeclined(offer: "player" | "ai" | undefined, moves: number, over: boolean): boolean
{
    const before = useRef({ offer, moves });
    const [declinedAt, setDeclinedAt] = useState<number | undefined>(undefined);

    useEffect(() => {
        if (before.current.offer === "player" && offer === undefined && moves > before.current.moves && !over) {
            setDeclinedAt(moves);
        }

        before.current = { offer, moves };
    }, [offer, moves, over]);

    return declinedAt === moves && !over;
}

/** How long the effects of a game over last, the longest of the style's: the board's, then the card's light. */
const effectsLast = 2800;
