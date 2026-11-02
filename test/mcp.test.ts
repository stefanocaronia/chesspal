import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import { type AnyCommand, commands, version } from "chesspal";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createMcpServer, serverInstructions } from "../src/server/mcp.ts";
import { play, testContext } from "./commands.ts";

let client: Client | undefined;

async function connect(list: AnyCommand[] = commands): Promise<Client>
{
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await createMcpServer(testContext(), list).connect(serverTransport);
    client = new Client({ name: "test", version: "1.0.0" });
    await client.connect(clientTransport);
    return client;
}

async function call(name: string, args: Record<string, unknown>, list?: AnyCommand[]): Promise<{ text: string; isError: boolean; }>
{
    const result = await (await connect(list)).callTool({ name, arguments: args });
    return { text: (result.content as { text: string; }[])[0]?.text ?? "", isError: result.isError === true };
}

describe("the MCP server", () => {
    afterEach(async () => {
        await client?.close();
    });

    it("offers every command as a tool, with its description", async () => {
        const { tools } = await (await connect()).listTools();

        expect(tools.map((tool) => tool.name)).toEqual(commands.map((command) => command.name));
        expect(tools[0]?.description).toBe(commands[0]?.description);
    });

    it("sends the host to status, keeps the board out of the AI's head, and loads status at once", async () => {
        const { tools } = await (await connect()).listTools();
        const status = tools.find((tool) => tool.name === "status");

        expect(client?.getInstructions()).toBe(serverInstructions);
        expect(serverInstructions.length).toBeLessThan(512);
        expect(serverInstructions).toContain("Every move goes through Chesspal's tools");
        expect(status?._meta?.["anthropic/alwaysLoad"]).toBe(true);
    });

    it("states every hint, since a missing one reads as the worst case", async () => {
        const { tools } = await (await connect([...commands, play])).listTools();

        expect(tools.find((tool) => tool.name === "status")?.annotations).toEqual({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
        expect(tools.find((tool) => tool.name === "play")?.annotations).toEqual({ readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false });
    });

    it("runs a tool and answers with its text", async () => {
        expect(await call("status", {})).toEqual({
            text: `Chesspal ${version}. Folder: /the/player\nNo game.\nNext: ask the player which colour they want, then call new_game.`,
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
    const server = spawn(process.execPath, ["--experimental-strip-types", "--no-warnings", file, ...args], { stdio: ["pipe", "pipe", "pipe"], cwd: folder });
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
        server.send(tool(2, "new_game", { ai_colour: "black" }), tool(3, "player_move", { move: "e4" }));
        server.close();

        try {
            expect(await server.exited, `stderr: ${server.output.stderr}`).toBe(0);
            expect(server.lines().find((line) => line.id === 3)?.result).toMatchObject({ content: [{ type: "text", text: expect.stringMatching(/^Player: 1\.e4 \(e2-e4\)\./) }] });
            expect(server.lines().find((line) => line.id === 3)?.result?.isError).toBeUndefined();
            expect((JSON.parse(readFileSync(join(folder, "game.json"), "utf8")) as { pgn: string; }).pgn).toContain("1. e4 *");
        } finally {
            rmSync(folder, { recursive: true, force: true });
        }
    }, 20_000);
});
