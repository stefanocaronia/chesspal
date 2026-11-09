import { describe, expect, it } from "vitest";
import { boardText, Game } from "../src/core/index.ts";

// The Two Knights after 4.Ng5, Black to move: f7 is attacked twice and defended once.
const twoKnights = "r1bqkb1r/pppp1ppp/2n2n2/4p1N1/2B1P3/8/PPPP1PPP/RNBQK2R b KQkq - 5 4";

describe("the facts of a position", () => {
    it("gives each piece its attackers and defenders, and only the side to move its legal moves", () => {
        const { pieces, checks, otherChecks } = from(twoKnights).facts;
        const piece = (square: string) => pieces.find((each) => each.square === square);

        expect(piece("f7")).toEqual({ square: "f7", piece: "P", side: "black", attackers: ["c4", "g5"], defenders: ["e8"], moves: [] });
        expect(piece("f8")?.moves).toEqual(["Be7", "Bd6", "Bc5", "Bb4", "Ba3"]);
        expect(piece("e4")).toEqual({ square: "e4", piece: "P", side: "white", attackers: ["f6"], defenders: ["g5"] });
        expect(piece("h7")).toMatchObject({ attackers: ["g5"], defenders: ["f6", "h8"] });
        expect(pieces.map((each) => `${each.piece}${each.square}`).slice(0, 8)).toEqual(["Ke1", "Qd1", "Ra1", "Rh1", "Bc1", "Bc4", "Nb1", "Ng5"]);
        expect(pieces.filter((each) => each.side === "black").reduce((total, each) => total + (each.moves?.length ?? 0), 0)).toBe(28);
        expect(checks).toEqual([]);
        expect(otherChecks).toEqual(["Bxf7+"]);
    });

    it("tells the pieces attacked and undefended from those defended but attacked by a cheaper piece, kings left out", () => {
        // Black to move: the White queen on d2 is defended, but the knight on c4 attacks it.
        const facts = from("2r2rk1/pp1bppbp/3p2p1/q2N3P/2n1P1P1/1B2BP2/PPPQN3/1K1R3R b - - 0 18").facts;

        expect(facts.attackedByCheaper).toContain("d2");
        expect(facts.undefended).not.toContain("d2");
        expect(from("4k3/8/8/8/8/8/8/R5Kn w - - 0 1").facts).toMatchObject({ undefended: ["h1"], attackedByCheaper: [] });
        expect(from("R3k3/8/8/8/8/8/8/4K3 b - - 0 1").facts.undefended).toEqual([]);
    });

    it("tells a piece attacked more times than defended, counting the direct ones only", () => {
        // From the first playtest: the pawn on c5 is attacked by Nb3 and Be3, and defended only by the queen, with the bishop on e7 behind her.
        const facts = from("r1b1r1k1/ppp1bppp/3q1n1n/1Pp1N3/P3PP2/1N1PB2P/4B1P1/R2QK2R b KQ - 0 19").facts;

        expect(facts.outnumbered).toEqual(["c5"]);
        expect(facts.attackedByCheaper).not.toContain("c5");
        expect(from("2r2rk1/pp1bppbp/3p2p1/q2N3P/2n1P1P1/1B2BP2/PPPQN3/1K1R3R b - - 0 18").facts.outnumbered).not.toContain("d2");
    });

    it("finds the pins to the king, and to a queen or rook of a piece worth less when the pinner is worth less or that piece is undefended", () => {
        // The pawn on d6 stands between two queens: no pin.
        expect(from("r1bqkb1r/5ppp/p1np1n2/1p2p1B1/4P3/N1N5/PPP2PPP/R2QKB1R w KQkq - 0 9").facts.pins).toEqual([{ square: "f6", by: "g5", to: "d8" }]);
        expect(from("4k3/3n4/8/1B6/8/8/8/4K3 w - - 0 1").facts.pins).toEqual([{ square: "d7", by: "b5", to: "e8" }]);
        expect(from("4k3/8/8/4b3/8/2N5/8/R3K3 w - - 0 1").facts.pins).toEqual([{ square: "c3", by: "e5", to: "a1" }]);
        expect(from("4k3/8/8/4b3/8/2Q5/8/R3K3 w - - 0 1").facts.pins).toEqual([]);
        expect(from("2k5/2q5/8/8/8/2B5/8/2R3K1 w - - 0 1").facts.pins).toEqual([{ square: "c3", by: "c7", to: "c1" }]);
        expect(from("2k5/2q5/8/8/8/2B5/8/1KR5 w - - 0 1").facts.pins).toEqual([]);
    });

    it("finds the skewers: a king, queen or rook that must move, with a piece of its side behind it taken with gain, as Anatolij defines them", () => {
        // The king on d5 must move, and the bishop takes the queen behind it.
        expect(from("8/5q2/8/3k4/8/1B6/8/6K1 b - - 0 1").facts.skewers).toEqual([{ square: "d5", by: "b3", to: "f7" }]);
        // The rook behind the king is defended by the knight, and the queen is worth more than it: no skewer, until the knight goes.
        expect(from("r2k3Q/8/1n6/8/8/8/8/6K1 b - - 0 1").facts.skewers).toEqual([]);
        expect(from("r2k3Q/8/8/8/8/8/8/6K1 b - - 0 1").facts.skewers).toEqual([{ square: "d8", by: "h8", to: "a8" }]);
        // The rook in front is defended and attacked by a rook worth as much: it need not move.
        expect(from("6k1/8/8/4p3/1b1r3R/8/8/6K1 b - - 0 1").facts.skewers).toEqual([]);
        // The rook on d2 is pinned to its king: it attacks the queen on d5 no more.
        expect(from("3r2k1/8/8/3q4/1b6/8/3R4/4K3 w - - 0 1").facts.skewers).toEqual([]);
        // The rook on a8 is defended only by the queen in front of it, which leaves the line when it moves.
        expect(from("r7/7k/8/q7/8/8/1K6/R7 b - - 0 1").facts.skewers).toEqual([{ square: "a5", by: "a1", to: "a8" }]);
    });

    it("lets a piece pinned to its king attack and defend only along the pin's line, though it still gives check", () => {
        // The queen on e7 is pinned by the rook on e1: it defends neither the bishop on b4 nor the knight on f6.
        const { pieces } = from("rnb1k2r/pp2qppp/2p2n2/8/1b3B2/2NQ4/PPP2PPP/3RR1K1 w kq - 0 12").facts;
        const piece = (square: string) => pieces.find((each) => each.square === square);

        expect(piece("b4")).toMatchObject({ attackers: [], defenders: [] });
        expect(piece("f6")).toMatchObject({ attackers: [], defenders: ["g7"] });
        expect(piece("e1")).toMatchObject({ attackers: ["e7"], defenders: ["d1"] });
        expect(from("8/8/8/b7/8/1k6/3N4/4K3 b - - 0 1").facts).toMatchObject({ checkedBy: ["d2"], pins: [{ square: "d2", by: "a5", to: "e1" }] });
    });

    it("gives the checks of both sides, a capture that checks too, the pieces checking, and none for the side not to move when the other is in check", () => {
        const facts = from("rnb1k2r/pp2qppp/2p2n2/8/1b3B2/2NQ4/PPP2PPP/3RR1K1 w kq - 0 12").facts;
        const inCheck = from("4k3/8/8/8/Q7/8/8/4K3 b - - 0 1").facts;

        expect([...facts.checks].sort()).toEqual(["Qd7+", "Qd8#", "Rxe7+"]);
        expect(facts).not.toHaveProperty("checkedBy");
        expect(inCheck).not.toHaveProperty("otherChecks");
        expect(inCheck.checkedBy).toEqual(["a4"]);
        expect(inCheck.pieces.find((each) => each.square === "e8")).toMatchObject({ attackers: ["a4"], defenders: [] });
    });

    it("counts a pawn that can be taken en passant as attacked, whichever side moves", () => {
        const attackersOf = (fen: string, square: string) => from(fen).facts.pieces.find((each) => each.square === square)?.attackers;

        expect(attackersOf("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2", "d5")).toEqual(["e5"]);
        expect(from("4k3/8/8/3pPR2/8/8/8/4K3 w - d6 0 2").facts.pieces.find((each) => each.square === "d5")).not.toHaveProperty("behind");
        expect(attackersOf("4k3/8/8/8/3Pp3/8/8/4K3 b - d3 0 2", "d4")).toEqual(["e4"]);
    });

    it("gives the rooks, bishops and queens lined up behind an attacker, and the pieces neither attacked nor defended", () => {
        const facts = from("4k3/8/8/3p4/8/8/3Q4/3RK3 w - - 0 1").facts;

        expect(facts.pieces.find((each) => each.square === "d5")).toMatchObject({ attackers: ["d2"], behind: { d2: ["d1"] } });
        expect(facts.undefended).toEqual(["d5"]);
        expect(new Game().facts.loose).toEqual(["a1", "h1", "a8", "h8"]);
    });

    it("computes the facts once for each position, and gives them frozen", () => {
        const facts = played("e4", "e5", "Nf3").facts;

        expect(played("Nf3", "e5", "e4").facts).toBe(facts);
        expect([facts, facts.pieces, facts.pieces[0], facts.pieces[0]?.attackers, facts.pins].every(Object.isFrozen)).toBe(true);
    });
});

describe("a game's last move and board", () => {
    it("gives the last move with its squares, none before the first", () => {
        expect(new Game().lastMove).toBeUndefined();
        expect(played("e4", "Nf6").lastMove).toEqual({ san: "Nf6", from: "g8", to: "f6" });
        expect(new Game({ tags: {}, moves: [{ san: "d4" }] }).lastMove).toEqual({ san: "d4", from: "d2", to: "d4" });
    });

    it("writes the board as text for the player, White at the bottom", () => {
        expect(boardText(twoKnights).split("\n")).toEqual([
            "  ⓐ ⓑ ⓒ ⓓ ⓔ ⓕ ⓖ ⓗ",
            "8 ♜ ⊙ ♝ ♛ ♚ ♝ ⊙ ♜ 8",
            "7 ♟︎ ♟︎ ♟︎ ♟︎ ⊙ ♟︎ ♟︎ ♟︎ 7",
            "6 ⊙ ⊙ ♞ ⊙ ⊙ ♞ ⊙ ⊙ 6",
            "5 ⊙ ⊙ ⊙ ⊙ ♟︎ ⊙ ♘ ⊙ 5",
            "4 ⊙ ⊙ ♗ ⊙ ♙ ⊙ ⊙ ⊙ 4",
            "3 ⊙ ⊙ ⊙ ⊙ ⊙ ⊙ ⊙ ⊙ 3",
            "2 ♙ ♙ ♙ ♙ ⊙ ♙ ♙ ♙ 2",
            "1 ♖ ♘ ♗ ♕ ♔ ⊙ ⊙ ♖ 1",
            "  ⓐ ⓑ ⓒ ⓓ ⓔ ⓕ ⓖ ⓗ",
        ]);
    });
});

function from(fen: string): Game
{
    return new Game({ tags: { SetUp: "1", FEN: fen }, moves: [] });
}

function played(...moves: string[]): Game
{
    const game = new Game();

    for (const move of moves) {
        expect(game.play(move), move).toMatchObject({ played: true });
    }

    return game;
}
