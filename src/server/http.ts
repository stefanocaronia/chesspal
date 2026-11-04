// What the page's server needs of HTTP: answers with the headers that keep the page safe, and the bodies of the page's requests, read up to a limit.
import type { IncomingMessage, ServerResponse } from "node:http";

export const json = "application/json; charset=utf-8";

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
