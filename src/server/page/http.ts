// What the page's server needs of HTTP: answers with the headers that keep the page safe, and the bodies of the page's requests, read up to a limit.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { DrawRefused } from "../../commands/index.ts";
import type { WordsRefused } from "../../games/index.ts";

export const json = "application/json; charset=utf-8";

/**
 * A request refused, as the page reads it: the server's words, and the code of a refusal the page says in the player's language, with the characters
 * left for words too long; without a code, the page shows the words.
 */
export interface Refused
{
    readonly error: string;
    readonly refusal?:
        | "no-game"
        | "ai-to-move"
        | "illegal"
        | "clear-chat"
        | `words-${WordsRefused["reason"]}`
        | `draw-${DrawRefused["reason"]}`
        | "profile-game"
        | "game-going"
        | "pgn-unreadable"
        | "game-missing"
        | "game-not-archived"
        | "update-game"
        | "update-chat";
    readonly most?: number;
}

/** Answers a request, with nothing cached, sniffed or referred, and the page's policy unless the headers give another. */
export function send(response: ServerResponse, status: number, type: string, body: string | Buffer, headers: Record<string, string> = {}): void
{
    response.writeHead(status, {
        "Content-Type": type,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy": "default-src 'self'",
        ...headers,
    });
    response.end(body);
}

/** Answers with JSON. */
export function sendJson(response: ServerResponse, status: number, body: unknown): void
{
    send(response, status, json, JSON.stringify(body));
}

/** Runs the answer to a request: an error it did not expect, such as a file that cannot be written, is told to the page, and the server goes on. */
export function runRoute(response: ServerResponse, route: () => void | Promise<void>): void
{
    Promise.resolve().then(route).catch((error: unknown) => {
        if (response.headersSent) {
            response.end();
        } else {
            sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
        }
    });
}

/** Whether a request sends JSON: a form of another site can post text, never JSON without asking first. */
export function isJson(request: IncomingMessage): boolean
{
    return (request.headers["content-type"] ?? "").startsWith("application/json");
}

/** An object from JSON; undefined for anything else. */
export function jsonOf(text: string | undefined): Record<string, unknown> | undefined
{
    try {
        const parsed: unknown = text === undefined ? undefined : JSON.parse(text);
        return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
    } catch {
        return undefined;
    }
}

/** A text field of a body, trimmed; undefined when it is not text, or empty. */
export function textOf(value: unknown): string | undefined
{
    return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/** A request's body as text, up to a size a move with the player's words never reaches; undefined past it. */
export async function bodyOf(request: IncomingMessage): Promise<string | undefined>
{
    return (await bytesOf(request, 4096))?.toString("utf8");
}

/** A request's body, up to a limit; undefined past it, or when the request breaks. */
export function bytesOf(request: IncomingMessage, limit: number): Promise<Buffer | undefined>
{
    return new Promise((done) => {
        const chunks: Buffer[] = [];
        let size = 0;
        request.on("data", (chunk: Buffer) => {
            size += chunk.length;

            if (size > limit) {
                request.destroy();
                done(undefined);
                return;
            }

            chunks.push(chunk);
        });
        request.on("end", () => done(Buffer.concat(chunks)));
        request.on("error", () => done(undefined));
    });
}
