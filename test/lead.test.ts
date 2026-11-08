import { describe, expect, it } from "vitest";
import { leadOf, leadText, readLead, readPgn, withLead } from "../src/core/index.ts";
import { standingAt, standingsOf } from "../src/page/lead-view.ts";
import { pliesOf, withJudgments, withoutReviews } from "../src/page/plies.ts";

describe("who is ahead, as the AI estimates it (D-90)", () => {
    it("reads the figures an AI writes, in pawns from White's side or a mate it sees, and writes them as the PGN keeps them", () => {
        expect(readLead("+1.5")).toEqual({ pawns: 1.5 });
        expect(readLead("-3")).toEqual({ pawns: -3 });
        expect(readLead("−0.25")).toEqual({ pawns: -0.3 });
        expect(readLead("-0.04")).toEqual({ pawns: 0 });
        expect(readLead("#3")).toEqual({ mate: 3 });
        expect(readLead("#-2")).toEqual({ mate: -2 });
        expect(readLead("-M2")).toEqual({ mate: -2 });
        expect(readLead("M4")).toEqual({ mate: 4 });

        for (const wrong of ["", "a lot", "#0", "1e3", "100", "#100", "+-1"]) {
            expect(readLead(wrong)).toBeUndefined();
        }

        expect([{ pawns: 1.5 }, { pawns: -3 }, { pawns: 0 }, { mate: 3 }, { mate: -2 }].map(leadText)).toEqual(["+1.5", "-3", "0", "#3", "#-2"]);
    });

    it("rides in the move's comment as [%lead …], beside what it held, in place of the one before", () => {
        const [record] = readPgn("1. e4 {[%clk 0:04:30] [%badge book]} *");
        const once = withLead(record!.moves[0]!, { pawns: 0.3 });
        const twice = withLead(once, { mate: -4 });

        expect(once.comment).toBe("[%clk 0:04:30] [%badge book] [%lead +0.3]");
        expect(twice.comment).toBe("[%clk 0:04:30] [%badge book] [%lead #-4]");
        expect(leadOf(twice.comment)).toEqual({ mate: -4 });
        expect(leadOf("[%eval 1.2]")).toBeUndefined();
    });

    it("gives the page each estimate on a curve held to ten pawns, the mate on the board as all of the bar, and the latest at or before the move shown", () => {
        const plies = pliesOf(readPgn("1. e4 {[%lead +0.3]} e5 2. Qh5 {[%lead -12]} Nc6 3. Bc4 {[%lead #2]} Nf6 4. Qxf7# *")[0]!);
        const standings = standingsOf(plies);

        expect(standings.map(({ plies: at }) => at)).toEqual([1, 3, 5, 7]);
        // The first pawns move the bar most, where a game between people turns (Anatolij and Zoe, review of T-148).
        expect(standings[0]!.share).toBeCloseTo(Math.tanh(0.06));
        expect(standings[1]!.share).toBeCloseTo(-Math.tanh(2));
        expect(standingsOf(pliesOf(readPgn("1. e4 {[%lead +1]} e5 {[%lead -3]} *")[0]!)).map(({ share }) => Math.round(((share + 1) / 2) * 100))).toEqual([60, 23]);
        expect(standings.slice(2).map(({ share }) => share)).toEqual([1, 1]);
        expect(standings.at(-1)?.mated).toBe("black");
        expect(standingAt(standings, 0)).toBeUndefined();
        expect(standingAt(standings, 4)?.lead).toEqual({ pawns: -12 });
        // During a game with the helps off the player sees none (D-78).
        expect(standingsOf(withoutReviews(plies)).map(({ plies: at }) => at)).toEqual([7]);

        // A draw on the board stands even, in place of the AI's last figure, a mate it saw too (Anatolij and Federico, review of T-148).
        const stalemate = pliesOf(readPgn("1. e4 {[%lead +0.3]} e5 {[%lead #1]} *")[0]!);
        expect(standingsOf(stalemate, true).map(({ plies: at, share, drawn }) => [at, share, drawn])).toEqual([[1, expect.closeTo(Math.tanh(0.06)), undefined], [2, 0, true]]);
    });

    it("puts the coach's estimates on the moves that led to the positions it was given in, during the game (D-88)", () => {
        const plies = pliesOf(readPgn("1. e4 e5 2. Nf3 Nc6 *")[0]!);
        const coached = withJudgments(plies, { judgments: [], leads: [{ position: 2, lead: { pawns: 0.2 } }, { position: 4, lead: { pawns: -0.5 } }] });

        expect(coached.map((ply) => ply.lead)).toEqual([undefined, { pawns: 0.2 }, undefined, { pawns: -0.5 }]);
    });
});
