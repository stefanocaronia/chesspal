import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { makeFolder, writeAtomically } from "../games/index.ts";

/**
 * Sets up the player's folder for Claude Code and Codex (D-31): .mcp.json with the chesspal server, AGENTS.md with the opponent's instructions between
 * Chesspal's marks, CLAUDE.md importing it, and the hosts' settings with the server approved. What the player wrote there stays; it returns the files written.
 */
export function setUpHosts(folder: string, platform: string): string[]
{
    makeFolder(folder);
    const changes = [mcpFile(folder, platform), agentsFile(folder), claudeFile(folder), claudeSettingsFile(folder), codexConfigFile(folder, platform)];
    const written = changes.filter((change) => change !== undefined);

    for (const { path, text } of written) {
        makeFolder(join(path, ".."));
        writeAtomically(path, text);
    }

    return written.map(({ path }) => path);
}

/** The instructions of the AI opponent, read from the package wherever it is installed (T-8). */
export function opponentInstructions(): string
{
    return readFileSync(new URL("../../instructions/opponent.md", import.meta.url), "utf8").trim();
}

interface FileChange
{
    path: string;
    text: string;
}

// The marks around Chesspal's lines in AGENTS.md: init rewrites what lies between them, and the player's own text stays around them.
const startMark = "<!-- chesspal: these lines up to the end mark are Chesspal's, and chesspal init rewrites them; write your own after it. -->";
const endMark = "<!-- chesspal: end -->";
const markedBlock = /<!-- chesspal: (?!end)[^\n]*\n[\s\S]*?<!-- chesspal: end -->/;

/** How a host starts the server: on Windows through cmd, which finds npm's shim. */
function chesspalServer(platform: string): { command: string; args: string[]; }
{
    return platform === "win32" ? { command: "cmd", args: ["/c", "chesspal", "mcp"] } : { command: "chesspal", args: ["mcp"] };
}

/** .mcp.json with the chesspal server, beside the servers already there. */
function mcpFile(folder: string, platform: string): FileChange | undefined
{
    const path = join(folder, ".mcp.json");
    const config = jsonOf(path);
    const servers = isObject(config.mcpServers) ? config.mcpServers : {};
    return changed(path, { ...config, mcpServers: { ...servers, chesspal: chesspalServer(platform) } });
}

/** AGENTS.md with the opponent's instructions between Chesspal's marks: rewritten when they changed, put first in a file that has none. */
function agentsFile(folder: string): FileChange | undefined
{
    const path = join(folder, "AGENTS.md");
    const before = textOf(path);
    const block = [startMark, opponentInstructions(), endMark].join("\n");

    if (before === undefined) {
        return { path, text: `${block}\n` };
    }

    const text = markedBlock.test(before) ? before.replace(markedBlock, () => block) : `${block}\n\n${before}`;
    return text === before ? undefined : { path, text };
}

/** CLAUDE.md, which Claude Code reads, importing AGENTS.md: the import put first in a file without it. */
function claudeFile(folder: string): FileChange | undefined
{
    const path = join(folder, "CLAUDE.md");
    const before = textOf(path);

    if (before === undefined) {
        return { path, text: "@AGENTS.md\n" };
    }

    return before.split(/\r?\n/).some((line) => line.trim() === "@AGENTS.md") ? undefined : { path, text: `@AGENTS.md\n${before}` };
}

/**
 * Claude Code's settings: the chesspal server of .mcp.json approved and its tools allowed, so that the first chat asks for neither, and the doorbell of the
 * moves on the page (D-47); the player's own stay.
 */
function claudeSettingsFile(folder: string): FileChange | undefined
{
    const path = join(folder, ".claude", "settings.json");
    const settings = jsonOf(path);
    const permissions = isObject(settings.permissions) ? settings.permissions : {};
    const hooks = isObject(settings.hooks) ? settings.hooks : {};
    const stops = Array.isArray(hooks.Stop) ? hooks.Stop as unknown[] : [];
    const belled = stops.some((entry) => isObject(entry) && Array.isArray(entry.hooks) && entry.hooks.some((hook) => isObject(hook) && hook.command === bellHook.command));
    return changed(path, {
        ...settings,
        enabledMcpjsonServers: withItem(settings.enabledMcpjsonServers, "chesspal"),
        permissions: { ...permissions, allow: withItem(permissions.allow, "mcp__chesspal") },
        // Put back beside the player's own hooks whenever it is missing; a Stop of theirs that is no list stays theirs.
        hooks: hooks.Stop !== undefined && !Array.isArray(hooks.Stop) ? hooks : { ...hooks, Stop: belled ? stops : [...stops, { hooks: [bellHook] }] },
    });
}

// Claude Code's Stop hook for the doorbell (D-47): it waits in the background from the end of each turn, and wakes the chat only when the player moves on
// the page; a day at most, until the next turn starts another.
const bellHook = { type: "command", command: "chesspal listen", asyncRewake: true, timeout: 86_400 };

/** Codex's settings, read once the player trusts the folder: the chesspal server with its tools approved, a table of Chesspal's rewritten; the rest stays. */
function codexConfigFile(folder: string, platform: string): FileChange | undefined
{
    const path = join(folder, ".codex", "config.toml");
    const before = textOf(path) ?? "";
    const { command, args } = chesspalServer(platform);
    const table = `[mcp_servers.chesspal]\ncommand = ${JSON.stringify(command)}\nargs = [${args.map((arg) => JSON.stringify(arg)).join(", ")}]\ndefault_tools_approval_mode = "approve"\n`;
    // The table runs up to the next one, or to the end; a header with a comment after it is the same table.
    const ours = /^\s*\[mcp_servers\.chesspal\]\s*(#.*)?\r?\n[\s\S]*?(?=^\s*\[|(?![\s\S]))/m;
    const rest = before.replace(ours, "").trim();
    const text = rest === "" ? table : `${rest}\n\n${table}`;
    return text === before ? undefined : { path, text };
}

/** A JSON file's new content, when it differs from what is there. */
function changed(path: string, value: Record<string, unknown>): FileChange | undefined
{
    const text = `${JSON.stringify(value, null, 2)}\n`;
    return textOf(path) === text ? undefined : { path, text };
}

/** A list with an item added when it is missing; a value that is no list becomes one. */
function withItem(list: unknown, item: string): unknown[]
{
    const items = Array.isArray(list) ? list as unknown[] : [];
    return items.includes(item) ? items : [...items, item];
}

/** The object a JSON file holds, empty when there is no file; a file that is not a JSON object stops init with how to fix it. */
function jsonOf(path: string): Record<string, unknown>
{
    const text = textOf(path);

    if (text === undefined) {
        return {};
    }

    let value: unknown;

    try {
        value = JSON.parse(text);
    } catch {
        value = undefined;
    }

    if (!isObject(value)) {
        throw new Error(`${path} is not a JSON object, so Chesspal cannot add itself to it: fix it or remove it, then run chesspal init again.`);
    }

    return value;
}

function textOf(path: string): string | undefined
{
    // Windows PowerShell and Notepad may start a file with a byte order mark, which JSON.parse refuses.
    return existsSync(path) ? readFileSync(path, "utf8").replace(/^﻿/, "") : undefined;
}

function isObject(value: unknown): value is Record<string, unknown>
{
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
