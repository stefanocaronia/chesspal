import { describe, expect, it } from "vitest";
import { nextFold } from "../src/page/layout/folds.ts";

describe("the side columns' tabs", () => {
    it("narrow the talk to its faces, then fold it, then open it whole", () => {
        expect(nextFold("talk", "open")).toBe("rail");
        expect(nextFold("talk", "rail")).toBe("folded");
        expect(nextFold("talk", "folded")).toBe("open");
    });

    it("fold the game and open it", () => {
        expect(nextFold("game", "open")).toBe("folded");
        expect(nextFold("game", "folded")).toBe("open");
    });
});
