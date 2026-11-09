import { describe, expect, it } from "vitest";
import { timeShown } from "../src/page/players/clock-time.ts";

describe("the page's clock (T-37)", () => {
    it("shows minutes and seconds, and tenths in the last 20 seconds", () => {
        expect(timeShown(272_900)).toBe("4:32");
        expect(timeShown(3_723_000)).toBe("1:02:03");
        expect(timeShown(20_000)).toBe("0:20");
        expect(timeShown(19_480)).toBe("0:19.4");
        expect(timeShown(5_099)).toBe("0:05.0");
        expect(timeShown(0)).toBe("0:00.0");
    });
});
