// The page on localhost (D-8, D-47): served on a port of its own, its requests sent where they belong (its files, the game, the profiles), and the pages open
// kept up to date as the game changes; the doorbell wakes the chat when the player acts there.
import { type FSWatcher, watch } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { join } from "node:path";
import { type Context, positionIn } from "../../commands/index.ts";
import { gameStamp } from "../../games/index.ts";
import { gameFolder } from "../../profiles/index.ts";
import { Bell, bellProbe, pagePorts } from "../bell.ts";
import { analysesOf } from "./analyses.ts";
import { sendFile, sendHtml } from "./files.ts";
import { answerGame, chatCalls } from "./game.ts";
import { json, send } from "./http.ts";
import { answerProfiles } from "./profiles.ts";

/** The page of a player's folder, served: its address, how to tell it the AI was given words, which change no file, and how to stop it. */
export interface Page
{
    readonly url: string;
    heard(): void;
    /** The chat calls a tool: the page hears it listens, and the AI's clock, held while nobody heard the player, starts now. */
    chatCalls(): void;
    /** Whether a browser has the page open now: one listens to the game's changes. */
    open(): boolean;
    /** Opens the New game window on every page open now, for the player to choose the game there: whether one was open. */
    askNewGame(): boolean;
    close(): Promise<void>;
}

/**
 * Serves the page of the context's folder on 127.0.0.1, on a port of its own when free, else on any free one, where the doorbell cannot find it. The page
 * names the opponent as the host does, once it has connected; the doorbell knows from the context what the chat has read of the player's words.
 */
export async function startPage(context: Context, opponent: () => string | undefined = () => undefined): Promise<Page>
{
    const { folder } = context;
    const watchers = new Set<ServerResponse>();
    const served: Served = { folder, context, opponent, bell: new Bell(() => hasNews(context), () => tellWatchers(served)), watchers, port: 0 };
    const server = createServer((request, response) => answer(request, response, served));

    for (const port of [...pagePorts(folder), 0]) {
        if (await listened(server, port)) {
            server.unref();
            served.port = portOf(server);
            const stopWatching = watchGame(served);
            return {
                url: `http://127.0.0.1:${served.port}/`,
                heard: () => tellWatchers(served),
                chatCalls: () => chatCalls(served),
                open: () => watchers.size > 0,
                askNewGame: () => askNewGame(served),
                close: () => closed(server, stopWatching),
            };
        }
    }

    throw new Error("Chesspal could not open a port for the page on 127.0.0.1: check that a firewall does not block local servers, then try again.");
}

/** What the server keeps of its folder: the doorbell, and the pages that wait to hear the game has changed. */
export interface Served
{
    /** The host's folder, which gives the page its ports and the doorbell its chat; the game is in the context's data folder (D-71). */
    readonly folder: string;
    readonly context: Context;
    readonly opponent: () => string | undefined;
    readonly bell: Bell;
    readonly watchers: Set<ServerResponse>;
    port: number;
}

/**
 * The chat has read the game as it is now, at the end of a tool's call: the doorbell wakes it only for what changes it after; and, when the tool `showed` it
 * the game, it moves on that position and no other until a tool shows it another (D-71). A game that cannot be read shows none.
 */
export function chatHasRead(context: Context, showed: boolean): void
{
    context.seen = gameSeen(context);

    if (!showed) {
        return;
    }

    try {
        context.positionSeen = positionIn(gameFolder(context.home()));
    } catch {
        context.positionSeen = null;
    }
}

/** Sends each request where it belongs: the profiles, the game, the page's files, the analyses, the events and the doorbell. */
function answer(request: IncomingMessage, response: ServerResponse, served: Served): void
{
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const path = url.pathname;

    // Only this machine's pages: another site the browser shows can neither read the game nor move through the player's browser. A link from another site,
    // such as the chat's, still opens the page.
    if (!fromHere(request, served.port, path.startsWith("/api/"))) {
        send(response, 403, "text/plain; charset=utf-8", "Chesspal's page answers only at its own address on this machine.");
        return;
    }

    if (answerProfiles(request, response, url, served) || answerGame(request, response, url, served)) {
        return;
    }

    // The API answers GET alone: a HEAD at the doorbell would wait there as a hook does.
    if (request.method !== "GET" && (request.method !== "HEAD" || path.startsWith("/api/"))) {
        send(
            response,
            405,
            "text/plain; charset=utf-8",
            "The page only reads, moves with POST /api/move, writes with POST /api/message, starts a game with POST /api/new and its clocks with POST /api/start, "
                + "offers or answers a draw with POST /api/draw, resigns with POST /api/resign, brings a game to analyse or opens one again with POST /api/study, and keeps the profiles with POST /api/profile/… and /api/settings.",
        );
        return;
    }

    if (path === "/") {
        sendHtml(response);
    } else if (path === "/api/analyses") {
        send(response, 200, json, JSON.stringify(analysesOf(served.context.home())));
    } else if (path === "/api/events") {
        keepPosted(request, response, served);
    } else if (path === "/api/bell") {
        if (url.searchParams.has("probe")) {
            send(response, 200, json, JSON.stringify(bellProbe(served.folder, served.watchers.size > 0)));
        } else {
            served.bell.listen(request, response);
        }
    } else {
        sendFile(response, path);
    }
}

/**
 * Whether the chat has news from the page: a game changed since the chat's last tool, by the player's move, words, draw or resignation, a new game or a
 * flag that fell, or another profile in use, which wakes the chat at the next ring (D-66). The player's words the chat was given change nothing it has not read.
 */
function hasNews(context: Context): boolean
{
    return gameSeen(context) !== context.seen;
}

// The game the chat sees: the profile's folder, and the stamp of its game.json; none while the data folder cannot be made.
function gameSeen(context: Context): string
{
    try {
        const folder = gameFolder(context.home());
        return `${folder}
${gameStamp(folder) ?? ""}`;
    } catch {
        return "";
    }
}

/** A page that waits to hear the game has changed: a stream of events, one "changed" for each change, after which the page reads the game again. */
function keepPosted(request: IncomingMessage, response: ServerResponse, served: Served): void
{
    response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    response.write(": posted\n\n");
    served.watchers.add(response);
    request.on("close", () => served.watchers.delete(response));
}

/** The pages open now open their New game window; whether there was one. */
function askNewGame(served: Served): boolean
{
    for (const watcher of served.watchers) {
        watcher.write("data: new-game\n\n");
    }

    return served.watchers.size > 0;
}

function tellWatchers(served: Served): void
{
    for (const watcher of served.watchers) {
        watcher.write("data: changed\n\n");
    }
}

/**
 * Watches the data folder, its profiles and the profile in use for changes to the game and the profiles, whoever makes them (the AI's tools, another chat,
 * the CLI, a hand edit): the pages hear of them. Each folder is watched on its own, never its whole tree, and watched again after each change, since the
 * profile in use may be another. It returns how to stop watching.
 */
function watchGame(served: Served): () => void
{
    let waiting: NodeJS.Timeout | undefined;
    let watching: FSWatcher[] = [];

    const watchAll = (): void => {
        watching.forEach((watcher) => watcher.close());
        watching = watchedFolders(served).flatMap((folder) => watchFolder(folder, heard));
    };

    // A save writes a new file and renames it: the events of one save come together, and the pages hear of it once.
    const heard = (name: string | null): void => {
        if ((name === null || watched.test(name)) && waiting === undefined) {
            waiting = setTimeout(() => {
                waiting = undefined;
                watchAll();
                tellWatchers(served);
            }, 30);
        }
    };

    watchAll();

    return () => {
        clearTimeout(waiting);
        watching.forEach((watcher) => watcher.close());
    };
}

// None while the data folder cannot be made: each tool call tells the chat why, and the page reads the game as it loads.
function watchedFolders(served: Served): string[]
{
    try {
        const home = served.context.home();
        return [home, join(home, "profiles"), gameFolder(home)];
    } catch {
        return [];
    }
}

// A folder watched, without its subfolders; none when it cannot be, or is not there yet: the pages see its files only as they load them.
function watchFolder(folder: string, heard: (name: string | null) => void): FSWatcher[]
{
    try {
        const watcher = watch(folder, (event, name) => heard(name));
        watcher.on("error", () => watcher.close());
        watcher.unref();
        return [watcher];
    } catch {
        return [];
    }
}

// The current game, what the coach wrote on it, the talk before the first, the game in analysis, the profile in use, and what a profile keeps (who plays, their picture, their settings); a folder's name, for a
// profile made or gone.
const watched = /^(?:game\.json|coach\.json|talk\.json|analysis\.json|active\.json|profile\.md|settings\.json|avatar\.\w+|[a-z0-9-]+)$/;

function fromHere(request: IncomingMessage, port: number, api: boolean): boolean
{
    const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    const origin = request.headers.origin;
    // An image or a script of another site sends no origin, but the browser says where it comes from: such a request could take the doorbell's place.
    const site = request.headers["sec-fetch-site"];
    return hosts.includes(request.headers.host ?? "") && (origin === undefined || hosts.some((host) => origin === `http://${host}`))
        && (!api || site === undefined || site === "same-origin" || site === "none");
}

function listened(server: Server, port: number): Promise<boolean>
{
    return new Promise((done) => {
        const failed = () => done(false);
        server.once("error", failed);
        server.listen(port, "127.0.0.1", () => {
            server.off("error", failed);
            done(true);
        });
    });
}

function portOf(server: Server): number
{
    const address = server.address();
    return typeof address === "object" && address !== null ? address.port : 0;
}

function closed(server: Server, stopWatching: () => void): Promise<void>
{
    stopWatching();
    return new Promise((done) => {
        server.close(() => done());
        server.closeAllConnections();
    });
}
