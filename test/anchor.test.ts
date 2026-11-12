import { describe, expect, it } from "vitest";
import { anchorAction, anchorName, anchorOf, hashOf, shownHash } from "../src/page/app/anchor.ts";

describe("the move shown in the page's address", () => {
    it("reads a game by its name and how many of its moves are shown, or the game as it is", () => {
        expect(anchorOf("#2026-11-04-184025/31")).toEqual({ game: "2026-11-04-184025", plies: 31 });
        expect(anchorOf("#2026-11-04-184025/0")).toEqual({ game: "2026-11-04-184025", plies: 0 });
        expect(anchorOf("#2026-11-04-184025")).toEqual({ game: "2026-11-04-184025" });

        for (const wrong of ["", "#", "#2026-11-04", "#2026-11-04-184025/", "#2026-11-04-184025/-1", "#2026-11-04-184025/31/2", "#games/2026-11-04-184025.pgn", "#x2026-11-04-184025"]) {
            expect(anchorOf(wrong)).toBeUndefined();
        }
    });

    it("writes what it reads, and names a game of the archive or kept to study without its folder", () => {
        for (const hash of ["#2026-11-04-184025/31", "#2026-11-04-184025"]) {
            expect(hashOf(anchorOf(hash)!)).toBe(hash);
        }

        expect(anchorName("games/2026-11-04-184025.pgn")).toBe("2026-11-04-184025");
        expect(anchorName("study/2026-11-04-153012.pgn")).toBe("2026-11-04-153012");
        expect(anchorName("game.json")).toBeUndefined();
    });

    it("goes to the move on the game shown, opens another in analysis only when no game goes on, and waits for the player's yes on the one just played", () => {
        const games = { ready: true, shown: "2026-11-04-184025", played: undefined, going: false };
        const other = { game: "2026-11-05-101500", plies: 12 };

        expect(anchorAction({ game: "2026-11-04-184025", plies: 31 }, games, undefined)).toBe("view");
        expect(anchorAction(other, games, undefined)).toBe("open");
        expect(anchorAction(other, games, other.game)).toBe("wait");
        // A game going on keeps its place, and the page says why the link is not followed.
        expect(anchorAction(other, { ...games, played: "2026-11-09-220000", going: true }, undefined)).toBe("refuse");
        // The game just played, with the table set (D-77), opens in analysis on the player's yes alone (D-89); once another game shows, the link goes.
        expect(anchorAction(other, { ...games, shown: undefined, played: other.game }, undefined)).toBe("wait");
        expect(anchorAction(other, { ...games, played: other.game }, undefined)).toBe("drop");
    });

    it("writes the move shown in analysis, and the game alone at its end and while it goes on, for the position as it is", () => {
        const games = { ready: true, shown: "2026-11-04-184025", played: undefined, going: false };

        expect(shownHash(games, 31)).toBe("#2026-11-04-184025/31");
        expect(shownHash(games, undefined)).toBe("#2026-11-04-184025");
        expect(shownHash({ ...games, going: true }, 12)).toBe("#2026-11-04-184025");
        expect(shownHash({ ...games, shown: undefined }, undefined)).toBe("");
    });
});
