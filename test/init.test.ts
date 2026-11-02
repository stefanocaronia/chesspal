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

afterEach(() => {
    for (const folder of folders.splice(0)) {
        rmSync(folder, { recursive: true, force: true });
    }
});

describe("chesspal init", () => {
    it("sets up a folder for Claude Code and Codex, with the opponent's instructions", async () => {
        const folder = playerFolder();
        const { output, exitCode } = await runCommandLine(["init", "chess"], testContext(folder));
        const chess = join(folder, "chess");

        expect(exitCode).toBe(0);
        expect(output).toBe(
            `Set up ${chess}: .mcp.json, AGENTS.md, CLAUDE.md, ${join(".claude", "settings.json")}, ${join(".codex", "config.toml")}.\n`
                + "To play, open Claude Code or Codex in this folder and say hello; the first time, they ask whether to trust the folder: say yes, or Chesspal cannot start.\n"
                + "Chesspal must stay installed: npm install -g chesspal.",
        );
        expect(json(chess, ".mcp.json")).toEqual({ mcpServers: { chesspal: { command: "chesspal", args: ["mcp"] } } });
        expect(text(chess, "AGENTS.md")).toBe(`<!-- chesspal: these lines up to the end mark are Chesspal's, and chesspal init rewrites them; write your own after it. -->\n${opponentInstructions()}\n<!-- chesspal: end -->\n`);
        expect(text(chess, "CLAUDE.md")).toBe("@AGENTS.md\n");
        expect(json(chess, ".claude/settings.json")).toEqual({ enabledMcpjsonServers: ["chesspal"], permissions: { allow: ["mcp__chesspal"] }, hooks: { Stop: [{ hooks: [bellHook] }] } });
        expect(text(chess, ".codex/config.toml")).toBe('[mcp_servers.chesspal]\ncommand = "chesspal"\nargs = ["mcp"]\ndefault_tools_approval_mode = "approve"\n');
        expect(opponentInstructions()).toContain("call `status`");
    });

    it("starts the server through cmd on Windows", async () => {
        const folder = playerFolder();
        await runCommandLine(["init"], testContext(folder, 0, undefined, "win32"));

        expect(json(folder, ".mcp.json")).toEqual({ mcpServers: { chesspal: { command: "cmd", args: ["/c", "chesspal", "mcp"] } } });
        expect(text(folder, ".codex/config.toml")).toContain('command = "cmd"\nargs = ["/c", "chesspal", "mcp"]\n');
    });

    it("keeps what the player wrote, with a byte order mark too, rewrites only Chesspal's lines, and changes nothing the second time", async () => {
        const folder = playerFolder();
        mkdirSync(join(folder, ".claude"));
        mkdirSync(join(folder, ".codex"));
        writeFileSync(join(folder, ".mcp.json"), JSON.stringify({ mcpServers: { other: { command: "other" } } }));
        writeFileSync(join(folder, "AGENTS.md"), "<!-- chesspal: old -->\nOld lines.\n<!-- chesspal: end -->\n\nMy own rules.\n");
        writeFileSync(join(folder, "CLAUDE.md"), "My notes.\n");
        const ownStop = { hooks: [{ type: "command", command: "say done" }] };
        writeFileSync(join(folder, ".claude", "settings.json"), "﻿" + JSON.stringify({ model: "opus", permissions: { allow: ["Bash(ls)"] }, hooks: { Stop: [ownStop] } }));
        writeFileSync(join(folder, ".codex", "config.toml"), 'model = "gpt-5"\n\n[mcp_servers.chesspal] # old\ncommand = "old"\n\n[profiles.fast]\nmodel = "gpt-5-mini"\n');
        await runCommandLine(["init"], testContext(folder));

        expect(json(folder, ".mcp.json")).toEqual({ mcpServers: { other: { command: "other" }, chesspal: { command: "chesspal", args: ["mcp"] } } });
        expect(text(folder, "AGENTS.md")).toMatch(/^<!-- chesspal: these lines [^\n]*\nThis folder is the player's chess table[\s\S]*<!-- chesspal: end -->\n\nMy own rules\.\n$/);
        expect(text(folder, "AGENTS.md")).not.toContain("Old lines.");
        expect(text(folder, "CLAUDE.md")).toBe("@AGENTS.md\nMy notes.\n");
        expect(json(folder, ".claude/settings.json")).toEqual({
            model: "opus",
            enabledMcpjsonServers: ["chesspal"],
            permissions: { allow: ["Bash(ls)", "mcp__chesspal"] },
            hooks: { Stop: [ownStop, { hooks: [bellHook] }] },
        });
        expect(text(folder, ".codex/config.toml")).toBe('model = "gpt-5"\n\n[profiles.fast]\nmodel = "gpt-5-mini"\n\n[mcp_servers.chesspal]\ncommand = "chesspal"\nargs = ["mcp"]\ndefault_tools_approval_mode = "approve"\n');
        expect((await runCommandLine(["init"], testContext(folder))).output).toMatch(/is set up already: nothing to change\.\n/);
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
