// Each of vitest's workers serves its pages and tables on ports of its own, as each test has a data folder of its own: the files run side by side never
// take each other's ports, nor those of the player's own Chesspal. The processes the tests start inherit it.
process.env.CHESSPAL_PORT_SHIFT = String((Number(process.env.VITEST_POOL_ID ?? 0) % 99 + 1) * 10);
