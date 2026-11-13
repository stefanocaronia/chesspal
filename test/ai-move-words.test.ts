import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promptAnswer } from "../src/cli/prompt-hook.ts";
import { commands, type Context, say } from "../src/commands/index.ts";
import { heardLines, loadGame } from "../src/games/index.ts";
import { gameFolder } from "../src/profiles/index.ts";
import { createMcpServer } from "../src/server/mcp/mcp.ts";
import { testContext } from "./commands.ts";

const folders: string[] = [];
let client: Client | undefined;
const start = new Date(2026, 10, 13, 18, 0, 0);
const watch = "Player wrote on the board page: «Watch this one.»";

// Claude Code names its process to the server and the hooks; these tests name the chat's session only.
beforeEach(() => {
    vi.stubEnv("CLAUDE_CODE_MESSAGING_SOCKET", "");
    vi.stubEnv("CLAUDE_CODE_SESSION_ID", "chat-1");
});

afterEach(async () => {
    await client?.close();
    client = undefined;
    vi.unstubAllEnvs();

    for (const folder of folders.splice(0)) {
        rmSync(folder, { recursive: true, force: true });
    }
});

describe("the player's words written on the board page while the AI thinks on its move", () => {
    it("come with ai_move after a move the prompt hook played, and those the hook gave are not given again", async () => {
        const context = gameWith("black");
        const server = await connect(context);
        await answer(server, "status");
        say(gameFolder(context.home()), "player", "Hello.", start);
        expect(await prompt(context, "e4")).toContain("Player wrote on the board page: «Hello.»");

        say(gameFolder(context.home()), "player", "Watch this one.", start);
        const moved = await answer(server, "ai_move", { move: "e5", plan: "Mirror." });

        expect(moved).toMatch(new RegExp(`\\n${watch}\\nNext: answer the player with ai_say, then wait for their move\\.$`));
        expect(moved).not.toContain("Hello.");
        expect(marks(context)).toEqual(["answered", "answered"]);
        expect(await answer(server, "status")).not.toContain("Watch this one");
        expect(await answer(server, "ai_say", { text: "I am watching." })).toContain("Said on the board page");
    });

    it("come with ai_move after player_move, once, and the page shows them sent, then answered", async () => {
        const context = gameWith("black");
        const server = await connect(context);
        await answer(server, "status");
        say(gameFolder(context.home()), "player", "Hello.", start);

        expect(await answer(server, "player_move", { move: "e4" })).toContain("Player wrote on the board page: «Hello.»");
        say(gameFolder(context.home()), "player", "Watch this one.", start);
        expect(marks(context)).toEqual(["read", "sent"]);
        const moved = await answer(server, "ai_move", { move: "e5", plan: "Mirror.", comment: "Hello to you." });

        expect(moved).toContain(watch);
        expect(moved).not.toContain("Hello.");
        expect(marks(context)).toEqual(["answered", "answered"]);
    });
});

/** How far each line of the talk got, as the board page shows it for this chat. */
function marks(context: Context): ReturnType<typeof heardLines>
{
    return heardLines(loadGame(gameFolder(context.home()))!, context.given);
}

function gameWith(ai: string): Context
{
    const folder = mkdtempSync(join(tmpdir(), "chesspal-ai-move-"));
    folders.push(folder);
    const context: Context = { ...testContext(folder, 0, start), pageOpen: () => true };
    const newGame = commands.find((command) => command.name === "new_game")!;
    newGame.run(newGame.input.parse({ ai_colour: ai }), context);
    return context;
}

/** The prompt hook in a process of its own, which shares no words given with the chat's server. */
function prompt(context: Context, text: string): Promise<string | undefined>
{
    return promptAnswer(
        JSON.stringify({ session_id: "chat-1", transcript_path: "chat.jsonl", cwd: context.folder, permission_mode: "default", hook_event_name: "UserPromptSubmit", prompt: text }),
        async () => ({ ...context, host: () => "claude-code", given: new Set<string>(), heard: undefined }),
    );
}

async function connect(context: Context): Promise<Client>
{
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await createMcpServer(context).connect(serverTransport);
    client = new Client({ name: "claude-code", version: "2.1.323" });
    await client.connect(clientTransport);
    return client;
}

async function answer(server: Client, name: string, args: Record<string, unknown> = {}): Promise<string>
{
    const result = await server.callTool({ name, arguments: args });
    const text = (result.content as { text: string; }[])[0]?.text ?? "";

    if (result.isError === true) {
        throw new Error(text);
    }

    return text;
}
