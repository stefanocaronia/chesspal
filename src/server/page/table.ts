// What only the table's page answers (D-104): another Chesspal version asks it to quit, and the page opens a chat with no chat at the table, through the
// hosts the table offers, starts it again for a new game, and with another model or host once it has done (D-107); a page a chat serves itself has none
// of these routes.
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
    relaunch(folder: string, host?: string): boolean;
}

/** A chat opening at the table: one the page asked for, the one started again for a new game, or with another model or host (D-107). */
export type Opening = "chat" | "again" | "restart";

/** What the table's page shows of its chat (D-104, D-107). */
export interface TableShown
{
    /** Whether a chat is at the table, and its host among those offered, when it says one. */
    readonly chat: boolean;
    readonly host?: string;
    /** Whether `chesspal play` holds the chat, which the page can then start again; one opened by hand it cannot. */
    readonly held: boolean;
    readonly hosts: readonly ChatHost[];
    readonly opening?: Opening;
    /** A start again asked while the chat was at work, waiting for it to end its answer. */
    readonly waiting?: true;
}

/** What the table's page shows of its chat: whether one is at the table, with which host, the hosts it can open one in, and one opening. */
export function tableShown(served: Served): { table?: TableShown; }
{
    const { table, attached } = served;

    if (table === undefined) {
        return {};
    }

    const host = hostAtTable(served);
    const now = opening(served);
    return {
        table: {
            chat: attached !== undefined,
            ...(host === undefined ? {} : { host }),
            held: heldChat(served),
            hosts: table.chats?.hosts() ?? [],
            ...(now === undefined ? {} : { opening: now }),
            ...(served.restartWanted === undefined ? {} : { waiting: true }),
        },
    };
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
    } else if (path === "/api/table/restart") {
        runRoute(response, () => restartChat(request, response, served));
    } else {
        sendJson(response, 404, { error: `${path} is no route of the table's: it answers POST /api/table/chat, /api/table/restart and /api/table/quit.` });
    }

    return true;
}

/**
 * Whether a new game starts the chat at the table again, clean (D-57): `chesspal play` holds it, it waits for the bell, no analyst of it is at work, and it
 * has seen a game; one that only greeted the player stays.
 */
export function chatToRelaunch(served: Served): boolean
{
    return heldChat(served) && chatAtRest(served) && served.chat.positionSeen?.started !== undefined;
}

/**
 * Asks `chesspal play` to start the chat at the table again: once the new game has started, or with another model or host in its place (D-107). Whether
 * it was asked; the pages then show it opening.
 */
export function relaunchChat(served: Served, how: "again" | "restart" = "again", host?: string): boolean
{
    const folder = served.attached?.chat.folder;

    // Another host may first ask whether it trusts the table's folder: the pages say so, as for a chat opened.
    const switching = how === "restart" && host !== undefined && host !== hostAtTable(served);

    if (folder === undefined || served.table?.chats?.relaunch(folder, host) !== true) {
        return false;
    }

    noteOpening(served, switching ? "chat" : how);
    return true;
}

/** Starts the chat again as the page asked while it was at work, now that it has ended its answer; a chat gone meanwhile takes the request with it. */
export function restartWhenAtRest(served: Served): void
{
    const wanted = served.restartWanted;

    if (wanted === undefined) {
        return;
    }

    if (!heldChat(served)) {
        served.restartWanted = undefined;
    } else if (chatAtRest(served)) {
        served.restartWanted = undefined;
        relaunchChat(served, "restart", wanted.host);
    }
}

// A terminal takes a few seconds to open and its chat to attach: a second click meanwhile would open a second chat, which serves a page of its own.
const openingFor = 30_000;

/**
 * Opens a chat in a terminal, asked by the table's own page alone, which a browser marks with its origin: never while a chat is at the table, or one is
 * opening. Whether it opened; else the page shows the command to type.
 */
async function openChat(request: IncomingMessage, response: ServerResponse, served: Served): Promise<void>
{
    const offered = hostOffered(served, jsonOf(await bodyOf(request))?.host);

    if (!fromTablePage(request, served)) {
        sendJson(response, 403, { error: "Only the table's own page opens a chat." });
    } else if (offered === undefined || served.table?.chats === undefined) {
        sendJson(response, 400, { error: hostsOffered(served) });
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

/**
 * Starts the chat `chesspal play` holds again, clean, with the host the page names and the model and effort it keeps for it (D-107): at once when it is at
 * rest, else once it has ended its answer. Asked by the table's own page alone; a chat opened by hand changes its model with /model.
 */
async function restartChat(request: IncomingMessage, response: ServerResponse, served: Served): Promise<void>
{
    const offered = hostOffered(served, jsonOf(await bodyOf(request))?.host);

    if (!fromTablePage(request, served)) {
        sendJson(response, 403, { error: "Only the table's own page starts the chat again." });
    } else if (offered === undefined) {
        sendJson(response, 400, { error: hostsOffered(served) });
    } else if (!heldChat(served)) {
        sendJson(response, 409, { error: "No chat the table opened is at it: open one from the page, or change the model with /model in a chat opened by hand." });
    } else if (chatAtRest(served)) {
        sendJson(response, 200, { restarting: relaunchChat(served, "restart", offered.name) });
    } else {
        served.restartWanted = { host: offered.name };
        tellWatchers(served.watchers);
        sendJson(response, 200, { waiting: true });
    }
}

// The browser marks a request of the table's own page with its origin.
function fromTablePage(request: IncomingMessage, served: Served): boolean
{
    return request.headers.origin === `http://127.0.0.1:${served.port}` || request.headers.origin === `http://localhost:${served.port}`;
}

function hostOffered(served: Served, host: unknown): ChatHost | undefined
{
    return served.table?.chats?.hosts().find((one) => one.name === host && one.installed);
}

function hostsOffered(served: Served): string
{
    return `Name a host the table offers and this computer has: ${served.table?.chats?.hosts().filter((one) => one.installed).map((one) => one.name).join(", ") || "none"}.`;
}

// The host of the chat at the table, among those offered: it says its name as its MCP client does, «claude-code» or «codex-mcp-client».
function hostAtTable(served: Served): string | undefined
{
    const said = served.chat.host()?.toLowerCase() ?? "";
    return served.attached === undefined ? undefined : served.table?.chats?.hosts().find((one) => said.includes(one.name))?.name;
}

// The chat at the table is one `chesspal play` holds, which the table can start again.
function heldChat(served: Served): boolean
{
    const { attached } = served;
    return attached !== undefined && served.table?.chats?.holds(attached.chat.folder) === true;
}

// The chat waits for the doorbell, out of a turn, and no analyst of it is at work: starting it again loses nothing.
function chatAtRest(served: Served): boolean
{
    const { bell } = served;
    return bell.listening && !bell.inTurn && gameInAnalysis(gameFolder(served.context.home()))?.analyst === undefined;
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
