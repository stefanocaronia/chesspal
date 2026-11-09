import { describe, expect, it } from "vitest";
import { readPgn } from "../src/core/index.ts";
import { studiedSides } from "../src/page/dialogs/studied.ts";
import { pliesOf } from "../src/page/game/plies.ts";

const sides = { white: "White", black: "Black" };

describe("a game in analysis on the page (D-69)", () => {
    it("names the players of a game played here and elsewhere, the player's side at the bottom", () => {
        expect(studiedSides({ White: "AI", Black: "Player" }, "Stefano", "Claude", sides)).toEqual({
            white: { name: "Claude", who: "ai" },
            black: { name: "Stefano", who: "player" },
            bottom: "black",
        });
        expect(studiedSides({ White: "Seba", Black: " stefano " }, "Stefano", "Claude", sides).bottom).toBe("black");
        expect(studiedSides({ White: "Ann", Black: "?" }, "Stefano", "Claude", sides)).toEqual({
            white: { name: "Ann", who: "other" },
            black: { name: "Black", who: "other" },
            bottom: "white",
        });
    });

    it("gives each move the AI's badge and note, apart from the words of its comment", () => {
        const [record] = readPgn("1. e4 {[%badge book]} e5 {Symmetry. [%badge mistake] [%review too early]} *");
        const [first, second] = pliesOf(record!);

        expect(first).toEqual({ san: "e4", side: "white", number: 1, review: { badge: "book" } });
        expect(second).toEqual({ san: "e5", side: "black", number: 1, review: { badge: "mistake", note: "too early" }, comment: "Symmetry." });
    });
});
