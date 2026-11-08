// Who is ahead as the AI gives it (D-90): the analyst after each move of a game over, the coach in the position the player is to move in.
import { z } from "zod";
import { type Lead, readLead } from "../core/index.ts";

/** A lead as its input reads it: pawns from White's side as a number, +1.5 or -3, or a mate it sees, "#3" White's or "#-3" Black's. */
export const leadInput = z.union([z.number(), z.string()]).refine(
    (value) => readLead(String(value)) !== undefined,
    'who is ahead is a number of pawns from White\'s side, 1.5 or -3, or a mate you see in moves of the side that mates, "#3" for White\'s or "#-3" for Black\'s, '
        + "up to 99",
);

/** Who is ahead in words, the side and by how much, so that the AI reads its own sign back (Anatolij, review of T-148). */
export function aheadWords(lead: Lead): string
{
    if ("mate" in lead) {
        return `${lead.mate > 0 ? "White" : "Black"} mates in ${Math.abs(lead.mate)}`;
    }

    return lead.pawns === 0 ? "even" : `${lead.pawns > 0 ? "White" : "Black"} ahead by ${Math.abs(lead.pawns)}`;
}

/** The lead an input gave, checked by leadInput. */
export function leadFrom(value: number | string): Lead
{
    const lead = readLead(String(value));

    if (lead === undefined) {
        throw new Error(`${value} is not who is ahead: give a number of pawns from White's side, 1.5 or -3, or a mate you see, "#3" or "#-3". Nothing changed.`);
    }

    return lead;
}
