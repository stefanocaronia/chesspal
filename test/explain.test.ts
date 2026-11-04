import { describe, expect, it } from "vitest";
import { Game } from "../src/core/index.ts";
import { bubblePlace, explain, keptSquares } from "../src/page/explain.ts";

/** A game from a position in FEN. */
function at(fen: string): Game
{
    return new Game({ tags: { SetUp: "1", FEN: fen }, moves: [] });
}

describe("what the board draws for a refused move", () => {
    it("aims at the king for a pin and a check, at the square for an attack, at the square crossed for castling", () => {
        expect(explain(at("4r1k1/8/8/8/8/8/4N3/4K3 w - - 0 1").whyNot("e2", "c3")!, "c3", "e1")).toEqual({ kind: "pin", arrow: { from: "e8", to: "e1" } });
        expect(explain(at("4r1k1/8/8/8/8/8/3N4/4K3 w - - 0 1").whyNot("d2", "f3")!, "f3", "e1")).toEqual({ kind: "king", arrow: { from: "e8", to: "e1" } });
        expect(explain(at("3r2k1/8/8/8/8/8/8/4K3 w - - 0 1").whyNot("e1", "d2")!, "d2", "e1")).toEqual({ kind: "king", arrow: { from: "d8", to: "d2" } });
        expect(explain(at("5rk1/8/8/8/8/8/8/R3K2R w KQ - 0 1").whyNot("e1", "g1")!, "g1", "e1")).toEqual({ kind: "castle", arrow: { from: "f8", to: "f1" } });
        expect(explain(at("4r1k1/8/8/8/8/8/8/R3K2R w KQ - 0 1").whyNot("e1", "g1")!, "g1", "e1")).toEqual({ kind: "castle", arrow: { from: "e8", to: "e1" } });
    });

    it("rings a piece in the way and a pawn taken en passant too late, and draws nothing for the way a piece moves", () => {
        expect(explain(new Game().whyNot("f1", "c4")!, "c4", "e1")).toEqual({ kind: "blocked", ring: "e2" });
        expect(explain(at("4k3/8/8/8/8/8/8/RN2K2R w KQ - 0 1").whyNot("e1", "c1")!, "c1", "e1")).toEqual({ kind: "castle", ring: "b1" });
        expect(explain(at("4k3/8/8/3pP3/8/8/8/4K3 w - - 0 1").whyNot("e5", "d6")!, "d6", "e1")).toEqual({ kind: "piece", ring: "d5" });
        expect(explain(new Game().whyNot("g1", "g3")!, "g3", "e1")).toEqual({ kind: "piece" });
        expect(explain(at("4k3/8/8/8/8/8/8/R3K3 w Q - 0 1").whyNot("e1", "g1")!, "g1", "e1")).toEqual({ kind: "castle" });
    });
});

describe("where the bubble of a refused move goes", () => {
    // Squares as seen with White at the bottom: columns a to h, rows 8 to 1 from the top.
    const seen = (square: string): [number, number] => ["abcdefgh".indexOf(square[0]!), 8 - Number(square[1])];
    const place = (piece: string, keep: string[], narrow = false): string => bubblePlace(seen(piece), keep.map(seen), narrow);

    it("goes over the piece moved, or under it when the culprit stands over it", () => {
        expect(place("e1", ["h3", "f1"])).toBe("above");
        expect(place("e2", ["e3"])).toBe("below");
        expect(place("e8", [])).toBe("below");
    });

    it("goes under the board on a phone, and beside the piece, away from the culprit, on a wide board", () => {
        expect(place("a1", ["a2"], true)).toBe("under-board");
        expect(place("e1", ["h3", "f1"], true)).toBe("under-board");
        expect(place("e2", ["e3"], true)).toBe("under-board");
        expect(place("e1", ["h4", "f1"], true)).toBe("above");
        expect(place("e7", ["e2"], true)).toBe("below");
        expect(place("e8", [], true)).toBe("below");
        expect(place("a1", ["a2"])).toBe("right");
        expect(place("e2", ["e3", "e1", "a2"])).toBe("right");
        expect(place("e2", ["e3", "e1", "g2"])).toBe("left");
    });

    it("keeps in sight the culprit and the arrow's point, or the ringed piece", () => {
        expect(keptSquares({ kind: "pin", arrow: { from: "e8", to: "e1" } })).toEqual(["e8", "e1"]);
        expect(keptSquares({ kind: "blocked", ring: "e2" })).toEqual(["e2"]);
        expect(keptSquares({ kind: "piece" })).toEqual([]);
        expect(keptSquares(undefined)).toEqual([]);
    });

    it("reads a turned board as it is seen", () => {
        const turned = (square: string): [number, number] => [7 - "abcdefgh".indexOf(square[0]!), Number(square[1]) - 1];
        expect(bubblePlace(turned("e7"), [turned("e6")], false)).toBe("below");
    });
});
