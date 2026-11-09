import { describe, expect, it } from "vitest";
import { readPgn } from "../src/core/index.ts";
import { accountSide, playerIn, studiedSides } from "../src/page/dialogs/studied.ts";
import { pliesOf } from "../src/page/game/plies.ts";

const sides = { white: "White", black: "Black" };

describe("a game loaded by the player, by their names on the sites (D-93)", () => {
    const accounts = { lichess: "LesFrondes", chesscom: "stefano_c" };

    it("is theirs when a side bears their name on the site the game was played on, or on either without a site", () => {
        expect(accountSide({ White: "lesfrondes", Black: "Sebysa13", Site: "https://lichess.org/abc" }, accounts)).toBe("white");
        expect(accountSide({ White: "Sebysa13", Black: "stefano_c", Site: "Chess.com" }, accounts)).toBe("black");
        expect(accountSide({ White: "Sebysa13", Black: "stefano_c" }, accounts)).toBe("black");
        expect(studiedSides({ White: "lesfrondes", Black: "Sebysa13", Site: "lichess.org" }, "Stefano", "Claude", sides, accounts)).toEqual({
            white: { name: "lesfrondes", who: "player" },
            black: { name: "Sebysa13", who: "other" },
            bottom: "white",
        });
    });

    it("is nobody's when the name is theirs on another site, on both sides, or they gave none", () => {
        expect(accountSide({ White: "stefano_c", Black: "Ann", Site: "https://lichess.org/abc" }, accounts)).toBeUndefined();
        expect(accountSide({ White: "lesfrondes", Black: "stefano_c" }, accounts)).toBeUndefined();
        expect(accountSide({ White: "lesfrondes", Black: "Ann" }, undefined)).toBeUndefined();
    });
});

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

    it("knows the player's side only when they played one side of it (D-91)", () => {
        const playerOf = (tags: Record<string, string>) => playerIn(studiedSides(tags, "Stefano", "Claude", sides));

        expect(playerOf({ White: "AI", Black: "Player" })).toBe("black");
        expect(playerOf({ White: "Stefano", Black: "Seba" })).toBe("white");
        expect(playerOf({ White: "Ann", Black: "Bob" })).toBeUndefined();
        expect(playerOf({ White: "Stefano", Black: "Player" })).toBeUndefined();
    });

    it("gives each move the AI's badge and note, apart from the words of its comment", () => {
        const [record] = readPgn("1. e4 {[%badge book]} e5 {Symmetry. [%badge mistake] [%review too early]} *");
        const [first, second] = pliesOf(record!);

        expect(first).toEqual({ san: "e4", side: "white", number: 1, review: { badge: "book" } });
        expect(second).toEqual({ san: "e5", side: "black", number: 1, review: { badge: "mistake", note: "too early" }, comment: "Symmetry." });
    });
});
