// How a game ended, as the page names it (T-77): by the board, or by a resignation or a draw agreed, which only the record's Termination tag says (D-37).
import { useEffect, useRef, useState } from "preact/hooks";
import type { Ending, Outcome } from "../core/index.ts";

/** The ways a game ends. */
export type HowEnded = Ending | "resignation" | "agreement";

/** How the game ended, from the board or the record's Termination tag; undefined while it goes on, or when the record does not say. */
export function howEnded(outcome: Outcome, termination: string | undefined): HowEnded | undefined
{
    if (outcome.over) {
        return outcome.ending;
    }

    if (termination === "draw agreed") {
        return "agreement";
    }

    return termination?.endsWith(" resigns") === true ? "resignation" : undefined;
}

/**
 * Whether the game ended a moment ago under the player's eyes, from going on to over, for as long as the page's effects on it last; a game already over when
 * the page reads it does not count. `state` is undefined until the page has the game.
 */
export function useJustEnded(state: "going" | "over" | undefined): boolean
{
    const before = useRef(state);
    const [just, setJust] = useState(false);

    useEffect(() => {
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

/** How long the effects of a game over last, the longest of the style's: the board's, then the card's light. */
const effectsLast = 2800;
