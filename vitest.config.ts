import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Chesspal by its own package's name, from its source, as a user's code imports it from npm.
const source = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

// Only the tests in test/: project/ is another repo, and Claude Code's worktrees hold other copies of this one. No test reaches the player's own data
// folder (D-71): one that forgets its own, and the processes they start, get a temporary one, new at every run.
export default defineConfig({
    resolve: { alias: [{ find: /^chesspal$/, replacement: source("./src/index.ts") }] },
    test: { include: ["test/**/*.test.ts"], env: { CHESSPAL_HOME: mkdtempSync(join(tmpdir(), "chesspal-tests-")) } },
});
