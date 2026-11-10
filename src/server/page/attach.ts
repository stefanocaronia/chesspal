// The table's end of the chat attached to it (D-104): the chat attaches and stays while its process lives, says when it calls a tool, sends a copy of what
// it saw, and asks for the New game window. One chat at a time, of this version alone; a page a chat serves itself has none of these routes.
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { forgetTheAi, noteAiHost, noteAiModel } from "../../games/index.ts";
import { gameFolder } from "../../profiles/index.ts";
import { version } from "../../version.ts";
import { type Attached, chatAttach, chatCopy } from "./chat.ts";
import { askNewGame, tellWatchers } from "./events.ts";
import { chatCalls } from "./game.ts";
import { bytesOf, isJson, jsonOf, runRoute, sendJson } from "./http.ts";
import type { Served } from "./page.ts";

/** Answers the chat's requests to the table, under /api/chat; false for any other, and for every request to a page a chat serves itself. */
export function answerChat(request: IncomingMessage, response: ServerResponse, url: URL, served: Served): boolean
{
    const path = url.pathname;

    if (served.table === undefined || request.method !== "POST" || (path !== "/api/chat" && !path.startsWith("/api/chat/"))) {
        return false;
    }

    runRoute(response, async () => {
        const body = isJson(request) ? jsonOf((await bytesOf(request, copyLimit))?.toString("utf8")) : undefined;

        if (body === undefined) {
            sendJson(response, 400, { error: `${path} takes a JSON object.` });
        } else if (path === "/api/chat") {
            attach(body, response, served);
        } else if (served.attached === undefined || body.token !== served.attached.token) {
            sendJson(response, 409, { error: "This chat is not the one at the table: attach to it again." });
        } else {
            answerAttached(path, body, response, served, served.attached);
        }
    });
    return true;
}

// A copy holds the player's words the chat was given in its whole life: a long game's are well within this.
const copyLimit = 1_000_000;

/**
 * A chat attaches: refused when another is at the table, or its version is another (the older yields, D-104); else it gets its token, and the answer stays
 * open while its process lives. When the connection closes the chat has left, and the table is nobody's again.
 */
function attach(body: Record<string, unknown>, response: ServerResponse, served: Served): void
{
    const parsed = chatAttach.safeParse(body);

    if (!parsed.success) {
        sendJson(response, 400, { error: `A chat attaches with its version, session, folder and host: ${parsed.error.message}` });
        return;
    }

    if (parsed.data.version !== version) {
        sendJson(response, 409, { error: `The table runs Chesspal ${version}, the chat ${parsed.data.version}.`, version });
        return;
    }

    if (served.attached !== undefined) {
        sendJson(response, 409, { error: "Another chat is at the table: this one serves its own page." });
        return;
    }

    const attached: Attached = { token: randomUUID(), chat: parsed.data, copy: undefined, given: new Set() };
    served.attached = attached;
    served.chatOpened = undefined;
    served.outdated = parsed.data.outdated;
    response.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    response.write(`${JSON.stringify({ token: attached.token, open: served.watchers.size > 0 })}\n`);
    response.on("close", () => {
        if (served.attached === attached) {
            served.attached = undefined;
            served.outdated = false;
            forgetChat(served);
            served.bell.chatLeft();
        }
    });
    tellWatchers(served.watchers);
}

/** The next chat may play in another host, with another model: the AI's card shows its own from its first move (Federico). */
function forgetChat(served: Served): void
{
    try {
        forgetTheAi(gameFolder(served.context.home()));
    } catch {
        // A data folder that cannot be read keeps no notes to forget.
    }
}

/** The attached chat's requests:it calls a tool, sends a copy of what it saw, or asks for the New game window. */
function answerAttached(path: string, body: Record<string, unknown>, response: ServerResponse, served: Served, attached: Attached): void
{
    if (path === "/api/chat/call") {
        chatCalls(served);
        sendJson(response, 200, { open: served.watchers.size > 0 });
    } else if (path === "/api/chat/read") {
        readCopy(body, response, served, attached);
    } else if (path === "/api/chat/new-game") {
        sendJson(response, 200, { opened: askNewGame(served.watchers) });
    } else {
        sendJson(response, 404, { error: `${path} is no route of the table's: the chat attaches at /api/chat, then calls /api/chat/call, /read and /new-game.` });
    }
}

/** Keeps the chat's copy; the AI's model and host noted, as the chat's process notes them, and the pages told when it says they have news. */
function readCopy(body: Record<string, unknown>, response: ServerResponse, served: Served, attached: Attached): void
{
    const parsed = chatCopy.safeParse(body);

    if (!parsed.success) {
        sendJson(response, 400, { error: `A copy holds what the chat saw: ${parsed.error.message}` });
        return;
    }

    const copy = parsed.data;
    attached.copy = copy;
    attached.given = new Set(copy.given);
    const folder = gameFolder(served.context.home());

    const host = copy.aiHost !== undefined && noteAiHost(folder, copy.aiHost);
    const model = copy.aiModel !== undefined && noteAiModel(folder, copy.aiModel);

    if (copy.news || host || model) {
        tellWatchers(served.watchers);
    }

    sendJson(response, 200, { open: served.watchers.size > 0 });
}
