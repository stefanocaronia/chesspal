import { describe, expect, it } from "vitest";
import { clockLeft, type ShownClock, timeShown } from "../src/page/players/clock-time.ts";

const clock: ShownClock = { control: { base: 600_000, increment: 5_000 }, left: { white: 604_000, black: 600_000 }, since: "2026-11-26T10:00:00.000Z" };
const at = (seconds: number): Date => new Date(Date.parse(clock.since) + seconds * 1000);

describe("the page's clock", () => {
    it("shows minutes and seconds, and tenths in the last 20 seconds", () => {
        expect(timeShown(272_900)).toBe("4:32");
        expect(timeShown(3_723_000)).toBe("1:02:03");
        expect(timeShown(20_000)).toBe("0:20");
        expect(timeShown(19_480)).toBe("0:19.4");
        expect(timeShown(5_099)).toBe("0:05.0");
        expect(timeShown(0)).toBe("0:00.0");
    });

    it("takes the time of its turn off the side to move, and leaves the other's as it is", () => {
        expect(clockLeft(clock, "black", true, at(4))).toBe(596_000);
        expect(clockLeft(clock, "white", false, at(4))).toBe(604_000);
    });

    it("stands at the instant the server holds it, the same on a page loaded then and on one loaded later", () => {
        const held: ShownClock = { ...clock, held: at(2.5).toISOString() };
        expect(clockLeft(held, "black", true, at(3))).toBe(597_500);
        expect(clockLeft(held, "black", true, at(90))).toBe(597_500);
        // Held while nobody heard the player, it stands where the turn began: that time is given back.
        expect(clockLeft({ ...clock, held: clock.since }, "black", true, at(90))).toBe(600_000);
    });
});
