import { describe, expect, it } from "vitest";
import { Game, readPgn } from "../src/core/index.ts";
import { kingSigns } from "../src/page/board/signs.ts";
import { piecesOf } from "../src/page/board/squares.ts";
import { helpsOf } from "../src/page/helps/view.ts";
import { legendOf } from "../src/page/legend/view.ts";

// White's knight on f3 pinned to its queen by the bishop on g4, which h3 attacks undefended.
const pinned = game("1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 Nc6 5. h3 *");

describe("the legend of the marks on the board (D-99)", () => {
    it("lists only the marks the board shows, a sign with the pieces that bear it and a line with all its squares", () => {
        expect(legendOf({})).toEqual([]);

        const rows = legendOf({ badge: { badge: "miss", square: "h3" }, helps: helpsOf(pinned, "white") });

        expect(rows[0]).toEqual({ kind: "badge", badge: "miss", squares: ["h3"] });
        expect(rows).toContainEqual({ kind: "pin", tone: "threat", squares: ["f3"] });
        expect(rows).toContainEqual({ kind: "risk", tone: "chance", squares: ["g4"] });
        expect(rows).toContainEqual({ kind: "pinLine", squares: ["f3", "g4", "d1"] });
        expect(rows.map((row) => row.kind)).not.toContain("skewer");
    });

    it("puts the player's threats before their chances, and gives a side's tone when no side is theirs", () => {
        const kinds = legendOf({ helps: helpsOf(pinned, "white") }).map((row) => "tone" in row ? `${row.kind} ${row.tone}` : row.kind);
        expect(kinds.indexOf("risk threat") === -1 || kinds.indexOf("risk threat") < kinds.indexOf("risk chance")).toBe(true);
        expect(legendOf({ helps: helpsOf(pinned) }).filter((row) => "tone" in row).every((row) => "tone" in row && row.tone === "neutral")).toBe(true);
    });

    it("leaves out the pushpins and the lines over the control map, as the board does", () => {
        const rows = legendOf({ helps: helpsOf(pinned, "white"), control: true });

        expect(rows.map((row) => row.kind)).not.toContain("pin");
        expect(rows.map((row) => row.kind)).not.toContain("pinLine");
        expect(rows.at(-1)).toEqual({ kind: "control", squares: [] });
    });

    it("gives a line to each colour drawn, with its arrows and rings", () => {
        const rows = legendOf({ drawn: { arrows: [{ colour: "green", from: "c4", to: "f7" }], squares: [{ colour: "green", square: "e5" }, { colour: "red", square: "d1" }] } });

        expect(rows).toEqual([
            { kind: "drawn", colour: "green", arrow: true, ring: true, squares: ["c4", "f7", "e5"] },
            { kind: "drawn", colour: "red", arrow: false, ring: true, squares: ["d1"] },
        ]);
    });

    it("names the kings' signs at the end", () => {
        const mated = game("1. f3 e5 2. g4 Qh4# 0-1");
        const ends = kingSigns(piecesOf(mated.position.fen), mated.position.turn, { how: "checkmate", winner: "black" });

        expect(legendOf({ ends })).toEqual([{ kind: "end", sign: "crown", squares: ["e8"] }, { kind: "end", sign: "mate", squares: ["e1"] }]);
    });
});

function game(pgn: string): Game
{
    return new Game(readPgn(pgn)[0]);
}
