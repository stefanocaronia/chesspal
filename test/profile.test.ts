import { describe, expect, it } from "vitest";
import { Game } from "../src/core/index.ts";

/** A game from a position in FEN. */
function at(fen: string): Game
{
    return new Game({ tags: { SetUp: "1", FEN: fen }, moves: [] });
}

describe("the positional profile", () => {
    it("names the pawns isolated, doubled and passed, and the islands by their files", () => {
        const { white, black } = at("4k3/7p/8/8/2P1P3/2P5/P4PP1/4K3 w - - 0 1").profile;

        expect(white.pawns).toEqual({ isolated: ["a2", "c3", "c4"], doubled: ["c3", "c4"], backward: [], passed: ["a2", "c3", "c4", "e4", "f2"], islands: ["a", "c", "e-g"] });
        expect(black.pawns.passed).toEqual([]);
    });

    it("names a backward pawn: its neighbours further on, the square in front of it taken by an enemy pawn", () => {
        expect(at("4k3/8/8/2p5/2P1P3/3P4/8/4K3 w - - 0 1").profile.white.pawns.backward).toEqual(["d3"]);
        expect(at("4k3/8/8/8/2P1P3/3P4/8/4K3 w - - 0 1").profile.white.pawns.backward).toEqual([]);
    });

    it("finds the outposts a pawn defends and no enemy pawn can reach, with the piece on them", () => {
        expect(at("4k3/8/8/3N4/4P3/8/8/4K3 w - - 0 1").profile.white.outposts).toEqual([{ square: "d5", piece: "N" }, { square: "f5" }]);
        expect(at("4k3/2p5/8/3N4/4P3/8/8/4K3 w - - 0 1").profile.white.outposts).toEqual([{ square: "f5" }]);
    });

    it("tells open and half-open files, the heavy pieces on them, the bishops and their pawns", () => {
        const profile = at("r5k1/1pp2ppp/8/8/8/8/PP3PPP/2B1RBK1 w - - 0 1").profile;

        expect(profile.openFiles).toEqual(["d", "e"]);
        expect(profile.white.halfOpenFiles).toEqual(["c"]);
        expect(profile.black.halfOpenFiles).toEqual(["a"]);
        expect(profile.white.heavyOnFiles).toEqual(["e1"]);
        expect(profile.black.heavyOnFiles).toEqual(["a8"]);
        expect(profile.white.bishopPair).toBe(true);
        expect(profile.white.bishops).toEqual([{ square: "c1", pawnsOnColour: 3, pawns: 5 }, { square: "f1", pawnsOnColour: 2, pawns: 5 }]);
        expect(profile.oppositeBishops).toBe(false);
        expect(at("4k1b1/8/8/8/8/8/8/2B1K3 w - - 0 1").profile.oppositeBishops).toBe(true);
    });

    it("names the rooks and queens on the seventh rank, the second for Black", () => {
        const profile = at("6k1/1R6/8/8/8/8/q7/6K1 w - - 0 1").profile;

        expect(profile.white.onSeventh).toEqual(["b7"]);
        expect(profile.black.onSeventh).toEqual(["a2"]);
        expect(new Game().profile.white.onSeventh).toEqual([]);
    });

    it("counts a piece pinned to its king only along the pin, as the view does", () => {
        expect(at("4r1k1/8/8/8/8/4N3/8/4K3 w - - 0 1").profile.control.d5).toEqual([0, 0]);
        const rook = at("4r1k1/8/8/8/8/4R3/8/4K3 w - - 0 1").profile;
        expect(rook.control.e5).toEqual([1, 1]);
        expect(rook.control.d3).toEqual([0, 0]);
    });

    it("reads the start: development, castling rights, the king's shield, mobility, an even control, the opening", () => {
        const profile = new Game().profile;

        expect(profile.white.undeveloped).toEqual(["b1", "g1", "c1", "f1"]);
        expect(profile.white.castlingRights).toEqual(["O-O", "O-O-O"]);
        expect(profile.white.king).toEqual({ square: "e1", shield: ["d2", "e2", "f2"], openFiles: [], attacksNear: 0 });
        expect(profile.white.mobility).toEqual({ N: 4, P: 16 });
        expect(profile.black.mobility).toEqual({ N: 4, P: 16 });
        expect(profile.controlled.white).toBe(profile.controlled.black);
        expect(profile.control.e3).toEqual([2, 0]);
        expect(profile.centre).toEqual([{ square: "d4", white: 0, black: 0 }, { square: "e4", white: 0, black: 0 }, { square: "d5", white: 0, black: 0 }, {
            square: "e5",
            white: 0,
            black: 0,
        }]);
        expect(profile.phase).toBe("opening");
        expect(profile.draw).toEqual({ repetitions: 1, fiftyMovesLeft: 100, insufficient: false });
        expect(profile.pawnEnding).toBeUndefined();
    });

    it("knows who castled, counts repetitions and the space", () => {
        const game = new Game();

        for (const move of ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "O-O", "Nf6", "Ng5", "Ng8", "Nf3", "Nf6", "Ng5", "Ng8", "Nf3"]) {
            game.play(move);
        }

        const profile = game.profile;
        expect(profile.white.castled).toBe("O-O");
        expect(profile.black.castled).toBe("no");
        expect(profile.white.castlingRights).toEqual([]);
        expect(profile.draw.repetitions).toBe(3);
        expect(profile.white.space).toBeGreaterThan(0);
    });

    it("leaves out the mobility of the side not to move when the other is in check", () => {
        const profile = at("4k3/8/8/8/8/8/4r3/4K3 w - - 0 1").profile;

        expect(profile.white.mobility).toBeDefined();
        expect(profile.black.mobility).toBeUndefined();
    });

    it("tells the phase by the pieces left", () => {
        expect(at("r3k3/8/8/8/8/8/8/R3K3 w - - 0 40").profile.phase).toBe("endgame");
        expect(at("r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQ1RK1 b kq - 5 5").profile.phase).toBe("opening");
        expect(at("r2q1rk1/ppp2ppp/2n2n2/3pp3/3PP3/2N2N2/PPP2PPP/R2Q1RK1 w - - 0 12").profile.phase).toBe("middlegame");
    });

    it("gives the rule of the square and the opposition in a pawn ending", () => {
        expect(at("8/8/2k5/P7/8/8/8/4K3 b - - 0 1").profile.pawnEnding?.squares).toEqual([{ pawn: "a5", caught: true }]);
        expect(at("8/8/3k4/P7/8/8/8/4K3 w - - 0 1").profile.pawnEnding?.squares).toEqual([{ pawn: "a5", caught: true }]);
        expect(at("8/8/8/P3k3/8/8/8/4K3 b - - 0 1").profile.pawnEnding?.squares).toEqual([{ pawn: "a5", caught: true }]);
        expect(at("8/8/4k3/P7/8/8/8/4K3 w - - 0 1").profile.pawnEnding?.squares).toEqual([{ pawn: "a5", caught: false }]);
        expect(at("8/8/8/P4k2/8/8/8/4K3 b - - 0 1").profile.pawnEnding?.squares).toEqual([{ pawn: "a5", caught: false }]);
        expect(at("8/8/4k3/8/4K3/8/8/8 w - - 0 1").profile.pawnEnding?.opposition).toBe("black");
        expect(at("8/8/4k3/8/4K3/8/8/8 b - - 0 1").profile.pawnEnding?.opposition).toBe("white");
        expect(at("8/8/4k3/8/3K4/8/8/8 w - - 0 1").profile.pawnEnding?.opposition).toBeUndefined();
        expect(at("8/8/4k3/8/4K3/8/8/8 w - - 0 1").profile.draw.insufficient).toBe(true);
    });

    it("tells apart the same position at another fifty-move count, and keeps quiet on castling before a FEN", () => {
        expect(at("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1").profile.draw.fiftyMovesLeft).toBe(100);
        expect(at("4k3/8/8/8/8/8/4P3/4K3 w - - 90 60").profile.draw.fiftyMovesLeft).toBe(10);
        expect(at("r1bq1rk1/pp2bppp/2n1pn2/8/2BP4/2N2N2/PP3PPP/R1BQ1RK1 w - - 0 9").profile.white.castled).toBeUndefined();
        expect(new Game().profile.white.castled).toBe("no");
    });

    it("counts a promotion once, leaves out a square a pawn stands on, and looks only in front of the king for its files", () => {
        expect(at("1n2k3/P7/8/8/8/8/8/4K3 w - - 0 1").profile.white.mobility?.P).toBe(2);
        expect(at("4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1").profile.white.outposts).toEqual([{ square: "f5" }]);
        expect(at("4k3/8/8/8/8/6K1/6P1/8 w - - 0 1").profile.white.king?.openFiles).toEqual(["f", "g", "h"]);
    });

    it("counts the first position of a FEN as repeated, though its en passant square is of no use", () => {
        const game = at("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1");

        for (const move of ["Nf6", "Nf3", "Ng8", "Ng1", "Nf6", "Nf3", "Ng8", "Ng1"]) {
            game.play(move);
        }

        expect(game.profile.draw.repetitions).toBe(3);
    });

    it("gives the same frozen profile for a position seen again", () => {
        const game = new Game();

        expect(game.profile).toBe(game.profile);
        expect(Object.isFrozen(game.profile.white.pawns.isolated)).toBe(true);
    });
});
