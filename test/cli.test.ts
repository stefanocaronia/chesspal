import { version } from "chesspal";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { runCommandLine } from "../src/cli/command-line.ts";
import { defineCommand } from "../src/commands/registry.ts";
import { play, testContext } from "./commands.ts";

const context = testContext();

describe("the command line", () => {
    it("lists the commands, mcp and listen, each with the first sentence of its description", async () => {
        const { output, exitCode } = await runCommandLine([], context);

        expect(exitCode).toBe(0);
        expect(output).toContain(`chesspal ${version}`);
        expect(output).toMatch(/ {2}status +Shows what Chesspal sees now: its version, the player's folder and the game, with your next step\.\n/);
        expect(output).toMatch(/ {2}mcp +Start the MCP server for an AI host\.\n/);
        expect(output).toMatch(/ {2}listen +Wait for the player's move on the board page and wake the chat\.\n/);
    });

    it("says its version", async () => {
        expect(await runCommandLine(["--version"], context)).toEqual({ output: version, exitCode: 0 });
    });

    it("runs a command and renders its result, as text or as JSON", async () => {
        expect((await runCommandLine(["status"], context)).output).toBe(
            `Chesspal ${version}. Folder: /the/player\nNo game.\nNext: ask the player which colour they want, whether they want a clock and at which level you play, then call new_game.`,
        );
        expect(JSON.parse((await runCommandLine(["status", "--json"], context)).output)).toEqual({ version, folder: "/the/player" });
    });

    it("explains a command with --help", async () => {
        const { output, exitCode } = await runCommandLine(["status", "--help"], context);

        expect(exitCode).toBe(0);
        expect(output).toContain("chesspal status [options]");
        expect(output).toContain("--json");
    });

    it("refuses an unknown command, and an unknown option in the words of the MCP server", async () => {
        const unknown = await runCommandLine(["castle"], context);
        const option = await runCommandLine(["status", "--colour"], context);

        expect(unknown.exitCode).toBe(1);
        expect(unknown.output).toContain('Unknown command "castle".');
        expect(option).toEqual({ output: "status has no parameter --colour. Nothing changed.\nUsage: chesspal status [options]\nRun `chesspal status --help` for its options.", exitCode: 1 });
    });

    it("refuses options after mcp and listen, which a host starts as they are", async () => {
        expect((await runCommandLine(["mcp", "--stdio"], context)).exitCode).toBe(1);
        expect((await runCommandLine(["mcp", "--help"], context)).exitCode).toBe(0);
        expect((await runCommandLine(["listen", "--port", "5870"], context)).exitCode).toBe(1);
        expect((await runCommandLine(["listen", "--help"], context)).exitCode).toBe(0);
    });
});

describe("the command line's arguments", () => {
    const run = (...argv: string[]): ReturnType<typeof runCommandLine> => runCommandLine(["play", ...argv], context, [play]);

    it("reads positionals, numbers, lists and flags turned off", async () => {
        const { output, exitCode } = await run("e4", "--minutes", "5", "--tag", "a", "--tag", "b c", "--seconds", "1", "--seconds", "2.5", "--no-flip", "--json");

        expect(exitCode).toBe(0);
        expect(JSON.parse(output)).toEqual({ san: "e4", minutes: 5, tag: ["a", "b c"], seconds: [1, 2.5], flip: false });
    });

    it("names what is missing or wrong, as the caller writes it", async () => {
        expect((await run()).output).toMatch(/^play needs <san>\. Nothing changed\.\nUsage: chesspal play <san> \[options\]\n/);
        expect((await run("e4", "--minutes", "five")).output).toMatch(/^--minutes: .*expected number, received string\. Nothing changed\.\n/);
        expect((await run("e4", "--minutes")).output).toMatch(/^--minutes needs a value\. Nothing changed\.\n/);
        expect((await run("e4", "--minutes", "-5")).output).toMatch(/'--minutes=-XYZ'\. Nothing changed\.\n/);
        expect((await run("--san", "e4")).output).toMatch(/^Give san as <san>, without --san\. Nothing changed\.\n/);
    });

    it("refuses an option given twice, and a text in several words without quotes", async () => {
        expect((await run("e4", "--minutes", "5", "--minutes", "6")).output).toMatch(/^Give --minutes only once\. Nothing changed\.\n/);
        expect((await run("e4", "e5")).output).toMatch(/^Unexpected argument: e5\. Put a value with spaces in quotes, such as "e4 e5"\. Nothing changed\.\n/);
    });

    it("refuses a command whose field the command line would misread", async () => {
        const misread = defineCommand({ name: "misread", description: "A field named json.", input: z.object({ json: z.boolean() }), run: () => "", format: String });
        const { output, exitCode } = await runCommandLine(["misread"], context, [misread]);

        expect(exitCode).toBe(1);
        expect(output).toContain("misread has a field named json");
    });
});
