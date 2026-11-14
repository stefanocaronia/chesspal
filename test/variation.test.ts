import { describe, expect, it } from "vitest";
import { Game } from "../src/core/index.ts";
import { afterMove, isJump, leaveLine, linePlies, lineRecord, lineText, onLine, stepLine } from "../src/page/game/variation.ts";

const game = ["e4", "e5", "Nf3", "Nc6", "Bb5"];

describe("a variation in analysis", () => {
    it("starts a line from the position shown with a move the game did not play", () => {
        const { line, shown } = afterMove(undefined, game, 2, "Nc3");
        expect(line).toEqual({ at: 2, moves: ["Nc3"], cursor: 1 });
        expect(shown).toBe(2);
        expect(onLine(line)).toBe(true);
    });

    it("only steps forward through the game on the move the game played", () => {
        expect(afterMove(undefined, game, 2, "Nf3")).toEqual({ line: undefined, shown: 3 });
    });

    it("steps forward through the line on its own next move, and goes back into a faded line on its first", () => {
        const line = { at: 2, moves: ["Nc3", "Nf6", "Bc4"], cursor: 1 };
        expect(afterMove(line, game, 2, "Nf6").line).toEqual({ ...line, cursor: 2 });
        expect(afterMove({ ...line, cursor: 0 }, game, 2, "Nc3").line).toEqual({ ...line, cursor: 1 });
    });

    it("keeps one line: a move from its middle cuts it there, a move elsewhere in the game replaces it", () => {
        const line = { at: 2, moves: ["Nc3", "Nf6", "Bc4"], cursor: 1 };
        expect(afterMove(line, game, 2, "Bb4").line).toEqual({ at: 2, moves: ["Nc3", "Bb4"], cursor: 2 });
        expect(afterMove({ ...line, cursor: 0 }, game, 4, "Bc4").line).toEqual({ at: 4, moves: ["Bc4"], cursor: 1 });
    });

    it("steps back to the game from the line's first move, and never past its last", () => {
        const line = { at: 2, moves: ["Nc3", "Nf6"], cursor: 1 };
        expect(stepLine(line, "back")).toEqual({ ...line, cursor: 0 });
        expect(stepLine({ ...line, cursor: 2 }, "forward").cursor).toBe(2);
        expect(onLine(leaveLine(line))).toBe(false);
        expect(leaveLine(line)?.moves).toEqual(line.moves);
    });

    it("gives the record of the position shown, which the core plays", () => {
        const record = new Game({ tags: {}, moves: game.map((san) => ({ san, comment: "a note" })) }).record;
        const shown = new Game(lineRecord(record, { at: 2, moves: ["Nc3", "Nf6", "Bc4"], cursor: 2 }));
        expect(shown.record.moves.map(({ san }) => san)).toEqual(["e4", "e5", "Nc3", "Nf6"]);
        expect(shown.record.moves.every((move) => move.comment === undefined)).toBe(true);
    });

    it("numbers the line's moves from where it leaves the game, as a PGN writes them", () => {
        const plies = linePlies({ at: 3, moves: ["Nf6", "Nc3", "Bc5"], cursor: 3 }, { moveNumber: 2, turn: "black" });
        expect(plies.map(({ number, side }) => `${number}${side}`)).toEqual(["2black", "3white", "3black"]);
        expect(lineText(plies)).toBe("2...Nf6 3.Nc3 Bc5");
    });

    it("slides a step between the game and the line's first move, and shows any other change at once", () => {
        expect(isJump({ at: 2, cursor: 0 }, { at: 2, cursor: 1 })).toBe(false);
        expect(isJump({ at: 2, cursor: 1 }, { at: 2, cursor: 0 })).toBe(false);
        expect(isJump({ at: 2, cursor: 1 }, { at: 3, cursor: 0 })).toBe(true);
        expect(isJump({ at: 2, cursor: 3 }, { at: 2, cursor: 2 })).toBe(false);
        expect(isJump({ at: 2, cursor: 3 }, { at: 2, cursor: 1 })).toBe(true);
        expect(isJump({ at: 2, cursor: 0 }, { at: 5, cursor: 0 })).toBe(true);
    });
});
