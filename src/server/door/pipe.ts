// The `chesspal mcp` of a chat the table opened: it only passes the host's lines to the table, which runs the chat's commands, and the table's back. It
// never serves the commands itself: where the table is not there, is slow or refuses, it says why and ends.
import type { Socket } from "node:net";
import type { Readable, Writable } from "node:stream";
import { version as ownVersion } from "../../version.ts";
import { firstLine, helloLine, mostHello, readAnswer, type Refusal } from "./hello.ts";
import { doorVariable, keyVariable, knock } from "./socket.ts";

export interface PipeOptions
{
    /** The door to knock at, as the chat's environment names it. */
    door: string;
    /** The key the table made for this chat. */
    key: string;
    version: string;
    /** How long the table may take to let the chat sit, in ms: about a second. */
    wait?: number;
    now?: () => number;
    /** What went wrong, a line for the host's log of the server's stderr. */
    log?: (line: string) => void;
}

/** What the host's requests still waiting hear, and its log, when the table ends before the chat. */
export const tableEnded = "Chesspal's table ended, and with it the commands of this chat, which it opened: open the chat again from the board page.";

// After the host's input ended, how long the table may take to close its side.
const closeWait = 2_000;

/**
 * `chesspal mcp` in a chat the table opened, as its environment says: the exit code once either side ended, as pipeToTable gives it; undefined, with the
 * input untouched, in a chat the table did not open, which serves its commands as always.
 */
export async function pipeHere(input: Readable, output: Writable, environment: Record<string, string | undefined>): Promise<number | undefined>
{
    const door = environment[doorVariable];
    const key = environment[keyVariable];

    if (door === undefined || door === "" || key === undefined || key === "") {
        return undefined;
    }

    return await pipeToTable(input, output, { door, key, version: ownVersion, log: (line) => process.stderr.write(`${line}\n`) });
}

/**
 * Pipes a chat's input to the table at the door and the table's answers to `output`: 0 once the host's input ended first, 1 once the table did. Where the
 * table is not there, does not answer within `wait` or refuses the chat, it logs why and gives 1 at once, the input untouched.
 */
export async function pipeToTable(input: Readable, output: Writable, options: PipeOptions): Promise<number>
{
    const log = options.log ?? (() => undefined);
    const wait = options.wait ?? 1_000;
    const now = options.now ?? Date.now;
    const started = now();
    const knocked = await knock(options.door, wait);

    if (knocked === "nobody" || knocked === "slow") {
        log(`chesspal mcp: ${knocked === "nobody" ? noTable : slowTable}`);
        return 1;
    }

    knocked.on("error", () => undefined);
    knocked.write(helloLine({ key: options.key, version: options.version }));
    const first = await firstLine(knocked, Math.max(1, wait - (now() - started)), mostHello);
    const answer = first === undefined ? undefined : readAnswer(first.line);

    if (first !== undefined && answer !== undefined && "ok" in answer) {
        return await piped(knocked, first.rest, input, output, log);
    }

    knocked.destroy();
    log(`chesspal mcp: ${answer !== undefined && "refused" in answer ? refusedWhy[answer.refused] : slowTable}`);
    return 1;
}

const again = "open the chat again from the board page.";
const noTable = `Chesspal's table, which opened this chat, is not there any more: ${again}`;
const slowTable = `Chesspal's table, which opened this chat, did not answer within a second: ${again}`;
const refusedWhy: Readonly<Record<Refusal, string>> = {
    key: `Chesspal's table no longer knows this chat, which it closed: ${again}`,
    version: `Chesspal's table runs another version than this chat's server, as after an update: ${again}`,
    busy: `Chesspal's table already serves this chat through another server: close this one, or ${again}`,
    ending: `Chesspal's table is closing: ${again}`,
};

/**
 * The host's lines to the table and the table's back, until the table closes, or the host's input ends and the table closes after it: 0 then. A table
 * that closes first leaves each request of the host still waiting answered with an error that says what to do: 1 then.
 */
function piped(socket: Socket, rest: Buffer, input: Readable, output: Writable, log: (line: string) => void): Promise<number>
{
    return new Promise((done) => {
        // The host's requests the table has not answered yet, by their id as JSON.
        const waiting = new Map<string, unknown>();
        let inputEnded = false;
        let closing: NodeJS.Timeout | undefined;

        const fromHost = lineReader((line) => {
            const message = parsed(line);

            if (message?.method !== undefined && message.id !== undefined) {
                waiting.set(JSON.stringify(message.id), message.id);
            }
        });

        const fromTable = lineReader((line) => {
            const message = parsed(line);

            if (message?.method === undefined && message?.id !== undefined) {
                waiting.delete(JSON.stringify(message.id));
            }
        });

        const finish = (): void => {
            clearTimeout(closing);
            input.off("data", fromHost);
            input.unpipe(socket);
            socket.destroy();

            if (inputEnded) {
                done(0);
                return;
            }

            for (const id of waiting.values()) {
                output.write(`${JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32603, message: tableEnded } })}\n`);
            }

            log(`chesspal mcp: ${tableEnded}`);
            done(1);
        };

        // The table closes its side once the host's input ended; at worst after a moment.
        const ended = (): void => {
            inputEnded = true;
            socket.end();
            closing ??= setTimeout(finish, closeWait);
        };

        if (rest.length > 0) {
            fromTable(rest);
            output.write(rest);
        }

        socket.once("close", finish);
        socket.on("data", fromTable);
        socket.pipe(output, { end: false });
        input.once("end", ended);
        input.once("close", ended);
        input.on("data", fromHost);
        input.pipe(socket, { end: false });
    });
}

/** Gives each whole line of a stream's chunks to `line`, as its chunks come. */
function lineReader(line: (text: string) => void): (chunk: Buffer) => void
{
    let pieces: Buffer[] = [];

    return (chunk) => {
        let start = 0;
        let end = chunk.indexOf(0x0a);

        while (end !== -1) {
            line(Buffer.concat([...pieces, chunk.subarray(start, end)]).toString("utf8"));
            pieces = [];
            start = end + 1;
            end = chunk.indexOf(0x0a, start);
        }

        if (start < chunk.length) {
            pieces.push(chunk.subarray(start));
        }
    };
}

function parsed(line: string): { method?: unknown; id?: unknown; } | undefined
{
    try {
        const message = JSON.parse(line) as unknown;
        return typeof message === "object" && message !== null ? message as { method?: unknown; id?: unknown; } : undefined;
    } catch {
        return undefined;
    }
}
