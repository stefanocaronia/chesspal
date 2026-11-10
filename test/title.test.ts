import { describe, expect, it } from "vitest";
import { tabTitle } from "../src/page/app/title.ts";

describe("the tab's title", () => {
    it("names the players, White first, and the move shown with its number and the pieces' figurines", () => {
        expect(tabTitle("Stefano", "Claude", { san: "Nf3", side: "white", number: 16 })).toBe("Stefano – Claude, 16. ♞f3");
        expect(tabTitle("Stefano", "Claude", { san: "exd8=Q+", side: "black", number: 40 })).toBe("Stefano – Claude, 40... exd8=♛+");
    });

    it("names the players alone before the first move", () => {
        expect(tabTitle("Stefano", "Claude", undefined)).toBe("Stefano – Claude");
    });

    it("names the players by their first names, so that the move fits in a tab", () => {
        expect(tabTitle(" Stefano Caronia ", "Alessandra Bo", { san: "c4", side: "black", number: 16 })).toBe("Stefano – Alessandra, 16... c4");
    });
});
