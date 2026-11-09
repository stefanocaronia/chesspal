// The kings' signs at the end of a game: which badge each king's square shows, and how its king takes the end.
import type { Side } from "../../core/index.ts";
import type { HowEnded } from "../game/ending.ts";

/** A king's badge at the end: the winner's crown, the mate or the flag of the loser, half a point each in a draw. */
export type BadgeKind = "crown" | "mate" | "flag" | "half";

/** What a king's square shows at the end: its badge, and how its king takes the end, laid down, standing in a draw, or stalemated. */
export interface KingSign
{
    readonly badge: BadgeKind;
    readonly classes: string;
}

/** The kings' signs at the end, by their squares: the loser's king lies down when mated or resigning; both kings of a draw stand, the stalemated one stuck. */
export function kingSigns(pieces: ReadonlyMap<string, string>, toMove: Side, end: { readonly how?: HowEnded; readonly winner?: Side; }): ReadonlyMap<string, KingSign>
{
    const kingOf = (side: Side): string | undefined => [...pieces].find(([, letter]) => letter === (side === "white" ? "K" : "k"))?.[0];
    const signs = new Map<string, KingSign>();

    const sign = (side: Side, badge: BadgeKind, classes: string): void => {
        const square = kingOf(side);

        if (square !== undefined) {
            signs.set(square, { badge, classes });
        }
    };

    if (end.winner === undefined) {
        sign("white", "half", end.how === "stalemate" && toMove === "white" ? "drawn stalled" : "drawn");
        sign("black", "half", end.how === "stalemate" && toMove === "black" ? "drawn stalled" : "drawn");
        return signs;
    }

    const loser = end.winner === "white" ? "black" : "white";
    sign(end.winner, "crown", "winner");

    if (end.how === "checkmate" || end.how === "resignation") {
        sign(loser, end.how === "checkmate" ? "mate" : "flag", "fallen");
    }

    return signs;
}

export const noSigns: ReadonlyMap<string, KingSign> = new Map();
