// What `chesspal init` writes in a player's folder for each AI host: the lines that start a chat, the MCP server, the hooks and the agents.
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { makeFolder, writeAtomically } from "../games/index.ts";
import { agentFiles, instructionsFile } from "./agents.ts";

/**
 * Sets up the player's folder for Claude Code and Codex (D-31): .mcp.json with the chesspal server, AGENTS.md with the lines that start a chat between
 * Chesspal's marks (D-102), CLAUDE.md importing it, the hosts' settings with the server approved, and their hooks. What the player wrote there stays; it returns
 * the files written.
 */
export function setUpHosts(folder: string, platform: string): string[]
{
    makeFolder(folder);
    const written = hostChanges(folder, platform);

    for (const { path, text } of written) {
        makeFolder(join(path, ".."));
        writeAtomically(path, text);
    }

    return written.map(({ path }) => path);
}

/**
 * The files an older init wrote in a folder, or left out, that this version would write otherwise, by their paths in it: the AI and the page then ask the
 * player to run init again. None in a folder init never set up.
 */
export function outdatedHostFiles(folder: string, platform: string): string[]
{
    if (!markedBlock.test(textOf(join(folder, "AGENTS.md")) ?? "")) {
        return [];
    }

    return hostChanges(folder, platform).map(({ path }) => relative(folder, path));
}

/** Where Codex reads a folder's hooks, which it runs only once the player trusts them. */
export function codexHooksPath(folder: string): string
{
    return join(folder, ".codex", "hooks.json");
}

/** The instructions of the AI opponent, read from the package wherever it is installed: the MCP server's `instructions` tool gives them (D-102). */
export function opponentInstructions(): string
{
    return instructionsFile("opponent");
}

/** The lines that start a chat, in the MCP server's instructions and in AGENTS.md: call `instructions`, then `status` (D-102). */
export function startInstructions(): string
{
    return instructionsFile("start");
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

/** What init writes for each host, missing or changed: what the player wrote there stays. */
function hostChanges(folder: string, platform: string): FileChange[]
{
    const changes = [mcpFile(folder, platform), agentsFile(folder), claudeFile(folder), claudeSettingsFile(folder), ...agentChanges(folder), codexConfigFile(folder, platform), codexHooksFile(folder)];
    return changes.filter((change) => change !== undefined);
}

/** How a host starts the server: on Windows through cmd, which finds npm's shim. */
function chesspalServer(platform: string): { command: string; args: string[]; }
{
    return platform === "win32" ? { command: "cmd", args: ["/c", "chesspal", "mcp"] } : { command: "chesspal", args: ["mcp"] };
}

/** The agents of Claude Code and Codex, Chesspal's whole, whichever host the player has (Stefano): written when they are missing or changed. */
function agentChanges(folder: string): FileChange[]
{
    return agentFiles(folder).filter(({ path, text }) => textOf(path) !== text);
}

/** .mcp.json with the chesspal server, beside the servers already there, keeping the environment the player gave it, as CHESSPAL_HOME in a playtest. */
function mcpFile(folder: string, platform: string): FileChange | undefined
{
    const path = join(folder, ".mcp.json");
    const config = jsonOf(path);
    const servers = isObject(config.mcpServers) ? config.mcpServers : {};
    const before = isObject(servers.chesspal) ? servers.chesspal : {};
    return changed(path, { ...config, mcpServers: { ...servers, chesspal: { ...chesspalServer(platform), ...(isObject(before.env) ? { env: before.env } : {}) } } });
}

/**
 * AGENTS.md with the lines that start a chat between Chesspal's marks, which Codex needs beside the server's instructions (D-31, D-102): rewritten when
 * they changed, put first in a file that has none.
 */
function agentsFile(folder: string): FileChange | undefined
{
    const path = join(folder, "AGENTS.md");
    const before = textOf(path);
    const block = [startMark, startInstructions(), endMark].join("\n");

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
 * moves on the page (D-47), and the note of how each chat starts (D-57); the player's own stay.
 */
function claudeSettingsFile(folder: string): FileChange | undefined
{
    const path = join(folder, ".claude", "settings.json");
    const settings = jsonOf(path);
    const permissions = isObject(settings.permissions) ? settings.permissions : {};
    const hooks = isObject(settings.hooks) ? settings.hooks : {};
    return changed(path, {
        ...settings,
        enabledMcpjsonServers: withItem(settings.enabledMcpjsonServers, "chesspal"),
        permissions: { ...permissions, allow: withItem(permissions.allow, "mcp__chesspal") },
        hooks: withHook(withHook(hooks, "Stop", bellHook), "SessionStart", chatHook),
    });
}

/** The hooks with one of Chesspal's put back beside the player's own whenever it is missing; an event of theirs that is no list stays theirs. */
function withHook(hooks: Record<string, unknown>, event: string, ours: { command: string; }): Record<string, unknown>
{
    const entries = hooks[event];

    if (entries !== undefined && !Array.isArray(entries)) {
        return hooks;
    }

    const list = (entries ?? []) as unknown[];
    const there = list.some((entry) => isObject(entry) && Array.isArray(entry.hooks) && entry.hooks.some((hook) => isObject(hook) && hook.command === ours.command));
    return there ? hooks : { ...hooks, [event]: [...list, { hooks: [ours] }] };
}

// Claude Code's Stop hook for the doorbell (D-47): it waits in the background from the end of each turn, and wakes the chat only when the player moves on
// the page; a day at most, until the next turn starts another.
const bellHook = { type: "command", command: "chesspal listen", asyncRewake: true, timeout: 86_400 };

// Claude Code's SessionStart hook (D-57): it notes how each chat starts, so that a new game waits for a clean one.
const chatHook = { type: "command", command: "chesspal chat" };

/**
 * Codex's settings, read once the player trusts the folder: the chesspal server with its tools approved, a table of Chesspal's rewritten but for the
 * environment the player gave it, as CHESSPAL_HOME in a playtest; the rest stays.
 */
function codexConfigFile(folder: string, platform: string): FileChange | undefined
{
    const path = join(folder, ".codex", "config.toml");
    const before = textOf(path) ?? "";
    const { command, args } = chesspalServer(platform);
    // The table runs up to the next one, or to the end; a header with a comment after it is the same table.
    const ours = /^\s*\[mcp_servers\.chesspal\]\s*(#.*)?\r?\n[\s\S]*?(?=^\s*\[|(?![\s\S]))/m;
    const environment = (ours.exec(before)?.[0].match(/^\s*env(?:_vars)?\s*=.*$/gm) ?? []).map((line) => `${line.trim()}\n`).join("");
    const table = `[mcp_servers.chesspal]\ncommand = ${JSON.stringify(command)}\nargs = [${args.map((arg) => JSON.stringify(arg)).join(", ")}]\ndefault_tools_approval_mode = "approve"\n${environment}`;
    const rest = before.replace(ours, "").trim();
    const text = rest === "" ? table : `${rest}\n\n${table}`;
    return text === before ? undefined : { path, text };
}

/** Codex's hooks, read once the player has trusted them: the doorbell of the moves on the page and how each chat starts, beside the player's own. */
function codexHooksFile(folder: string): FileChange | undefined
{
    const path = codexHooksPath(folder);
    const config = jsonOf(path);
    const hooks = isObject(config.hooks) ? config.hooks : {};
    return changed(path, { ...config, hooks: withHook(withHook(hooks, "Stop", codexBellHook), "SessionStart", codexChatHook) });
}

// Codex's Stop hook for the doorbell: it holds the turn until the player acts on the page, then Codex goes on; a day at most. On Windows Codex runs
// it in PowerShell, where `chesspal` would be npm's .ps1 shim, which a strict execution policy stops.
const codexBellHook = {
    type: "command",
    command: "chesspal listen --codex",
    commandWindows: "chesspal.cmd listen --codex",
    timeout: 86_400,
    statusMessage: "Waiting for your move on the board page",
};

// Codex's SessionStart hook: it notes how each chat starts, as Claude Code's does (D-57).
const codexChatHook = { type: "command", command: "chesspal chat", commandWindows: "chesspal.cmd chat" };

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
