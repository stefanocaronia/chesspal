import { describe, expect, it } from "vitest";
import { Game } from "../src/core/index.ts";

// The positions are Anatolij's, from his definitions of the tactical possibilities (D-100).
describe("the possibilities of a position (D-100)", () => {
    it("gives a fork of a piece with two targets, one of them new, on a square where it is not at risk", () => {
        expect(from("r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1").possibilities.doubleAttacks).toContainEqual({ san: "Nc7+", targets: ["a8", "e8"], fork: true });
        expect(from("4k3/8/8/2n1b3/8/3P4/1B6/4K3 w - - 0 1").possibilities.doubleAttacks).toContainEqual({ san: "d4", targets: ["c5", "e5"], fork: true });
    });

    it("never counts pawns as targets, nor a fork by a piece the other side takes", () => {
        expect(sans(from("4k3/8/8/2p1p3/8/8/1N6/4K3 w - - 0 1").possibilities.doubleAttacks)).not.toContain("Nd3");
        expect(sans(from("r2bk3/8/8/1N6/8/8/8/4K3 w - - 0 1").possibilities.doubleAttacks)).not.toContain("Nc7+");
    });

    it("gives a double attack of the piece moved and one it uncovers, never two attacks on the same piece", () => {
        const attacks = from("3q2k1/8/8/8/8/r7/3B4/2KR4 w - - 0 1").possibilities.doubleAttacks;

        expect(attacks).toContainEqual({ san: "Bb4", targets: ["a3", "d8"], fork: false });
        expect(sans(attacks)).not.toContain("Ba5");
    });

    it("tells the double checks from the discovered checks", () => {
        const { doubleChecks, discoveredChecks } = from("4k3/8/8/8/4N3/8/8/4R1K1 w - - 0 1").possibilities;

        expect([...doubleChecks].sort()).toEqual(["Nd6+", "Nf6+"]);
        expect([...discoveredChecks].sort()).toEqual(["Nc3+", "Nc5+", "Nd2+", "Nf2+", "Ng3+", "Ng5+"]);
    });

    it("gives the promotions of the side to move, and those of the other side as threats", () => {
        const game = from("8/1P6/8/8/8/8/kp6/4K3 w - - 0 1");

        expect(game.possibilities.promotions).toEqual(["b8=Q"]);
        expect(game.threats?.promotions).toEqual(["b1=Q+"]);
    });

    it("gives the stalemates, and the stalemate traps with the replies that stalemate", () => {
        expect(from("7k/8/6K1/8/8/8/8/5Q2 w - - 0 1").possibilities.stalemates).toContain("Qf7");
        // Sebastiano's game: after 52.Rg5+ the king to f4 left 53.Rxa5 stalemate.
        expect(from("8/8/8/r4kRp/7P/5P2/5PK1/8 b - - 4 52").possibilities.stalemateTraps).toContainEqual({ san: "Kf4", replies: ["Rxa5"] });
    });

    it("looks for stalemates only where the side stalemated has at most one piece besides its king and pawns", () => {
        const possibilities = new Game().possibilities;

        expect(possibilities.stalemates).toEqual([]);
        expect(possibilities.stalemateTraps).toEqual([]);
    });

    it("gives each capture with what the piece taken is to the piece taking it", () => {
        const captures = from("4k3/8/4p3/3p4/4P3/2N5/8/4K3 w - - 0 1").possibilities.captures;

        expect(captures).toContainEqual({ san: "exd5", fact: "same value" });
        expect(captures).toContainEqual({ san: "Nxd5", fact: "outnumbered" });
        expect(from("4k3/8/4p3/3p4/8/2N5/8/4K3 w - - 0 1").possibilities.captures).toEqual([{ san: "Nxd5" }]);
        expect(from("4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1").possibilities.captures).toEqual([{ san: "exd5", fact: "undefended" }]);
    });

    it("leaves out the other side's threats when the side to move is in check", () => {
        expect(from("4k3/8/8/8/8/8/8/R3K2r w - - 0 1").threats).toBeUndefined();
    });
});

function from(fen: string): Game
{
    return new Game({ tags: { SetUp: "1", FEN: fen }, moves: [] });
}

function sans(attacks: readonly { san: string; }[]): string[]
{
    return attacks.map((attack) => attack.san);
}
