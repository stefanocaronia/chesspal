import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCommandLine } from "../src/cli/command-line.ts";
import { opponentInstructions } from "../src/host-files/index.ts";
import { testContext } from "./commands.ts";

const folders: string[] = [];

// The doorbell of the moves on the page (D-47), as init writes it into Claude Code's settings.
const bellHook = { type: "command", command: "chesspal listen", asyncRewake: true, timeout: 86_400 };
const chatHook = { type: "command", command: "chesspal chat" };
// The doorbell as init writes it into Codex's hooks (T-62).
const codexBellHook = {
    type: "command",
    command: "chesspal listen --codex",
    commandWindows: "chesspal.cmd listen --codex",
    timeout: 86_400,
    statusMessage: "Waiting for your move on the board page",
};
// How each chat starts, noted in Codex too (T-104).
const codexChatHook = { type: "command", command: "chesspal chat", commandWindows: "chesspal.cmd chat" };

afterEach(() => {
    for (const folder of folders.splice(0)) {
        rmSync(folder, { recursive: true, force: true });
    }
});

describe("chesspal init", () => {
    it("sets up a folder for Claude Code and Codex, with the opponent's instructions, and says how to go into it (T-127)", async () => {
        const folder = playerFolder();
        const { output, exitCode } = await runCommandLine(["init", "chess"], testContext(folder));
        const chess = join(folder, "chess");

        expect(exitCode).toBe(0);
        expect(output).toBe(
            `♜ Chesspal is ready in ${chess}\n\n  To play:\n`
                + "  1. Go into the folder: cd chess\n"
                + "     then open Claude Code (claude) or Codex (codex).\n"
                + "  2. The first time, it asks whether to trust the folder: say yes.\n"
                + "     Codex also asks about Chesspal's two hooks: choose Trust all.\n"
                + "     They are small helpers that let it notice your moves on the board.\n"
                + "  3. Say hello: the AI gives you the link to the board.\n\n"
                + "  Updated 10 files.",
        );
        expect(json(chess, ".mcp.json")).toEqual({ mcpServers: { chesspal: { command: "chesspal", args: ["mcp"] } } });
        expect(text(chess, "AGENTS.md")).toBe(`<!-- chesspal: these lines up to the end mark are Chesspal's, and chesspal init rewrites them; write your own after it. -->\n${opponentInstructions()}\n<!-- chesspal: end -->\n`);
        expect(text(chess, "CLAUDE.md")).toBe("@AGENTS.md\n");
        expect(json(chess, ".claude/settings.json")).toEqual({ enabledMcpjsonServers: ["chesspal"], permissions: { allow: ["mcp__chesspal"] }, hooks: { Stop: [{ hooks: [bellHook] }], SessionStart: [{ hooks: [chatHook] }] } });
        expect(text(chess, ".codex/config.toml")).toBe('[mcp_servers.chesspal]\ncommand = "chesspal"\nargs = ["mcp"]\ndefault_tools_approval_mode = "approve"\n');
        expect(json(chess, ".codex/hooks.json")).toEqual({ hooks: { Stop: [{ hooks: [codexBellHook] }], SessionStart: [{ hooks: [codexChatHook] }] } });
        expect(opponentInstructions()).toContain("call `status`");
        expect(text(chess, ".claude/agents/chesspal-ponder-quick.md")).toMatch(
            /^---\nname: chesspal-ponder-quick\n.*\ntools: mcp__chesspal__ponder\nmodel: haiku\n---\n\nYou are the player's chess opponent/s,
        );
        expect(text(chess, ".claude/agents/chesspal-ponder.md")).toContain("\nmodel: inherit\n");
        // The coach works with its one tool on the AI's own model, and its description keeps the chat from asking it about the game (D-88).
        expect(text(chess, ".claude/agents/chesspal-coach.md")).toMatch(
            /^---\nname: chesspal-coach\ndescription: .*never to answer the player\.\ntools: mcp__chesspal__coach\nmodel: inherit\n---\n\nYou are the player's chess coach/s,
        );
        // The analyst works with the analysis tools, and reads the facts as the chat's analyst does (D-89).
        const analyst = text(chess, ".claude/agents/chesspal-analyst.md");
        expect(analyst).toMatch(
            /^---\nname: chesspal-analyst\ndescription: .*never to answer the player\.\ntools: mcp__chesspal__analyse_game, mcp__chesspal__annotate_game, mcp__chesspal__look, mcp__chesspal__position\nmodel: inherit\n---\n\nYou are the player's chess analyst/s,
        );
        expect(analyst).toContain("\n- Each line of the analysis is a move");
    });

    it("starts the server through cmd on Windows", async () => {
        const folder = playerFolder();
        await runCommandLine(["init"], testContext(folder, 0, undefined, "win32"));

        expect(json(folder, ".mcp.json")).toEqual({ mcpServers: { chesspal: { command: "cmd", args: ["/c", "chesspal", "mcp"] } } });
        expect(text(folder, ".codex/config.toml")).toContain('command = "cmd"\nargs = ["/c", "chesspal", "mcp"]\n');
    });

    it("keeps what the player wrote, the server's environment too (D-71), with a byte order mark too, rewrites only Chesspal's lines, and changes nothing the second time", async () => {
        const folder = playerFolder();
        mkdirSync(join(folder, ".claude"));
        mkdirSync(join(folder, ".codex"));
        writeFileSync(join(folder, ".mcp.json"), JSON.stringify({ mcpServers: { other: { command: "other" }, chesspal: { command: "old", env: { CHESSPAL_HOME: "D:/runs" } } } }));
        writeFileSync(join(folder, "AGENTS.md"), "<!-- chesspal: old -->\nOld lines.\n<!-- chesspal: end -->\n\nMy own rules.\n");
        writeFileSync(join(folder, "CLAUDE.md"), "My notes.\n");
        const ownStop = { hooks: [{ type: "command", command: "say done" }] };
        writeFileSync(join(folder, ".claude", "settings.json"), "﻿" + JSON.stringify({ model: "opus", permissions: { allow: ["Bash(ls)"] }, hooks: { Stop: [ownStop] } }));
        writeFileSync(join(folder, ".codex", "hooks.json"), JSON.stringify({ hooks: { Stop: [ownStop] } }));
        writeFileSync(join(folder, ".codex", "config.toml"), 'model = "gpt-5"\n\n[mcp_servers.chesspal] # old\ncommand = "old"\nenv = { CHESSPAL_HOME = "D:/runs" }\n\n[profiles.fast]\nmodel = "gpt-5-mini"\n');
        // Codex runs hooks that changed only once the player trusts them again (T-125).
        expect((await runCommandLine(["init"], testContext(folder))).output).toContain(
            "\n\n  Chesspal's hooks for Codex have changed: when Codex asks about them, choose Trust all again.\n\n  Updated 10 files.",
        );

        expect(json(folder, ".mcp.json")).toEqual({ mcpServers: { other: { command: "other" }, chesspal: { command: "chesspal", args: ["mcp"], env: { CHESSPAL_HOME: "D:/runs" } } } });
        expect(text(folder, "AGENTS.md")).toMatch(/^<!-- chesspal: these lines [^\n]*\nThis folder is the player's chess table[\s\S]*<!-- chesspal: end -->\n\nMy own rules\.\n$/);
        expect(text(folder, "AGENTS.md")).not.toContain("Old lines.");
        expect(text(folder, "CLAUDE.md")).toBe("@AGENTS.md\nMy notes.\n");
        expect(json(folder, ".claude/settings.json")).toEqual({
            model: "opus",
            enabledMcpjsonServers: ["chesspal"],
            permissions: { allow: ["Bash(ls)", "mcp__chesspal"] },
            hooks: { Stop: [ownStop, { hooks: [bellHook] }], SessionStart: [{ hooks: [chatHook] }] },
        });
        expect(text(folder, ".codex/config.toml")).toBe(
            'model = "gpt-5"\n\n[profiles.fast]\nmodel = "gpt-5-mini"\n\n[mcp_servers.chesspal]\ncommand = "chesspal"\nargs = ["mcp"]\ndefault_tools_approval_mode = "approve"\nenv = { CHESSPAL_HOME = "D:/runs" }\n',
        );
        expect(json(folder, ".codex/hooks.json")).toEqual({ hooks: { Stop: [ownStop, { hooks: [codexBellHook] }], SessionStart: [{ hooks: [codexChatHook] }] } });
        expect((await runCommandLine(["init"], testContext(folder))).output).toMatch(/^♜ Chesspal is ready in .*: nothing to change\n/);
    });

    it("speaks the system's language: Italian, else English", async () => {
        const folder = playerFolder();
        const output = (await runCommandLine(["init"], { ...testContext(folder), language: "it-IT" })).output;

        expect(output).toMatch(/^♜ Chesspal è pronto in .*\n\n {2}Per giocare:\n {2}1\. Apri Claude Code o Codex in questa cartella\.\n/);
        expect(output).toMatch(/\n\n {2}Aggiornati 10 file\.$/);
        expect(output).not.toContain("consentili di nuovo");
        expect((await runCommandLine(["init", "la mia scacchiera"], { ...testContext(folder), language: "it-IT" })).output).toContain(
            '  1. Entra nella cartella: cd "la mia scacchiera"\n     poi apri Claude Code (claude) o Codex (codex).\n',
        );
        expect((await runCommandLine(["init"], { ...testContext(folder), language: "fr-FR" })).output).toMatch(/^♜ Chesspal is ready in .*: nothing to change\n/);
    });

    it("refuses a settings file that is not JSON, and says how to fix it", async () => {
        const folder = playerFolder();
        writeFileSync(join(folder, ".mcp.json"), "{ broken");
        const { output, exitCode } = await runCommandLine(["init"], testContext(folder));

        expect(exitCode).toBe(1);
        expect(output).toBe(`${join(folder, ".mcp.json")} is not a JSON object, so Chesspal cannot add itself to it: fix it or remove it, then run chesspal init again.`);
    });
});

/** A player's folder of its own, removed after the test. */
function playerFolder(): string
{
    const folder = mkdtempSync(join(tmpdir(), "chesspal-"));
    folders.push(folder);
    return folder;
}

function text(folder: string, name: string): string
{
    return readFileSync(join(folder, name), "utf8");
}

function json(folder: string, name: string): unknown
{
    return JSON.parse(text(folder, name));
}
