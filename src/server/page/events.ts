// The events the pages open listen to: the game changed, which they read again, and the New game window to open.
import type { IncomingMessage, ServerResponse } from "node:http";

/** A page that waits to hear the game has changed: a stream of events, one "changed" for each change, after which the page reads the game again. */
export function keepPosted(request: IncomingMessage, response: ServerResponse, watchers: Set<ServerResponse>): void
{
    response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    response.write(": posted\n\n");
    watchers.add(response);
    request.on("close", () => watchers.delete(response));
}

/** The pages open now hear the game, or what they show of the chat, has changed. */
export function tellWatchers(watchers: Set<ServerResponse>): void
{
    for (const watcher of watchers) {
        watcher.write("data: changed\n\n");
    }
}

/** The pages open now open their New game window; whether there was one. */
export function askNewGame(watchers: Set<ServerResponse>): boolean
{
    for (const watcher of watchers) {
        watcher.write("data: new-game\n\n");
    }

    return watchers.size > 0;
}
