// A host's client at a place of the table, for the tests and the demo whose fake chats play through their place as a real one does.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { ReadBuffer, serializeMessage } from "@modelcontextprotocol/sdk/shared/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { PassThrough } from "node:stream";
import { doorVariable, keyVariable, pipeToTable } from "../src/server/door/index.ts";
import { version } from "../src/version.ts";

/**
 * A client of the MCP SDK at the place the environment names, through the door, as `chesspal mcp` pipes it; `made` takes it before it connects, for who
 * closes it after.
 */
export async function sitAt(environment: Record<string, string>, made: (client: Client) => void = () => undefined, name = "claude-code"): Promise<Client>
{
    const input = new PassThrough();
    const output = new PassThrough();
    void pipeToTable(input, output, { door: environment[doorVariable]!, key: environment[keyVariable]!, version });
    const client = new Client({ name, version: "1.0.0" });
    made(client);
    await client.connect(linesTransport(input, output));
    return client;
}

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
