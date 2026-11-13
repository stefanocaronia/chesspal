import { describe, expect, it } from "vitest";
import { readPgn } from "../src/core/index.ts";
import { pliesOf, reviewCount } from "../src/page/game/plies.ts";

describe("how far a review has got, on the board page", () => {
    it("counts the moves the analyst said who is ahead after, of all the game's, as status counts them for the AI", () => {
        expect(reviewCount(pliesOf(readPgn("1. e4 e5 2. Nf3 Nc6 *")[0]!))).toEqual({ done: 0, total: 4 });
        expect(reviewCount(pliesOf(readPgn("1. e4 {[%lead +0.3]} e5 {[%lead +0.2] [%badge book]} 2. Nf3 {[%badge book]} Nc6 *")[0]!))).toEqual({ done: 2, total: 4 });
    });
});
