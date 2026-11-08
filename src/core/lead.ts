// Who is ahead in a position, as the AI estimates it (D-90): in pawns from White's side, as chess.com shows it, or a mate it sees. It rides in a move's
// comment as [%lead +1.5] or [%lead #-3], Chesspal's own command and not [%eval], which elsewhere would pass for an engine's. Chesspal keeps it and draws
// it, never computes it (D-6, D-19).
import { type RecordedMove, recordedMove } from "./record.ts";

/** Who is ahead after a move: pawns from White's side (+1.5 White, -3 Black), or a mate in so many moves (#3 White's, #-3 Black's). */
export type Lead = { readonly pawns: number; } | { readonly mate: number; };

/** A lead as the AI writes it: +1.5, -3, 0, #3, #-2; none when it is not one. */
export function readLead(text: string): Lead | undefined
{
    const plain = text.trim().replaceAll("−", "-").replace(/^M/i, "#").replace(/^([+-])[#M]/i, "#$1");
    const mate = /^#([+-]?)(\d+)$/.exec(plain);

    if (mate !== null) {
        const moves = Number(mate[2]);
        return moves < 1 || moves > leadLimit ? undefined : { mate: mate[1] === "-" ? -moves : moves };
    }

    if (!/^[+-]?\d+(\.\d+)?$/.test(plain)) {
        return undefined;
    }

    // To a tenth, a half away from zero on both sides; never a negative zero: -0.04 is an even game.
    const figure = Number(plain);
    const pawns = Math.sign(figure) * Math.round(Math.abs(figure) * 10) / 10;
    return Math.abs(pawns) > leadLimit ? undefined : { pawns: pawns === 0 ? 0 : pawns };
}

/** A lead as the PGN and the page write it: +1.5, -3, 0, #3, #-2. */
export function leadText(lead: Lead): string
{
    if ("mate" in lead) {
        return `#${lead.mate}`;
    }

    return lead.pawns > 0 ? `+${lead.pawns}` : `${lead.pawns}`;
}

/** The lead a move's comment carries, when the AI estimated one. */
export function leadOf(comment: string | undefined): Lead | undefined
{
    const found = leadPattern.exec(comment ?? "")?.[1];
    return found === undefined ? undefined : readLead(found);
}

/** The move with the AI's lead in place of the one it had, beside what its comment held. */
export function withLead(move: RecordedMove, lead: Lead): RecordedMove
{
    const comment = [(move.comment ?? "").replace(/\s*\[%lead [^\]]*\]/g, "").trim(), `[%lead ${leadText(lead)}]`].filter((part) => part !== "").join(" ");
    return recordedMove(move.san, move.nags, comment);
}

const leadPattern = /\[%lead ([^\]]*)\]/;

// The largest lead Chesspal keeps, in pawns or moves to mate: beyond it the AI's figure says nothing more.
const leadLimit = 99;
