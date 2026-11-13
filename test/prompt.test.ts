import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { answerPrompt, promptAnswer } from "../src/cli/prompt-hook.ts";
import { commands, type Context, say } from "../src/commands/index.ts";
import { loadGame, saveChatStart } from "../src/games/index.ts";
import { setUpHosts } from "../src/host-files/index.ts";
import { gameFolder } from "../src/profiles/index.ts";
import { waitForBell } from "../src/server/bell/bell.ts";
import { createMcpServer } from "../src/server/mcp/mcp.ts";
import { type Page, startPage } from "../src/server/page/index.ts";
import { testContext } from "./commands.ts";

const folders: string[] = [];
const pages: Page[] = [];
let client: Client | undefined;
const start = new Date(2026, 10, 13, 18, 0, 0);
const noteFile = "position-shown.json";

afterEach(async () => {
    await client?.close();
    client = undefined;
    await Promise.all(pages.splice(0).map((page) => page.close()));
    vi.unstubAllEnvs();

    for (const folder of folders.splice(0)) {
        rmSync(folder, { recursive: true, force: true });
    }
});

describe("a move the player writes alone in the chat", () => {
    it("is played as the player sent it, with no allowance, and the AI is told the position as player_move tells it", async () => {
        const context = gameWith("black", "5+0");
        const sent = at(context, 20);
        const said = await prompt(sent, " e4 ");

        expect(said).toBeDefined();
        const { hookSpecificOutput } = JSON.parse(said!) as { hookSpecificOutput: { hookEventName: string; additionalContext: string; }; };
        expect(hookSpecificOutput.hookEventName).toBe("UserPromptSubmit");
        expect(hookSpecificOutput.additionalContext).toMatch(/^Chesspal has already played the move the player wrote alone in the chat: don't call player_move for it\.\nPlayer: 1\.e4 \(e2-e4\)\./);
        expect(hookSpecificOutput.additionalContext).toMatch(/\nNext: .*ai_move/);
        // Twenty seconds off the player's five minutes, none given back: the move was sent then.
        expect(gameFile(context).pgn).toMatch(/1\. e4 \{ ?\[%clk 0:04:40\] ?\}/);
        expect(gameFile(context).clock).toMatchObject({ since: sent.now().toISOString() });
        expect(JSON.parse(readFileSync(join(context.folder, noteFile), "utf8"))).toMatchObject({ session: "chat-1", plies: 1 });
    });

    it("plays squares, castling written with zeros and a piece's small letter, as player_move does", async () => {
        const context = gameWith("black");
        expect(await prompt(context, "g1f3")).toBeDefined();
        await play(context, "ai_move", { move: "d5", plan: "Centre." });
        expect(await prompt(context, "g3")).toBeDefined();
        await play(context, "ai_move", { move: "Nf6", plan: "Develop." });
        expect(await prompt(context, "bg2")).toBeUndefined();
        expect(await prompt(context, "Bg2")).toBeDefined();
        await play(context, "ai_move", { move: "e6", plan: "Solid." });
        expect(await prompt(context, "0-0")).toBeDefined();
        expect(loadGame(gameFolder(context.home()))?.game.record.moves.map((move) => move.san)).toEqual(["Nf3", "d5", "g3", "Nf6", "Bg2", "e6", "O-O"]);
    });

    it("leaves every other prompt to the AI, the game as it was", async () => {
        const context = gameWith("black");
        const before = readFileSync(join(gameFolder(context.home()), "game.json"), "utf8");
        const prompts = ["I think I'll play e4 now", "e4?", "e4!", "gioco e4", "e4 e5", "e5", "Ke2", "Cf3", "", "   ", "<task-notification>e4</task-notification>", "1.e4"];

        for (const text of prompts) {
            expect(await prompt(context, text), text).toBeUndefined();
        }

        expect(await promptAnswer("e4", async () => context)).toBeUndefined();
        expect(await promptAnswer(JSON.stringify({ prompt: "e4", cwd: context.folder }), async () => context)).toBeUndefined();
        expect(readFileSync(join(gameFolder(context.home()), "game.json"), "utf8")).toBe(before);
        expect(existsSync(join(context.folder, noteFile))).toBe(false);
    });

    it("leaves it to the AI on the AI's turn, with no game, in a game over, and when the game cannot be read", async () => {
        const turn = gameWith("white");
        expect(await prompt(turn, "e4")).toBeUndefined();

        const none = testContext(temporary());
        expect(await prompt(none, "e4")).toBeUndefined();

        const over = gameWith("black");
        await play(over, "end_game", { result: "player_resigns" });
        expect(await prompt(over, "e4")).toBeUndefined();

        const broken = gameWith("black");
        writeFileSync(join(gameFolder(broken.home()), "game.json"), "{ not json");
        await expect(prompt(broken, "e4")).rejects.toThrow();
        expect(existsSync(join(broken.folder, noteFile))).toBe(false);
    });

    it("leaves an R to the AI when the king could go there too: in Italian, French and Spanish R is the king", async () => {
        const context = gameWith("black", undefined, "4k3/8/8/8/8/8/8/R3K3 w - - 0 1");
        expect(await prompt(context, "Rd1")).toBeUndefined();
        expect(await prompt(context, "Ra5")).toBeDefined();
    });

    it("says nothing on stdout for a prompt that is no move, or input that is not JSON, and never stops the prompt", async () => {
        const written = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
        const errors = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

        try {
            await answerPrompt(Readable.from(["not json"]));
            await answerPrompt(Readable.from([JSON.stringify({ prompt: "hello", session_id: "chat-1" })]));
            expect(written).not.toHaveBeenCalled();
            expect(errors).not.toHaveBeenCalled();
        } finally {
            written.mockRestore();
            errors.mockRestore();
        }
    });

    it("is played from the hook's own input, in the data folder the chat's server is given", async () => {
        const home = temporary();
        const folder = temporary();
        writeFileSync(join(folder, ".mcp.json"), JSON.stringify({ mcpServers: { chesspal: { command: "chesspal", args: ["mcp"], env: { CHESSPAL_HOME: home } } } }));
        await play(testContext(home), "new_game", { ai_colour: "black" });
        vi.stubEnv("CLAUDE_PROJECT_DIR", folder);
        vi.stubEnv("CHESSPAL_HOME", "");
        const written = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

        try {
            await answerPrompt(Readable.from([JSON.stringify({ prompt: "d4", session_id: "chat-1", cwd: folder })]));
            expect(String(written.mock.calls[0]?.[0])).toMatch(/"additionalContext":"Chesspal has already played/);
        } finally {
            written.mockRestore();
        }

        expect(loadGame(gameFolder(testContext(home).home()))?.game.record.moves.map((move) => move.san)).toEqual(["d4"]);
        expect(existsSync(join(folder, noteFile))).toBe(true);
    });
});

describe("the chat's server after a move the hook played (D-71)", () => {
    it("takes the hook's note: the AI moves without a status, and the note goes", async () => {
        vi.stubEnv("CLAUDE_CODE_SESSION_ID", "chat-1");
        const context = gameWith("black");
        const server = await connect(context);
        await server.callTool({ name: "status", arguments: {} });

        expect(await prompt(context, "e4")).toBeDefined();
        expect(await answer(server, "ai_move", { move: "e5", plan: "Mirror." })).toMatchObject({ isError: false });
        expect(existsSync(join(context.folder, noteFile))).toBe(false);
    });

    it("gives the player's words on the board page with the move, once: the chat's server counts them given, and the page hears it", async () => {
        vi.stubEnv("CLAUDE_CODE_SESSION_ID", "chat-1");
        const heard = vi.fn();
        const context = { ...gameWith("black"), heard };
        const server = await connect(context);
        await server.callTool({ name: "status", arguments: {} });
        say(gameFolder(context.home()), "player", "Watch this one.", start);

        expect(await prompt(context, "e4")).toContain("Player wrote on the board page: «Watch this one.»");
        heard.mockClear();
        const moved = await answer(server, "ai_move", { move: "e5", plan: "Mirror." });

        expect(moved).toMatchObject({ isError: false });
        expect(context.given.size).toBe(1);
        expect(heard).toHaveBeenCalled();
        expect(moved.text).not.toContain("Watch this one");
        expect((await answer(server, "status", {})).text).not.toContain("Watch this one");
    });

    it("gives this chat nothing of a note of another session's, words and all", async () => {
        vi.stubEnv("CLAUDE_CODE_SESSION_ID", "chat-1");
        const context = gameWith("black");
        const server = await connect(context);
        await server.callTool({ name: "status", arguments: {} });
        say(gameFolder(context.home()), "player", "Watch this one.", start);
        saveChatStart(context.folder, { source: "startup", at: start.toISOString(), session: "chat-2" });

        expect(await prompt(context, "e4", "chat-2")).toContain("Watch this one");
        expect(await answer(server, "ai_move", { move: "e5", plan: "Mirror." })).toMatchObject({ isError: true });
        expect(context.given.size).toBe(0);
        expect((await answer(server, "status", {})).text).toContain("Player wrote on the board page: «Watch this one.»");
    });

    it("takes a note of an older shape, with no words, as one that gave none", async () => {
        vi.stubEnv("CLAUDE_CODE_SESSION_ID", "chat-1");
        const context = gameWith("black");
        const server = await connect(context);
        await server.callTool({ name: "status", arguments: {} });
        await play(context, "player_move", { move: "e4" });
        const { started } = JSON.parse(readFileSync(join(gameFolder(context.home()), "game.json"), "utf8")) as { started: string; };
        writeFileSync(join(context.folder, noteFile), JSON.stringify({ session: "chat-1", started, plies: 1, at: start.toISOString() }));

        expect(await answer(server, "ai_move", { move: "e5", plan: "Mirror." })).toMatchObject({ isError: false });
        expect(context.given.size).toBe(0);
    });

    it("takes the note of the session the chat was cleared to, not of a chat started or resumed beside it", async () => {
        vi.stubEnv("CLAUDE_CODE_SESSION_ID", "chat-1");
        const context = gameWith("black");
        const server = await connect(context);
        await server.callTool({ name: "status", arguments: {} });

        saveChatStart(context.folder, { source: "startup", at: start.toISOString(), session: "chat-2" });
        expect(await prompt(context, "e4", "chat-2")).toBeDefined();
        expect(await answer(server, "ai_move", { move: "e5", plan: "Mirror." })).toMatchObject({ isError: true, text: expect.stringMatching(/call status/) });
        // Another chat's note on the game as it is stays for that chat.
        expect(existsSync(join(context.folder, noteFile))).toBe(true);

        saveChatStart(context.folder, { source: "clear", at: start.toISOString(), session: "chat-2" });
        expect(await answer(server, "ai_move", { move: "e5", plan: "Mirror." })).toMatchObject({ isError: false });
    });

    it("drops a note on a position that is no longer the game's", async () => {
        vi.stubEnv("CLAUDE_CODE_SESSION_ID", "chat-1");
        const context = gameWith("black");
        const server = await connect(context);
        await server.callTool({ name: "status", arguments: {} });

        expect(await prompt(context, "e4", "chat-9")).toBeDefined();
        await play(context, "ai_move", { move: "e5", plan: "Elsewhere." });
        await server.callTool({ name: "status", arguments: {} });
        expect(existsSync(join(context.folder, noteFile))).toBe(false);
    });
});

describe("the board page after a move the hook played", () => {
    it("rings no doorbell, and the AI's clock runs from the move while the chat's hook waits", async () => {
        const base = gameWith("black", "5+0");
        let seconds = 0;
        const page = await startPage({ ...base, now: () => new Date(start.getTime() + seconds * 1000) });
        pages.push(page);
        const port = Number(new URL(page.url).port);
        const game = async () => JSON.parse(await ask(page, "GET", "/api/game")) as { listening: boolean; game: { clock: { since: string; }; }; };
        const heard = waitForBell(JSON.stringify({ cwd: base.folder }), [port]);
        await vi.waitFor(async () => expect((await game()).listening).toBe(true));

        seconds = 30;
        expect(await prompt(at(base, 30), "e4")).toBeDefined();
        seconds = 40;

        expect(await Promise.race([heard, new Promise((done) => setTimeout(() => done("waiting"), 300))])).toBe("waiting");
        expect(await game()).toMatchObject({ listening: true, game: { clock: { since: new Date(start.getTime() + 30_000).toISOString() } } });
    });
});

describe("Claude Code's settings", () => {
    it("get the prompt hook once, beside the player's own", () => {
        const folder = temporary();
        mkdirSync(join(folder, ".claude"));
        const own = { type: "command", command: "my-check" };
        writeFileSync(join(folder, ".claude", "settings.json"), JSON.stringify({ hooks: { UserPromptSubmit: [{ hooks: [own] }] } }));
        setUpHosts(folder, "linux");
        setUpHosts(folder, "linux");
        const settings = JSON.parse(readFileSync(join(folder, ".claude", "settings.json"), "utf8")) as { hooks: Record<string, { hooks: object[]; }[]>; };

        expect(settings.hooks.UserPromptSubmit).toEqual([{ hooks: [own] }, { hooks: [{ type: "command", command: "chesspal prompt", timeout: 10 }] }]);
        expect(readFileSync(join(folder, ".codex", "hooks.json"), "utf8")).not.toContain("UserPromptSubmit");
    });
});

/** The hook's answer to a prompt in the chat's folder, with its session: a process of its own, which has given the chat nothing. */
function prompt(context: Context, text: string, session = "chat-1"): Promise<string | undefined>
{
    return promptAnswer(
        JSON.stringify({ session_id: session, transcript_path: "chat.jsonl", cwd: context.folder, permission_mode: "default", hook_event_name: "UserPromptSubmit", prompt: text }),
        async () => ({ ...context, host: () => "claude-code", given: new Set<string>(), heard: undefined }),
    );
}

/** A game in a folder of its own, the AI with the colour given, with the clocks running from the start when it has a time control. */
function gameWith(ai: string, clock?: string, from?: string): Context
{
    const context: Context = { ...testContext(temporary(), 0, start), pageOpen: () => false };
    const newGame = commands.find((command) => command.name === "new_game")!;
    newGame.run(newGame.input.parse({ ai_colour: ai, ...(clock === undefined ? {} : { clock }), ...(from === undefined ? {} : { from }) }), context);
    return context;
}

function at(context: Context, seconds: number): Context
{
    return { ...context, now: () => new Date(start.getTime() + seconds * 1000) };
}

async function play(context: Context, name: string, input: Record<string, unknown>): Promise<void>
{
    const command = commands.find((each) => each.name === name)!;
    await command.run(command.input.parse(input), context);
}

async function connect(context: Context): Promise<Client>
{
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await createMcpServer({ ...context }).connect(serverTransport);
    client = new Client({ name: "claude-code", version: "2.1.323" });
    await client.connect(clientTransport);
    return client;
}

async function answer(server: Client, name: string, args: Record<string, unknown>): Promise<{ text: string; isError: boolean; }>
{
    const result = await server.callTool({ name, arguments: args });
    return { text: (result.content as { text: string; }[])[0]?.text ?? "", isError: result.isError === true };
}

/** What the page answers, on a connection of its own: the page closes at the end of the test. */
function ask(page: Page, method: string, path: string, body?: unknown): Promise<string>
{
    const url = new URL(path, page.url);
    return new Promise((done, fail) => {
        const sent = request({ host: url.hostname, port: url.port, path, method, agent: false, headers: { "content-type": "application/json" } }, (response) => {
            let text = "";
            response.setEncoding("utf8");
            response.on("data", (chunk: string) => text += chunk);
            response.on("end", () => done(text));
        });
        sent.on("error", fail);
        sent.end(body === undefined ? undefined : JSON.stringify(body));
    });
}

function gameFile(context: Context): { pgn: string; clock?: Record<string, unknown>; }
{
    return JSON.parse(readFileSync(join(gameFolder(context.home()), "game.json"), "utf8")) as never;
}

function temporary(): string
{
    const folder = mkdtempSync(join(tmpdir(), "chesspal-prompt-"));
    folders.push(folder);
    return folder;
}
