import { describe, expect, it } from "vitest";
import { Game, readPgn } from "../src/core/index.ts";
import { atRiskOn, helpsOf, strategyOf } from "../src/page/helps/view.ts";

// White's knight on f3 pinned to its queen by the bishop on g4, which h3 attacks undefended.
const pinned = game("1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 Nc6 5. h3 *");

describe("the helps on the page (D-78, D-79)", () => {
    it("show the tactics, the strategy and the control map, whatever the AI's level", () => {
        const helps = helpsOf(pinned);

        expect(helps.atRisk).toContainEqual({ piece: expect.objectContaining({ square: "g4", piece: "B", side: "black", attackers: ["h3"] }), why: "undefended" });
        expect(helps.pins).toContainEqual({
            piece: expect.objectContaining({ square: "f3", piece: "N", side: "white" }),
            by: expect.objectContaining({ square: "g4", piece: "B", side: "black" }),
            to: expect.objectContaining({ square: "d1", piece: "Q", side: "white" }),
        });
        expect(helps.strategy).toBe(pinned.profile);
        expect(helps.strategy.control.e4).toBeDefined();
    });

    it("list the pieces at risk undefended first, then attacked by a cheaper piece, then outnumbered, each with its piece", () => {
        // Black's knight on e5 is defended by d6 and attacked by the pawn on d4, cheaper; the rook on a5 is attacked by the bishop and undefended.
        const position = game('[FEN "4k3/8/3p4/r3n3/3P4/8/3B4/4K3 b - - 0 1"]\n\n*');
        const facts = position.facts;
        const helps = helpsOf(position);

        expect(facts.undefended).toContain("a5");
        expect(facts.attackedByCheaper).toContain("e5");
        expect(helps.atRisk.map((risk) => [risk.piece.square, risk.why])).toEqual([
            ...facts.undefended.map((square) => [square, "undefended"]),
            ...facts.attackedByCheaper.map((square) => [square, "cheaper"]),
            ...facts.outnumbered.map((square) => [square, "outnumbered"]),
        ]);
        expect(atRiskOn(helps, "e5")).toBe(true);
        expect(atRiskOn(helps, "e1")).toBe(false);
    });

    it("give who moves, the checks of both sides and the loose pieces as the facts do", () => {
        const helps = helpsOf(pinned);

        expect(helps.toMove).toBe("black");
        expect(helps.checks).toEqual(pinned.facts.checks);
        expect(helps.otherChecks).toEqual(pinned.facts.otherChecks ?? []);
        expect(helps.loose.map((piece) => piece.square)).toEqual(pinned.facts.loose);
    });
});

describe("the strategy's table (D-78)", () => {
    it("keeps only the lines where a side has something", () => {
        const rows = strategyOf(pinned.profile).map((line) => line.row);

        expect(rows).toEqual(expect.arrayContaining(["bishopPair", "space", "undeveloped", "castled"]));
        expect(rows).not.toContain("isolated");
        expect(rows).not.toContain("passed");
        expect(rows).not.toContain("islands");
    });

    it("shows the pawn islands when a side has more than one", () => {
        const split = game("1. d4 e5 2. dxe5 *");
        const islands = strategyOf(split.profile).find((line) => line.row === "islands");

        expect(islands).toEqual({ row: "islands", white: split.profile.white.pawns.islands, black: split.profile.black.pawns.islands });
        expect(split.profile.black.pawns.islands.length).toBeGreaterThan(1);
    });

    it("tells castled, not yet and no more apart, and leaves out what a FEN cannot say", () => {
        const castling = (pgn: string) => strategyOf(game(pgn).profile).find((line) => line.row === "castled");

        expect(castling("1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O *")).toMatchObject({ white: "O-O", black: "not-yet" });
        expect(castling("1. e4 e5 2. Ke2 *")).toMatchObject({ white: "no-more", black: "not-yet" });
        expect(castling('[FEN "4k3/8/8/8/8/8/8/4K3 w - - 0 1"]\n\n*')).toBeUndefined();
    });
});

function game(pgn: string): Game
{
    return new Game(readPgn(pgn)[0]);
}
