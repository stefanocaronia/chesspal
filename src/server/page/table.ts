// What only the table's page answers (D-104): another Chesspal version asks it to quit, and the page opens a chat with no chat at the table, through the
// hosts the table offers, and starts it again for a new game; a page a chat serves itself has none of these routes.
import type { IncomingMessage, ServerResponse } from "node:http";
import { gameInAnalysis } from "../../games/index.ts";
import { gameFolder } from "../../profiles/index.ts";
import { tellWatchers } from "./events.ts";
import { bodyOf, isJson, jsonOf, runRoute, sendJson } from "./http.ts";
import type { Served } from "./page.ts";

/** A host the table offers a chat in: whether it is installed, the models and efforts the player may choose, and the command to open one by hand. */
export interface ChatHost
{
    readonly name: string;
    readonly installed: boolean;
    readonly models: readonly string[];
    readonly efforts: readonly string[];
    readonly command: string;
}

/**
 * How the table opens a chat: the hosts it offers, and a terminal with one of them, whether one opened; whether `chesspal play` holds the chat of a folder,
 * and how it is asked to start it again.
 */
export interface TableChats
{
    hosts(): readonly ChatHost[];
    open(host: string): Promise<boolean>;
    holds(folder: string): boolean;
    relaunch(folder: string): boolean;
}

/** A chat opening at the table: one the page asked for, or the one started again for a new game. */
export type Opening = "chat" | "again";

/** What the table's page shows of its chat: whether one is at the table, the hosts it can open one in, and one opening. */
export function tableShown(served: Served): { table?: { chat: boolean; hosts: readonly ChatHost[]; opening?: Opening; }; }
{
    const { table } = served;

    if (table === undefined) {
        return {};
    }

    const now = opening(served);
    return { table: { chat: served.attached !== undefined, hosts: table.chats?.hosts() ?? [], ...(now === undefined ? {} : { opening: now }) } };
}

/** Answers the table's own routes, under /api/table/; false for any other, and for every request to a page a chat serves itself. */
export function answerTable(request: IncomingMessage, response: ServerResponse, url: URL, served: Served): boolean
{
    const path = url.pathname;

    if (served.table === undefined || request.method !== "POST" || !path.startsWith("/api/table/") || !isJson(request)) {
        return false;
    }

    if (path === "/api/table/quit") {
        // Another Chesspal version asks the table to quit, to start its own in its place.
        sendJson(response, 200, { quitting: true });
        served.table.quit();
    } else if (path === "/api/table/chat") {
        runRoute(response, () => openChat(request, response, served));
    } else {
        sendJson(response, 404, { error: `${path} is no route of the table's: it answers POST /api/table/chat and /api/table/quit.` });
    }

    return true;
}

/**
 * Whether a new game starts the chat at the table again, clean (D-57): `chesspal play` holds it, it waits for the bell, no analyst of it is at work, and it
 * has seen a game; one that only greeted the player stays.
 */
export function chatToRelaunch(served: Served): boolean
{
    const { attached, bell } = served;
    const stopped = bell.listening && !bell.inTurn;
    const analysing = gameInAnalysis(gameFolder(served.context.home()))?.analyst !== undefined;
    return attached !== undefined && stopped && !analysing && served.chat.positionSeen?.started !== undefined && served.table?.chats?.holds(attached.chat.folder) === true;
}

/** Asks `chesspal play` to start the chat at the table again, once the new game has started: whether it was asked; the pages then show it opening. */
export function relaunchChat(served: Served): boolean
{
    const folder = served.attached?.chat.folder;

    if (folder === undefined || served.table?.chats?.relaunch(folder) !== true) {
        return false;
    }

    noteOpening(served, "again");
    return true;
}

// A terminal takes a few seconds to open and its chat to attach: a second click meanwhile would open a second chat, which serves a page of its own.
const openingFor = 30_000;

/**
 * Opens a chat in a terminal, asked by the table's own page alone, which a browser marks with its origin: never while a chat is at the table, or one is
 * opening. Whether it opened; else the page shows the command to type.
 */
async function openChat(request: IncomingMessage, response: ServerResponse, served: Served): Promise<void>
{
    const host = jsonOf(await bodyOf(request))?.host;
    const offered = served.table?.chats?.hosts().find((one) => one.name === host && one.installed);

    if (request.headers.origin !== `http://127.0.0.1:${served.port}` && request.headers.origin !== `http://localhost:${served.port}`) {
        sendJson(response, 403, { error: "Only the table's own page opens a chat." });
    } else if (offered === undefined || served.table?.chats === undefined) {
        sendJson(response, 400, { error: `Name a host the table offers and this computer has: ${served.table?.chats?.hosts().filter((one) => one.installed).map((one) => one.name).join(", ") || "none"}.` });
    } else if (served.attached !== undefined || opening(served) !== undefined) {
        sendJson(response, 409, { error: "A chat is at the table, or opening: play there." });
    } else {
        const opened = noteOpening(served, "chat");
        const started = await served.table.chats.open(offered.name);

        if (!started && served.chatOpened === opened) {
            served.chatOpened = undefined;
        }

        sendJson(response, 200, { opened: started });
        tellWatchers(served.watchers);
    }
}

// The pages show a chat opening from now until it attaches; one that has not by then lets them open another. The opening noted.
function noteOpening(served: Served, how: Opening): { at: number; how: Opening; }
{
    const opened = { at: served.context.now().getTime(), how };
    served.chatOpened = opened;
    tellWatchers(served.watchers);
    setTimeout(() => {
        if (served.chatOpened === opened) {
            tellWatchers(served.watchers);
        }
    }, openingFor).unref();
    return opened;
}

// A chat opening, with none at the table: one noted lately, or one chesspal play holds the seat for, as at a trust prompt longer than the wait.
function opening(served: Served): Opening | undefined
{
    const { attached, chatOpened, context } = served;

    if (attached !== undefined) {
        return undefined;
    }

    if (chatOpened !== undefined && context.now().getTime() - chatOpened.at < openingFor) {
        return chatOpened.how;
    }

    return served.table?.chats?.holds(context.folder) === true ? "chat" : undefined;
}
