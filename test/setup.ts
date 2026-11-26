// Run by vitest before each test file. Each of vitest's workers serves its pages and tables on ports of its own, as each test has a data folder of its own:
// the files run side by side never take each other's ports, nor those of the player's own Chesspal. The processes the tests start inherit it. And no test
// starts an AI host's real program, which would act on the player's own accounts.
import { afterAll, afterEach, expect } from "vitest";
import { refuseRealHosts, takeRefused } from "./no-real-hosts.ts";

process.env.CHESSPAL_PORT_SHIFT = String((Number(process.env.VITEST_POOL_ID ?? 0) % 99 + 1) * 10);
refuseRealHosts();

afterEach(() => {
    expect(takeRefused(), "a test started an AI host's real program").toEqual([]);
});

afterAll(() => {
    expect(takeRefused(), "an AI host's real program was started after a test ended").toEqual([]);
});
