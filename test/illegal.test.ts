import { describe, expect, it } from "vitest";
import { Game, type Square } from "../src/core/index.ts";

/** A game from a position in FEN. */
function at(fen: string): Game
{
    return new Game({ tags: { SetUp: "1", FEN: fen }, moves: [] });
}

describe("why a move is not legal", () => {
    it("says nothing of a legal move", () => {
        expect(new Game().whyNot("e2", "e4")).toBeUndefined();
        expect(new Game().whyNot("g1", "f3")).toBeUndefined();
    });

    it("names a square of its own side, a piece's shape and a piece in the way", () => {
        const game = new Game();

        expect(game.whyNot("d1", "d2")).toEqual({ reason: "own" });
        expect(game.whyNot("g1", "g3")).toEqual({ reason: "shape" });
        expect(game.whyNot("f1", "c4")).toEqual({ reason: "blocked", by: "e2" });
        expect(game.whyNot("a1", "a5")).toEqual({ reason: "blocked", by: "a2" });
    });

    it("gives a pawn's own rules: straight only to empty squares, two only from its first, diagonally only to take", () => {
        const game = at("4k3/8/8/3p4/3P4/8/4P3/4K3 w - - 0 1");

        expect(game.whyNot("d4", "d5")).toEqual({ reason: "pawn-straight" });
        expect(game.whyNot("d4", "d6")).toEqual({ reason: "pawn-double" });
        expect(game.whyNot("e2", "f3")).toEqual({ reason: "pawn-diagonal" });
        expect(game.whyNot("e2", "e1")).toEqual({ reason: "own" });
        expect(game.whyNot("d4", "d3")).toEqual({ reason: "shape" });
        expect(at("4k3/8/8/8/8/4p3/4P3/4K3 w - - 0 1").whyNot("e2", "e4")).toEqual({ reason: "blocked", by: "e3" });
    });

    it("finds the check a move leaves unanswered, the pin it breaks and the attacked square a king steps on", () => {
        const checked = at("4r1k1/8/8/8/8/8/3N4/4K3 w - - 0 1");
        const pinned = at("4r1k1/8/8/8/8/8/4N3/4K3 w - - 0 1");

        expect(checked.whyNot("d2", "f3")).toEqual({ reason: "check", by: "e8" });
        expect(pinned.whyNot("e2", "c3")).toEqual({ reason: "pinned", by: "e8" });
        expect(pinned.whyNot("e1", "e2")).toEqual({ reason: "own" });
        expect(at("3r2k1/8/8/8/8/8/8/4K3 w - - 0 1").whyNot("e1", "d2")).toEqual({ reason: "attacked", by: "d8" });
    });

    it("sees the pin an en passant capture uncovers, both pawns leaving the rank", () => {
        const game = at("3k4/3p4/8/K3P2r/8/8/8/8 b - - 0 1");
        game.play("d5");

        expect(game.whyNot("e5", "d6")).toEqual({ reason: "pinned", by: "h5" });
    });

    it("explains castling: a right lost, a piece between, a check, a square crossed under attack", () => {
        expect(at("4k3/8/8/8/8/8/8/R3K2R w Q - 0 1").whyNot("e1", "g1")).toEqual({ reason: "castle-lost" });
        expect(at("4k3/8/8/8/8/8/8/RN2K2R w KQ - 0 1").whyNot("e1", "c1")).toEqual({ reason: "castle-blocked", by: "b1" });
        expect(at("4k3/8/8/8/8/8/8/R3K1NR w KQ - 0 1").whyNot("e1", "g1")).toEqual({ reason: "castle-blocked", by: "g1" });
        expect(at("4r1k1/8/8/8/8/8/8/R3K2R w KQ - 0 1").whyNot("e1", "g1")).toEqual({ reason: "castle-check", by: "e8" });
        expect(at("5rk1/8/8/8/8/8/8/R3K2R w KQ - 0 1").whyNot("e1", "g1")).toEqual({ reason: "castle-through", by: "f8", at: "f1" });
        expect(at("k5r1/8/8/8/8/8/8/4K2R w K - 0 1").whyNot("e1", "g1")).toEqual({ reason: "castle-through", by: "g8", at: "g1" });
        expect(at("1r4k1/8/8/8/8/8/8/R3K2R w KQ - 0 1").whyNot("e1", "c1")).toBeUndefined();
    });

    it("puts the way a piece moves before the square of its own it lands on", () => {
        expect(new Game().whyNot("a1", "b2")).toEqual({ reason: "shape" });
        expect(new Game().whyNot("e2", "e5")).toEqual({ reason: "shape" });
    });

    it("names the pawn taken en passant too late, and sees en passant in a game from a FEN", () => {
        expect(at("4k3/8/8/3pP3/8/8/8/4K3 w - - 0 1").whyNot("e5", "d6")).toEqual({ reason: "en-passant-late", by: "d5" });
        expect(at("8/8/8/KPp4r/8/8/8/7k w - c6 0 2").whyNot("b5", "c6")).toEqual({ reason: "pinned", by: "h5" });
    });

    it("finds the piece still giving check of a double check, and the king stepping back along the check's line or next to the other king", () => {
        const double = at("4r1k1/8/8/8/1b6/5N2/8/4K3 w - - 0 1");

        expect(double.whyNot("f3", "d2")).toEqual({ reason: "check", by: "e8" });
        expect(double.whyNot("f3", "e5")).toEqual({ reason: "check", by: "b4" });
        expect(at("4r1k1/8/8/8/8/8/4K3/8 w - - 0 1").whyNot("e2", "e1")).toEqual({ reason: "attacked", by: "e8" });
        expect(at("4k3/8/4K3/8/8/8/8/8 w - - 0 1").whyNot("e6", "e7")).toEqual({ reason: "attacked", by: "e8" });
        expect(at("4k3/8/8/8/8/1n6/3r4/4K3 w - - 0 1").whyNot("e1", "d2")).toEqual({ reason: "attacked", by: "b3" });
    });

    it("explains Black's castling, the rook gone, the check before a piece between, and the king taken onto its own rook", () => {
        expect(at("r3k2r/8/8/8/8/8/8/4K1R1 b kq - 0 1").whyNot("e8", "g8")).toEqual({ reason: "castle-through", by: "g1", at: "g8" });
        expect(at("4k3/8/8/8/8/8/8/R3K3 w Q - 0 1").whyNot("e1", "g1")).toEqual({ reason: "castle-rook-gone", at: "h1" });
        expect(at("4r1k1/8/8/8/8/8/8/4KB1R w K - 0 1").whyNot("e1", "g1")).toEqual({ reason: "castle-check", by: "e8" });
        expect(at("5rk1/8/8/8/8/8/8/R3K2R w KQ - 0 1").whyNot("e1", "h1")).toEqual({ reason: "castle-through", by: "f8", at: "f1" });
        expect(at("4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1").whyNot("e1", "h1")).toBeUndefined();
    });

    it("has a reason for every move refused and none for a legal one, in games of random moves", () => {
        let seed = 7;
        const random = (): number => (seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648) / 2_147_483_648;
        const squares = [..."abcdefgh"].flatMap((file) => [..."12345678"].map((rank) => `${file}${rank}` as Square));

        for (let round = 0; round < 6; round++) {
            const game = new Game();

            for (let ply = 0; ply < 40 && !game.outcome.over; ply++) {
                const legal = game.legalMoves();
                const own = new Set(legal.map((move) => move.from));

                for (const from of own) {
                    for (const to of squares.filter((square) => square !== from)) {
                        const allowed = legal.some((move) => move.from === from && move.to === to);
                        expect(game.whyNot(from, to) === undefined, `${game.position.fen} ${from}${to}`).toBe(allowed || isCastlingOntoRook(game, from, to));
                    }
                }

                const move = legal[Math.floor(random() * legal.length)]!;
                game.play(`${move.from}${move.to}${move.promotion ?? ""}`);
            }
        }
    }, 20_000);

    it("refuses to explain a piece that may not move", () => {
        expect(() => new Game().whyNot("e7", "e5")).toThrow(/side to move/);
    });
});

/** A king taken onto its own rook, which the page plays as castling when castling is legal. */
function isCastlingOntoRook(game: Game, from: Square, to: Square): boolean
{
    const corner = to[0] === "h" ? "g" : to[0] === "a" ? "c" : undefined;
    return corner !== undefined && game.legalMoves(from).some((move) => move.to === `${corner}${to[1]}` && /^O-O/.test(move.san));
}
