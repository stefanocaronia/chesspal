// Where the page stands, and what its header says of it: a game in analysis (D-69), a game going on, a game over, or the table set for the next (D-77).
import type { Side } from "../../core/index.ts";
import type { HowEnded } from "../game/ending.ts";
import type { Text } from "../text.ts";

/** Where the page stands: a game in analysis, a game going on, a game over the page saw end, or the table set between games; none while it loads. */
export type PagePhase = "analysis" | "going" | "over" | "idle" | undefined;

/**
 * The page's phase: a game `analysing`, else the game the server sent, null before the first, whether it is `over`, and whether the page saw it end, which
 * keeps its final position until the next starts.
 */
export function phaseOf(analysing: boolean, game: object | null | undefined, over: boolean, sawEnd: boolean): PagePhase
{
    if (analysing) {
        return "analysis";
    }

    if (game === undefined) {
        return undefined;
    }

    if (game !== null && !over) {
        return "going";
    }

    return sawEnd ? "over" : "idle";
}

/** Whether the board shows the helps: always in analysis, where the player uses every tool there is (D-114); in a game, with the helps `switched` on. */
export function helpsShown(phase: PagePhase, switched: boolean): boolean
{
    return phase === "analysis" || (phase === "going" && switched);
}

/** What the header says of the game, with the kind that gives it a colour and an icon: in analysis, none going on, how it ended, or the draw offered. */
export function verdictOf(phase: PagePhase, how: HowEnded | undefined, winner: Side | undefined, offer: "player" | "ai" | undefined, declined: boolean, text: Text): Verdict
{
    if (phase === "analysis") {
        return { kind: "analysis", verdict: text.analysing };
    }

    if (phase === "idle") {
        return { kind: "idle", verdict: text.noGameNow };
    }

    if (phase === "over") {
        return { kind: "over", verdict: text.verdict(how, winner) };
    }

    const verdict = offer === "ai" ? text.offers : offer === "player" ? text.drawOffered : declined ? text.declines : undefined;
    return verdict === undefined ? {} : { kind: "offer", verdict };
}

/** The header's word on the game, and its kind. */
export interface Verdict
{
    readonly kind?: VerdictKind;
    readonly verdict?: string;
}

/** What the header's chip says: the game in analysis (D-69), a game over, a draw offered or declined (D-65), no game going on (D-77). */
export type VerdictKind = "analysis" | "over" | "offer" | "idle";
