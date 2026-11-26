// What a chat the table opened and the table say first, a JSON line each: the chat's key and version, and the table's answer. After a yes the socket
// carries the chat's MCP conversation.
import type { Socket } from "node:net";

/** A chat's hello: the key the table made for it, and the version of its Chesspal. */
export interface Hello
{
    key: string;
    version: string;
}

/** Why the table does not let a chat sit: a key it does not know, another version, the same key already sitting, or the table closing. */
export type Refusal = "key" | "version" | "busy" | "ending";

/** The table's answer: the chat sits, or why not; after a refusal the socket closes. */
export type HelloAnswer = { ok: true; } | { refused: Refusal; };

/** A hello or its answer is one short line: anything longer is no hello. */
export const mostHello = 1024;

export function helloLine(hello: Hello): string
{
    return `${JSON.stringify({ key: hello.key, version: hello.version })}\n`;
}

/** A hello as a chat says it; undefined for anything else, as noise or a browser's request. */
export function readHello(line: string): Hello | undefined
{
    const read = parsed(line) as Partial<Hello> | undefined;
    return typeof read?.key === "string" && typeof read.version === "string" ? { key: read.key, version: read.version } : undefined;
}

export function answerLine(answer: HelloAnswer): string
{
    return `${JSON.stringify(answer)}\n`;
}

/** The table's answer as it says it; undefined for anything else. */
export function readAnswer(line: string): HelloAnswer | undefined
{
    const read = parsed(line) as { ok?: unknown; refused?: unknown; } | undefined;

    if (read?.ok === true) {
        return { ok: true };
    }

    return refusals.includes(read?.refused as Refusal) ? { refused: read?.refused as Refusal } : undefined;
}

/** A first line not given: the socket closed first, nothing came in time, or the line grew too long. */
export type NoLine = "closed" | "slow" | "long";

/**
 * The first line a socket gives, without its end of line, and the bytes after it, which belong to what follows; or why none came: the socket ended first,
 * nothing within `wait` ms, or a line past `most` bytes. The socket is left paused, with none of these listeners.
 */
export function firstLine(socket: Socket, wait: number, most: number): Promise<{ line: string; rest: Buffer; } | NoLine>
{
    return new Promise((done) => {
        let read = Buffer.alloc(0);

        const finish = (found: { line: string; rest: Buffer; } | NoLine): void => {
            clearTimeout(timer);
            socket.pause();
            socket.off("data", take);
            socket.off("end", closed);
            socket.off("close", closed);
            done(found);
        };

        const closed = (): void => finish("closed");

        const take = (chunk: Buffer): void => {
            read = Buffer.concat([read, chunk]);
            const end = read.indexOf(0x0a);

            if (end !== -1 && end <= most) {
                finish({ line: read.subarray(0, end).toString("utf8").replace(/\r$/, ""), rest: read.subarray(end + 1) });
            } else if (end !== -1 || read.length > most) {
                finish("long");
            }
        };

        const timer = setTimeout(() => finish("slow"), wait);
        socket.on("data", take);
        socket.once("end", closed);
        socket.once("close", closed);
    });
}

const refusals: readonly Refusal[] = ["key", "version", "busy", "ending"];

function parsed(line: string): unknown
{
    try {
        return JSON.parse(line) as unknown;
    } catch {
        return undefined;
    }
}
