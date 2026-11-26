import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ReadBuffer, serializeMessage } from "@modelcontextprotocol/sdk/shared/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { type JSONRPCMessage, LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import { commands, version } from "chesspal";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { Context } from "../src/commands/registry/context.ts";
import { defineCommand } from "../src/commands/registry/registry.ts";
import { agentTools, analystAgent, coachAgent, ownModelPonderAgent } from "../src/host-files/index.ts";
import { gameFolder } from "../src/profiles/index.ts";
import { pipeToTable } from "../src/server/door/index.ts";
import { createMcpServer } from "../src/server/mcp/index.ts";
import { type ChatRole, type Place, type PlacesOptions, type TablePlaces, tablePlaces } from "../src/server/places/index.ts";
import { testContext } from "./commands.ts";

const folders: string[] = [];
const opened: TablePlaces[] = [];
const clients: Client[] = [];

afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close()));
    await Promise.all(opened.splice(0).map((places) => places.close()));
    folders.splice(0).forEach((folder) => rmSync(folder, { recursive: true, force: true }));
});

function temporaryFolder(): string
{
    const folder = mkdtempSync(join(tmpdir(), "chesspal-places-"));
    folders.push(folder);
    return folder;
}

const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
// What status says once a chat, until the chat has read the opponent's instructions.
const unread = "Call `instructions` before you answer the player";

function sleep(milliseconds: number): Promise<void>
{
    return new Promise((done) => setTimeout(done, milliseconds));
}

/** The places of a table on a data folder of its own. */
function placesOf(context: Context = testContext(temporaryFolder()), options: PlacesOptions = {}): { places: TablePlaces; context: Context; }
{
    // The door's own folder in the system's temporary folder: on macOS, 49 bytes, a socket file's path is 49 + 16 + 21 = 86 of the 103 it may take.
    const places = tablePlaces(context, { leaveWait: 500, ...options });
    opened.push(places);
    return { places, context };
}

/** A transport over two streams of JSON lines, as a host speaks to `chesspal mcp`. */
function linesTransport(input: PassThrough, output: PassThrough): Transport
{
    const buffer = new ReadBuffer();
    const transport: Transport = {
        start: async () => {
            output.on("data", (chunk: Buffer) => {
                buffer.append(chunk);

                for (let message = buffer.readMessage(); message !== null; message = buffer.readMessage()) {
                    transport.onmessage?.(message);
                }
            });
            output.on("end", () => transport.onclose?.());
        },
        send: async (message: JSONRPCMessage) => {
            input.write(serializeMessage(message));
        },
        close: async () => {
            input.end();
        },
    };
    return transport;
}

/** A host's client at a place, through the door as `chesspal mcp` pipes it: the client, and the pipe's exit code once it ended. */
async function sitAt(place: Place, host = "claude-code"): Promise<{ client: Client; piped: Promise<number>; }>
{
    const input = new PassThrough();
    const output = new PassThrough();
    const piped = pipeToTable(input, output, { door: place.environment.CHESSPAL_TABLE_DOOR!, key: place.environment.CHESSPAL_TABLE_KEY!, version });
    const client = new Client({ name: host, version: "1.0.0" });
    clients.push(client);
    await client.connect(linesTransport(input, output));
    return { client, piped };
}

async function toolsAt(client: Client): Promise<string[]>
{
    return (await client.listTools()).tools.map((tool) => tool.name).sort();
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}): Promise<{ text: string; isError: boolean; }>
{
    const result = await client.callTool({ name, arguments: args });
    return { text: (result.content as { text: string; }[])[0]?.text ?? "", isError: result.isError === true };
}

describe("the places of the chats the table opens", () => {
    it("lists each role's tools alone: the opponent every tool but the agents' own, a helper exactly its agent's", async () => {
        const { places } = placesOf();
        const expected: Record<ChatRole, string[]> = {
            opponent: commands.filter((command) => command.cliOnly !== true && command.byAgents === undefined && command.hosts === undefined).map((command) => command.name),
            ponder: [...agentTools(ownModelPonderAgent)!],
            coach: [...agentTools(coachAgent)!],
            analyst: [...agentTools(analystAgent)!],
        };

        for (const role of ["opponent", "ponder", "coach", "analyst"] as const) {
            const { client } = await sitAt(await places.offer(role, temporaryFolder()));
            expect(await toolsAt(client), role).toEqual(expected[role].sort());
        }

        expect(expected.opponent).not.toContain("ponder");
        expect(expected.opponent).not.toContain("coach");
        expect(expected.opponent).toContain("analyse_game");
    });

    it("gives a helper's place its tools whatever the host, as it stands in for the host's own agent", async () => {
        const { places } = placesOf();

        for (const role of ["ponder", "coach"] as const) {
            const { client } = await sitAt(await places.offer(role, temporaryFolder()), "antigravity-client");
            expect(await toolsAt(client), role).toEqual([role]);
        }
    });

    it("runs the opponent's commands on the table's data folder, where the table reads the game they change", async () => {
        const { places, context } = placesOf();
        const { client } = await sitAt(await places.offer("opponent", temporaryFolder()));

        expect((await call(client, "status")).isError).toBe(false);
        expect(await call(client, "new_game", { ai_colour: "white", from: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" })).toMatchObject({ isError: false });
        expect(await call(client, "ai_move", { move: "e4", plan: "The centre." })).toMatchObject({ isError: false });

        const game = JSON.parse(readFileSync(join(gameFolder(context.home()), "game.json"), "utf8")) as { pgn: string; };
        expect(game.pgn).toContain("1. e4 {[%plan The centre.]} *");
    });

    it("keeps each place's own state: two places at once share no position seen, and a helper's calls are not the chat's", async () => {
        const { places } = placesOf();
        const toolEnded = { first: 0, second: 0, ponder: 0 };
        const first = await sitAt(await places.offer("opponent", temporaryFolder(), { toolEnded: () => void toolEnded.first++ }));
        const second = await sitAt(await places.offer("opponent", temporaryFolder(), { toolEnded: () => void toolEnded.second++ }));
        const ponder = await sitAt(await places.offer("ponder", temporaryFolder(), { toolEnded: () => void toolEnded.ponder++ }));

        await call(first.client, "new_game", { ai_colour: "white", from: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" });
        // The second chat has seen no position: its move is refused, with the game as it is now.
        const unseen = await call(second.client, "ai_move", { move: "e4", plan: "The centre." });
        expect(unseen.isError).toBe(true);
        expect(await call(first.client, "ai_move", { move: "d4", plan: "The centre." })).toMatchObject({ isError: false });

        // The ponderer's calls are an agent's, not the chat's: they leave the chat's record alone.
        expect(await call(ponder.client, "ponder")).toMatchObject({ isError: false });
        expect(toolEnded.ponder).toBe(0);
        expect(toolEnded.first).toBeGreaterThan(0);
        expect(toolEnded.second).toBeGreaterThan(0);
    });

    it("keeps a place's state across its server's reconnection, sends it away once withdrawn, and settles left", async () => {
        const { places } = placesOf();
        const place = await places.offer("opponent", temporaryFolder());
        const first = await sitAt(place);
        await call(first.client, "new_game", { ai_colour: "white", from: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" });
        await first.client.close();
        expect(await first.piped).toBe(0);

        // The position the place's chat saw before is still its own: its move goes, with no status between.
        const again = await sitAt(place);
        expect(await call(again.client, "ai_move", { move: "e4", plan: "The centre." })).toMatchObject({ isError: false });

        place.withdraw();
        await place.left;
        expect(await again.piped).toBe(1);
    });

    it("tells each place once to call instructions, apart from the other places and the table's own context, and not again after a reconnection", async () => {
        // A table whose own context keeps what it told, as the page's may: a place that shared it would hear nothing.
        const { places } = placesOf({ ...testContext(temporaryFolder()), told: new Set() });
        const place = await places.offer("opponent", temporaryFolder());
        const first = await sitAt(place);
        const other = await sitAt(await places.offer("opponent", temporaryFolder()));

        expect((await call(first.client, "status")).text).toContain(unread);
        await call(first.client, "instructions");
        expect((await call(first.client, "status")).text).not.toContain(unread);
        expect((await call(other.client, "status")).text).toContain(unread);

        await first.client.close();
        await first.piped;
        const again = await sitAt(place);
        expect((await call(again.client, "status")).text).not.toContain(unread);
    });

    it("gives the player's words once to each place", async () => {
        const { places, context } = placesOf();
        const first = await sitAt(await places.offer("opponent", temporaryFolder()));
        const other = await sitAt(await places.offer("opponent", temporaryFolder()));
        await call(first.client, "new_game", { ai_colour: "black", from: start });
        await call(other.client, "status");
        await commands.find((command) => command.name === "player_say")!.run({ text: "Play faster, please." }, context);

        expect((await call(first.client, "look")).text).toContain("Play faster, please.");
        expect((await call(first.client, "look")).text).not.toContain("Play faster, please.");
        expect((await call(other.client, "look")).text).toContain("Play faster, please.");
    });

    it("runs the commands in the chat's own folder, where they read the host's files, not in the table's", async () => {
        const { places } = placesOf();
        const withAgent = temporaryFolder();
        mkdirSync(join(withAgent, ".claude", "agents"), { recursive: true });
        writeFileSync(join(withAgent, ".claude", "agents", "chesspal-ponder.md"), "---\nname: chesspal-ponder\n---\n");

        const moved = async (folder: string): Promise<string> => {
            const { client } = await sitAt(await places.offer("opponent", folder));
            await call(client, "new_game", { ai_colour: "white", from: start });
            return (await call(client, "ai_move", { move: "e4", plan: "The centre." })).text;
        };

        expect(await moved(withAgent)).toContain("start the chesspal-ponder agent");
        expect(await moved(temporaryFolder())).not.toContain("chesspal-ponder");
    });

    it("serves a server that comes back at once, while a long call of the earlier one still runs", async () => {
        const { places } = placesOf(undefined, { leaveWait: 3_000 });
        const place = await places.offer("opponent", temporaryFolder(), { calls: () => sleep(1_500) });
        const first = await sitAt(place);
        void call(first.client, "status").catch(() => undefined);
        await sleep(50);
        await first.client.close();
        expect(await first.piped).toBe(0);

        const started = Date.now();
        await sitAt(place);
        expect(Date.now() - started).toBeLessThan(1_000);
    });

    it("seats a third server after a second came and went, while a long call of the first still runs", async () => {
        const { places } = placesOf(undefined, { leaveWait: 3_000 });
        const place = await places.offer("opponent", temporaryFolder(), { calls: () => sleep(1_500) });
        const first = await sitAt(place);
        void call(first.client, "status").catch(() => undefined);
        await sleep(50);
        await first.client.close();
        await first.piped;

        const input = new PassThrough();
        const second = pipeToTable(input, new PassThrough(), { door: place.environment.CHESSPAL_TABLE_DOOR!, key: place.environment.CHESSPAL_TABLE_KEY!, version });
        input.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} })}\n`);
        await sleep(100);
        input.end();
        expect(await second).toBe(0);

        const started = Date.now();
        const third = await sitAt(place);
        expect(Date.now() - started).toBeLessThan(1_000);
        expect(await call(third.client, "instructions")).toMatchObject({ isError: false });
    });

    it("opens no door for an offer after close, and refuses it", async () => {
        const servers = (): number => (process as unknown as { _getActiveHandles(): { constructor: { name: string; }; }[]; })._getActiveHandles().filter((handle) => handle.constructor.name === "Server").length;
        const before = servers();
        const { places } = placesOf();
        await places.close();

        await expect(places.offer("opponent", temporaryFolder())).rejects.toThrow("The table is closing, and opens no more chats");
        expect(servers()).toBe(before);
    });

    it("tries a door that could not open again at the next offer, and closes all the same", async () => {
        // A short folder of its own: on macOS 49 + 10 + 2 + 16 + 21 = 98 bytes for the socket file's path, of the 103 it may take.
        const own = mkdtempSync(join(tmpdir(), "cp-"));
        folders.push(own);
        const missing = join(own, "m");
        const places = tablePlaces(testContext(temporaryFolder()), { platform: "linux", socketFolder: missing });
        opened.push(places);
        const first = await places.offer("opponent", temporaryFolder()).then(() => "offered", (error: Error) => error.message);
        expect(first).toMatch(/^Chesspal's table could not open its door for the chats it opens at .*ENOENT.*: start the table again\.$/);

        // Its folder made, the door opens off Windows; on Windows a socket file cannot listen, and the next offer says so for itself.
        mkdirSync(missing);
        const second = await places.offer("opponent", temporaryFolder()).then(() => "offered", (error: Error) => error.message);
        expect(second).not.toBe(first);

        if (process.platform !== "win32") {
            expect(second).toBe("offered");
        }

        await expect(places.close()).resolves.toBeUndefined();
    });
});

describe("a seat of the table's in the MCP server", () => {
    // A tool that says who the command ran for.
    const who = defineCommand({
        name: "who",
        description: "Says who calls.",
        input: z.object({}),
        run: (_input, context) => ({ agent: context.agent, run: context.agentRun, chat: context.chat }),
        format: (result) => JSON.stringify(result),
    });
    const own = defineCommand({ ...who, name: "own", byAgents: ["chesspal-coach"] });

    async function seated(seat: Parameters<typeof createMcpServer>[3]): Promise<Client>
    {
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await createMcpServer(testContext(temporaryFolder()), [who, own], undefined, seat).connect(serverTransport);
        const client = new Client({ name: "test", version: "1.0.0" });
        clients.push(client);
        await client.connect(clientTransport);
        return client;
    }

    it("runs every call as the seat's agent and run, or as the chat's, never looked up, and refuses an agent's tool to another", async () => {
        const coach = await seated({ agent: "chesspal-coach", run: "run-1" });
        expect(JSON.parse((await call(coach, "who")).text)).toEqual({ agent: "chesspal-coach", run: "run-1" });
        expect(JSON.parse((await call(coach, "own")).text)).toEqual({ agent: "chesspal-coach", run: "run-1" });

        const chat = await seated({});
        expect(JSON.parse((await call(chat, "who")).text)).toEqual({ chat: true });
        expect(await call(chat, "own")).toEqual({ text: "own is not yours to call: the player reads what it gives on the board page. Nothing changed.", isError: true });

        const analyst = await seated({ agent: "chesspal-analyst" });
        expect((await call(analyst, "own")).isError).toBe(true);
    });
});

describe("chesspal mcp in a chat the table opened", () => {
    const initialize = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: LATEST_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "test", version: "1.0.0" } } };
    const cli = fileURLToPath(new URL("../src/cli/cli.ts", import.meta.url));
    // Says on stderr each module of the MCP SDK, the server or the commands that the process loads.
    const hook =
        "data:text/javascript,import{registerHooks}from'node:module';registerHooks({resolve(s,c,n){const r=n(s,c);if(/modelcontextprotocol|server\\/mcp\\/|\\/commands\\//.test(r.url))process.stderr.write('loaded '+r.url+'\\n');return r;}});";

    function chesspalMcp(environment: Record<string, string>): { out: () => string; err: () => string; exited: Promise<number | null>; send: (message: object) => void; end: () => void; }
    {
        const child = spawn(process.execPath, ["--experimental-strip-types", "--no-warnings", "--import", hook, cli, "mcp"], { cwd: temporaryFolder(), env: { ...process.env, ...environment } });
        let out = "";
        let err = "";
        child.stdout.setEncoding("utf8").on("data", (chunk: string) => (out += chunk));
        child.stderr.setEncoding("utf8").on("data", (chunk: string) => (err += chunk));
        return {
            out: () => out,
            err: () => err,
            exited: new Promise((done) => child.on("exit", done)),
            send: (message) => void child.stdin.write(`${JSON.stringify(message)}\n`),
            end: () => void child.stdin.end(),
        };
    }

    it("pipes to its place at the table without loading the MCP SDK, the server or the commands", async () => {
        const { places } = placesOf();
        const place = await places.offer("opponent", temporaryFolder());
        const chat = chesspalMcp(place.environment);
        chat.send(initialize);
        await vi.waitFor(() => expect(chat.out(), chat.err()).toContain('"id":1'), { timeout: 15_000 });
        chat.send({ jsonrpc: "2.0", method: "notifications/initialized" });
        chat.send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "status", arguments: {} } });
        await vi.waitFor(() => expect(chat.out()).toContain('"id":2'), { timeout: 15_000 });
        chat.end();

        expect(await chat.exited).toBe(0);
        expect(chat.out()).toContain('"name":"chesspal"');
        expect(chat.err()).not.toContain("loaded");
    }, 30_000);

    it("says why and exits with 1, serving nothing itself, when its table is gone", async () => {
        const { places } = placesOf();
        const place = await places.offer("opponent", temporaryFolder());
        await places.close();
        const chat = chesspalMcp(place.environment);
        chat.send(initialize);

        expect(await chat.exited).toBe(1);
        expect(chat.out()).toBe("");
        expect(chat.err()).toContain("chesspal mcp: Chesspal's table, which opened this chat, is not there any more: open the chat again from the board page.");
        expect(chat.err()).not.toContain("loaded");
    }, 30_000);

    it("sits when the host starts its server again at once, the earlier one's input just closed", async () => {
        const { places } = placesOf();
        const place = await places.offer("opponent", temporaryFolder());
        const old = chesspalMcp(place.environment);
        old.send(initialize);
        await vi.waitFor(() => expect(old.out(), old.err()).toContain('"id":1'), { timeout: 15_000 });

        old.end();
        const fresh = chesspalMcp(place.environment);
        fresh.send(initialize);
        await vi.waitFor(() => expect(fresh.out(), fresh.err()).toContain('"id":1'), { timeout: 15_000 });
        fresh.end();

        expect(await old.exited).toBe(0);
        expect(await fresh.exited).toBe(0);
        expect(fresh.err()).toBe("");
    }, 30_000);

    it("with one of the two variables alone, says which is missing and exits with 1, never serving the chat itself", async () => {
        const { places } = placesOf();
        const place = await places.offer("opponent", temporaryFolder());

        for (const [variable, other] of [["CHESSPAL_TABLE_DOOR", "CHESSPAL_TABLE_KEY"], ["CHESSPAL_TABLE_KEY", "CHESSPAL_TABLE_DOOR"]] as const) {
            const chat = chesspalMcp({ [variable]: place.environment[variable]!, [other]: "" });
            chat.send(initialize);

            expect(await chat.exited).toBe(1);
            expect(chat.out()).toBe("");
            expect(chat.err()).toContain(`chesspal mcp: ${other} is missing beside ${variable}, which the table sets together for a chat it opens: open the chat again from the board page.`);
            expect(chat.err()).not.toContain("loaded");
        }
    }, 30_000);
});
