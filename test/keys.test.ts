import { describe, expect, it } from "vitest";
import { hushes } from "../src/page/app/keys.ts";

describe("the keys that stop the voice", () => {
    it("take Esc wherever it goes, a box or a dialog's button too", () => {
        expect(hushes("Escape", "page")).toBe(true);
        expect(hushes("Escape", "typing")).toBe(true);
        expect(hushes("Escape", "control")).toBe(true);
    });

    it("take Space only on the page, never from a box the player types in nor a control it presses", () => {
        expect(hushes(" ", "page")).toBe(true);
        expect(hushes(" ", "typing")).toBe(false);
        expect(hushes(" ", "control")).toBe(false);
        expect(hushes("Enter", "page")).toBe(false);
    });
});
