import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Chesspal by its own package's name, from its source, as a user's code imports it from npm.
const source = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

// Only the tests in test/: project/ is another repo, and Claude Code's worktrees hold other copies of this one. No test reaches the player's own data
// folder (D-71), nor the user's home, where init adds Chesspal to an Antigravity installed (D-115): one that forgets its own, and the processes they
// start, get temporary ones, new at every run. Each worker serves its pages on ports of its own (test/setup.ts).
const home = mkdtempSync(join(tmpdir(), "chesspal-tests-home-"));

export default defineConfig({
    resolve: { alias: [{ find: /^chesspal$/, replacement: source("./src/index.ts") }] },
    test: { include: ["test/**/*.test.ts"], setupFiles: ["test/setup.ts"], env: { CHESSPAL_HOME: mkdtempSync(join(tmpdir(), "chesspal-tests-")), HOME: home, USERPROFILE: home } },
});
