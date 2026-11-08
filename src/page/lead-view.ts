// Who is ahead as the page draws it (D-90): the AI's estimate after each move, held to ten pawns each way as chess.com's bar and chart, and the end the board
// gave, a mate or a draw. The page draws what the AI said, never computes it (D-6, D-19).
import type { Badge, Lead, Side } from "../core/index.ts";
import type { Ply } from "./plies.ts";

/** How far the bar and the chart go each way, in pawns: a mate fills them. */
export const leadRange = 10;

/** Who is ahead after a move, as the page draws it. */
export interface Standing
{
    /** The position it is for, by the plies up to it. */
    readonly plies: number;
    /** From -1, all Black's, to 1, all White's. */
    readonly share: number;
    /** The AI's estimate; none after the board ended the game. */
    readonly lead?: Lead;
    /** The side mated on the board. */
    readonly mated?: Side;
    /** A draw on the board: stalemate, repetition, too little material, fifty moves. */
    readonly drawn?: true;
}

/** Who is ahead after each move the AI estimated, and after the board ended the game, with a mate or a draw, in the order of the moves. */
export function standingsOf(plies: readonly Ply[], drawnOnBoard = false): Standing[]
{
    const standings = plies.flatMap((ply, index): Standing[] => {
        if (ply.san.endsWith("#")) {
            const mated = ply.side === "white" ? "black" : "white";
            return [{ plies: index + 1, share: mated === "black" ? 1 : -1, mated }];
        }

        return ply.lead === undefined ? [] : [{ plies: index + 1, share: shareOf(ply.lead), lead: ply.lead }];
    });

    // A draw the board gave takes the place of the AI's last figure, a mate it saw that was not played too (Anatolij and Federico, review of T-148).
    return drawnOnBoard && plies.length > 0
        ? [...standings.filter((standing) => standing.plies < plies.length), { plies: plies.length, share: 0, drawn: true }]
        : standings;
}

/** Who is ahead in the position after `shown` plies: the latest the AI estimated at it or before; none before any. */
export function standingAt(standings: readonly Standing[], shown: number): Standing | undefined
{
    return standings.findLast((standing) => standing.plies <= shown);
}

/** The side ahead, none when even. */
export function sideAhead({ share }: Standing): Side | undefined
{
    return share > 0 ? "white" : share < 0 ? "black" : undefined;
}

/** The badges the chart marks with a dot, as chess.com's does: the finds and the slips. */
export const chartBadges: ReadonlySet<Badge> = new Set(["brilliant", "great", "miss", "mistake", "blunder"]);

/**
 * A lead's share of the bar, from -1 to 1, on a curve as the bars of chess sites: the first pawns, where a game between people turns, move it most; held to
 * the range, a mate all of it (Anatolij and Zoe, review of T-148).
 */
function shareOf(lead: Lead): number
{
    if ("mate" in lead) {
        return Math.sign(lead.mate);
    }

    return Math.tanh(Math.max(-leadRange, Math.min(leadRange, lead.pawns)) / leadCurve);
}

// The pawns ahead that fill three quarters of one side's half of the bar.
const leadCurve = 5;
