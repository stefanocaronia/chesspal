// The guard of test/setup.ts: an AI host's real program is refused, in the tests and in Chesspal's own modules; a fake one in a temporary folder is not.
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { startLineProcess } from "../src/hosts/index.ts";
import { makeTempFolder, removeTempFolders } from "./hosts/temp.ts";
import { realHostIn, takeRefused } from "./no-real-hosts.ts";

afterAll(removeTempFolders);

describe("no test starts an AI host's real program", () => {
    it("knows the hosts' programs by name or by package, outside the temporary folder", () => {
        const fake = join(makeTempFolder(), "node_modules", "@anthropic-ai", "claude-code", "cli.js");

        for (const line of ["claude --version", "claude.exe auth status", '"C:/Users/someone/.local/bin/claude.exe" auth status', "codex login status", "agy acp", "opencode serve"]) {
            expect(realHostIn(line), line).toBe(line);
        }

        expect(realHostIn(process.execPath, ["C:/nvm/node_modules/@openai/codex/bin/codex.js", "app-server"])).toBeDefined();
        expect(realHostIn('npm install --prefix "C:/tools" @anthropic-ai/claude-code --no-audit')).toBeDefined();
        expect(realHostIn(`"${process.execPath}" "${fake}" auth status`)).toBeUndefined();
        expect(realHostIn(process.execPath, ["cli.ts", "table"])).toBeUndefined();
        expect(realHostIn("claude-program", ["--first"])).toBeUndefined();
    });

    it("refuses one started by a test or by Chesspal, and tells it", () => {
        expect(() => spawnSync("C:/nowhere/claude.exe", ["--version"])).toThrow("A test started an AI host's real program");
        expect(() => startLineProcess("C:/nowhere/codex.exe", ["app-server"], { cwd: makeTempFolder(), env: {} })).toThrow("A test started an AI host's real program");
        expect(takeRefused()).toEqual(["C:/nowhere/claude.exe --version", "C:/nowhere/codex.exe app-server"]);
    });
});
