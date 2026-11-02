import { version } from "chesspal";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("the package", () => {
    it("says the version of its package.json", () => {
        const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string; };

        expect(version).toBe(manifest.version);
    });
});
