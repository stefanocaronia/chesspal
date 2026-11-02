import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Chesspal by its own package's name, from its source, as a user's code imports it from npm.
const source = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

// Only the tests in test/: project/ is another repo, and Claude Code's worktrees hold other copies of this one.
export default defineConfig({
    resolve: { alias: [{ find: /^chesspal$/, replacement: source("./src/index.ts") }] },
    test: { include: ["test/**/*.test.ts"] },
});
