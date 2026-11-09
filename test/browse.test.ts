import { describe, expect, it } from "vitest";
import { stepKeys, stepped } from "../src/page/game/browse.ts";

describe("looking back through the game", () => {
    it("steps one move at a time or to either end, never past them", () => {
        expect(stepped("back", 10, 10)).toBe(9);
        expect(stepped("forward", 9, 10)).toBe(10);
        expect(stepped("first", 7, 10)).toBe(0);
        expect(stepped("last", 0, 10)).toBe(10);
        expect(stepped("back", 0, 10)).toBe(0);
        expect(stepped("forward", 10, 10)).toBe(10);
        expect(stepped("back", 0, 0)).toBe(0);
    });

    it("takes the keys of Lichess and chess.com", () => {
        expect([stepKeys.ArrowLeft, stepKeys.ArrowRight, stepKeys.ArrowUp, stepKeys.ArrowDown, stepKeys.Home, stepKeys.End]).toEqual(["back", "forward", "first", "last", "first", "last"]);
    });
});
