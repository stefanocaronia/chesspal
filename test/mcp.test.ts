import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import { type AnyCommand, commands, version } from "chesspal";
import { spawn } from "node:child_process";
import { appendFileSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Context } from "../src/commands/context.ts";
import { aiModelIn, readPgn } from "../src/core/index.ts";
import { aiModelOf, saveChatStart } from "../src/games/index.ts";
import { gameFolder, profileFolder } from "../src/profiles/index.ts";
import { createMcpServer, opponentOf, serverInstructions } from "../src/server/mcp.ts";
import { play, testContext } from "./commands.ts";

let client: Client | undefined;

async function connect(list: AnyCommand[] = commands, context = testContext()): Promise<Client>
{
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await createMcpServer(context, list).connect(serverTransport);
    client = new Client({ name: "test", version: "1.0.0" });
    await client.connect(clientTransport);
    return client;
}

async function call(name: string, args: Record<string, unknown>, list?: AnyCommand[], context?: Context): Promise<{ text: string; isError: boolean; }>
{
    const result = await (await connect(list, context)).callTool({ name, arguments: args });
    return { text: (result.content as { text: string; }[])[0]?.text ?? "", isError: result.isError === true };
}

describe("the MCP server", () => {
    afterEach(async () => {
        await client?.close();
    });

    it("offers every command as a tool, with its description, but those of the command line alone", async () => {
        const { tools } = await (await connect()).listTools();
        const offered = commands.filter((command) => command.cliOnly !== true && command.host === undefined);

        expect(tools.map((tool) => tool.name)).toEqual(offered.map((command) => command.name));
        expect(tools[0]?.description).toBe(offered[0]?.description);
        expect(tools.map((tool) => tool.name)).not.toContain("init");
    });

    it("offers a host's own tool to that host alone: ponder to Claude Code (D-72)", async () => {
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await createMcpServer(testContext()).connect(serverTransport);
        client = new Client({ name: "claude-code", version: "2.1.316" });
        await client.connect(clientTransport);
        const { tools } = await client.listTools();

        expect(tools.map((tool) => tool.name)).toContain("ponder");
        expect((await (await connect()).listTools()).tools.map((tool) => tool.name)).not.toContain("ponder");
    });

    it("sends the host to status, keeps the board out of the AI's head, and loads status at once", async () => {
        const { tools } = await (await connect()).listTools();
        const status = tools.find((tool) => tool.name === "status");

        expect(client?.getInstructions()).toBe(serverInstructions);
        expect(serverInstructions.length).toBeLessThan(512);
        expect(serverInstructions).toContain("Every move goes through Chesspal's tools");
        expect(status?._meta?.["anthropic/alwaysLoad"]).toBe(true);
    });

    it("records what the chat has read after its own calls, not after an agent's, so that the doorbell still rings the player's move (D-72)", async () => {
        const context = testContext(mkdtempSync(join(tmpdir(), "chesspal-")));
        const agent = { ...play, name: "agent_play", byAgent: true };
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await createMcpServer(context, [play, agent]).connect(serverTransport);
        client = new Client({ name: "test", version: "1.0.0" });
        await client.connect(clientTransport);

        await client.callTool({ name: "agent_play", arguments: { san: "e4" } });

        expect(context.seen).toBeUndefined();

        await client.callTool({ name: "play", arguments: { san: "e4" } });

        expect(context.seen).toBeDefined();
        rmSync(context.folder, { recursive: true, force: true });
    });

    it("notes the AI's model after its move has gone back, keeps the last one known, and writes it into the game's PGN at the end (D-82)", async () => {
        const context = testContext(mkdtempSync(join(tmpdir(), "chesspal-")));
        const heard = vi.fn();
        context.heard = heard;
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await createMcpServer(context).connect(serverTransport);
        client = new Client({ name: "test", version: "1.0.0" });
        await client.connect(clientTransport);
        const codex = (model: string, effort: string) => ({ "x-codex-turn-metadata": { model, reasoning_effort: effort } });
        const folder = gameFolder(context.home());

        await client.callTool({ name: "new_game", arguments: { ai_colour: "white" } });
        await client.callTool({ name: "ai_move", arguments: { move: "e4", plan: "Take the centre." }, _meta: codex("gpt-6-luna", "low") });
        await vi.waitFor(() => expect(aiModelOf(folder)).toEqual({ model: "gpt-6-luna", effort: "low" }));

        expect(heard).toHaveBeenCalledTimes(1);

        await client.callTool({ name: "player_move", arguments: { move: "e5" } });
        // A move refused, and a host that ties no model to the call, leave the model known.
        await client.callTool({ name: "ai_move", arguments: { move: "Ke3", plan: "None." }, _meta: codex("gpt-6-sol", "high") });
        await client.callTool({ name: "ai_move", arguments: { move: "Nf3", plan: "Develop." } });
        await new Promise((done) => setTimeout(done, 20));

        expect(aiModelOf(folder)).toEqual({ model: "gpt-6-luna", effort: "low" });

        await client.callTool({ name: "end_game", arguments: { result: "player_resigns" } });
        const [archived] = readdirSync(join(folder, "games"));

        const pgn = readFileSync(join(folder, "games", archived!), "utf8");

        expect(pgn).toContain('[AIModel "gpt-6-luna"]\n[AIEffort "low"]');
        // The page's analysis reads it back, for the AI's card.
        expect(aiModelIn(readPgn(pgn)[0]!)).toEqual({ model: "gpt-6-luna", effort: "low" });
        rmSync(context.folder, { recursive: true, force: true });
    });

    it("answers the AI's move before Claude Code writes its line, and notes the model once it is there (D-82)", async () => {
        const context = testContext(mkdtempSync(join(tmpdir(), "chesspal-")));
        const transcript = join(context.folder, "session.jsonl");
        writeFileSync(transcript, "");
        saveChatStart(context.folder, { source: "startup", at: "2026-11-06T10:00:00.000Z", transcript });
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await createMcpServer(context).connect(serverTransport);
        client = new Client({ name: "test", version: "1.0.0" });
        await client.connect(clientTransport);
        const folder = gameFolder(context.home());

        await client.callTool({ name: "new_game", arguments: { ai_colour: "white" } });
        const played = await client.callTool({ name: "ai_move", arguments: { move: "e4", plan: "Take the centre." }, _meta: { "claudecode/toolUseId": "toolu_1" } });

        expect(played.isError).not.toBe(true);
        expect(aiModelOf(folder)).toBeUndefined();

        const call = { type: "tool_use", id: "toolu_1", name: "mcp__chesspal__ai_move" };
        appendFileSync(transcript, `${JSON.stringify({ type: "assistant", message: { model: "claude-opus-5-5", content: [call] }, effort: "xhigh" })}\n`);
        await vi.waitFor(() => expect(aiModelOf(folder)).toEqual({ model: "claude-opus-5-5", effort: "xhigh" }));
        rmSync(context.folder, { recursive: true, force: true });
    });

    it("names the opponent on the page after the host: Claude, Codex, or no name", () => {
        expect(opponentOf("claude-code")).toBe("Claude");
        expect(opponentOf("codex-mcp-client")).toBe("Codex");
        expect(opponentOf("gemini-cli-mcp-client")).toBeUndefined();
        expect(opponentOf(undefined)).toBeUndefined();
    });

    it("states every hint, since a missing one reads as the worst case", async () => {
        const { tools } = await (await connect([...commands, play])).listTools();

        expect(tools.find((tool) => tool.name === "status")?.annotations).toEqual({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
        expect(tools.find((tool) => tool.name === "play")?.annotations).toEqual({ readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false });
    });

    it("runs a tool and answers with its text", async () => {
        const context = testContext(mkdtempSync(join(tmpdir(), "chesspal-")));
        const answer = await call("status", {}, undefined, context);
        rmSync(context.folder, { recursive: true, force: true });

        expect(answer).toEqual({
            text: `Chesspal ${version}. Folder: ${
                profileFolder(context.folder, "player")
            }\nNo game.\nNext: when the player wants a game, call new_game without choices: it opens the board page's New game window, where the player chooses the colour, the clock and the level. Ask them in the chat, and call new_game with them, only when the player plays without the page.`,
            isError: false,
        });
    });

    it("refuses a wrong input in words an AI can act on, with the parameters the tool takes", async () => {
        expect(await call("status", { colour: "white" })).toEqual({
            text: "status has no parameter colour. Nothing changed: call it again with no parameters.",
            isError: true,
        });
        expect((await call("play", {}, [play])).text).toMatch(/^play needs san\. Nothing changed: call it again with its parameters\.\nplay takes:\n- san: the move, in SAN\n/);
        expect((await call("play", { san: "e4", minutes: "5" }, [play])).text).toMatch(/^minutes: .*expected number, received string\. Nothing changed/);
    });

    it("reads a flag sent as text, as some hosts send it, and shows each input without the draft's address", async () => {
        expect(JSON.parse((await call("play", { san: "e4", flip: "false" }, [play])).text)).toEqual({ san: "e4", flip: false });

        const { tools } = await (await connect()).listTools();

        expect(tools.every((tool) => !("$schema" in tool.inputSchema))).toBe(true);
    });
});

/** A server started as a host starts it, in the player's folder, speaking on its standard input and output. */
function serve(script: string, args: string[] = [], folder?: string)
{
    const file = fileURLToPath(new URL(script, import.meta.url));
    // Its data folder is its own folder, as for a playtest (D-71).
    const env = folder === undefined ? process.env : { ...process.env, CHESSPAL_HOME: folder };
    const server = spawn(process.execPath, ["--experimental-strip-types", "--no-warnings", file, ...args], { stdio: ["pipe", "pipe", "pipe"], cwd: folder, env });
    const output = { stdout: "", stderr: "" };
    let exitCode: number | null | undefined;
    const exited = new Promise<number | null>((done) => server.on("exit", (code) => done(exitCode = code)));
    server.stdout.on("data", (chunk: Buffer) => (output.stdout += String(chunk)));
    server.stderr.on("data", (chunk: Buffer) => (output.stderr += String(chunk)));

    return {
        output,
        exited,
        send: (...messages: object[]): void => void server.stdin.write(messages.map((message) => `${JSON.stringify(message)}\n`).join("")),
        close: (): void => void server.stdin.end(),
        /** Waits for the first answer, or for the server to die: what it wrote on stderr then says why. */
        answered: async (): Promise<void> => {
            const end = Date.now() + 15_000;

            while (!output.stdout.includes("\n") && exitCode === undefined && Date.now() < end) {
                await new Promise((done) => setTimeout(done, 20));
            }

            expect(output.stdout, `stderr: ${output.stderr}`).toContain("\n");
        },
        lines: (): { jsonrpc: string; id?: number; result?: Record<string, unknown>; }[] => output.stdout.split("\n").filter((line) => line !== "").map((line) => JSON.parse(line) as never),
    };
}

const initialize = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: LATEST_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "test", version: "1.0.0" } } };

describe("chesspal mcp", () => {
    it("speaks the protocol alone on stdout, and ends when the host goes", async () => {
        const server = serve("../src/cli/cli.ts", ["mcp"]);
        server.send(initialize);
        await server.answered();
        server.close();

        expect(await server.exited, `stderr: ${server.output.stderr}`).toBe(0);
        expect(server.lines().map((line) => line.jsonrpc)).toEqual(server.lines().map(() => "2.0"));
        expect((server.lines()[0]?.result?.serverInfo as { name: string; }).name).toBe("chesspal");
    }, 20_000);

    it("answers the calls still running before it ends", async () => {
        const server = serve("./slow-server.ts");
        server.send(initialize, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "slow", arguments: {} } });
        await server.answered();
        server.close();

        expect(await server.exited, `stderr: ${server.output.stderr}`).toBe(0);
        expect(server.lines().find((line) => line.id === 2)?.result).toEqual({ content: [{ type: "text", text: "done" }] });
    }, 20_000);

    it("answers and saves the moves the host sent before it went", async () => {
        const folder = mkdtempSync(join(tmpdir(), "chesspal-mcp-"));
        const server = serve("../src/cli/cli.ts", ["mcp"], folder);
        const tool = (id: number, name: string, args: object): object => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });
        server.send(initialize);
        await server.answered();
        server.send(tool(2, "new_game", { ai_colour: "black" }));
        // A chat moves on a game a tool has shown it (D-71): the move comes once the new game has answered.
        await vi.waitFor(() => expect(server.lines().some((line) => line.id === 2)).toBe(true), { timeout: 15_000 });
        server.send(tool(3, "player_move", { move: "e4" }));
        server.close();

        try {
            expect(await server.exited, `stderr: ${server.output.stderr}`).toBe(0);
            expect(server.lines().find((line) => line.id === 3)?.result).toMatchObject({ content: [{ type: "text", text: expect.stringMatching(/^Player: 1\.e4 \(e2-e4\)\./) }] });
            expect(server.lines().find((line) => line.id === 3)?.result?.isError).toBeUndefined();
            expect((JSON.parse(readFileSync(join(gameFolder(folder), "game.json"), "utf8")) as { pgn: string; }).pgn).toContain("1. e4 *");
        } finally {
            rmSync(folder, { recursive: true, force: true });
        }
    }, 20_000);
});
