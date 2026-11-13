// The page on localhost (D-8, D-47): served on a port of its own, its requests sent where they belong (its files, the game, the profiles), and the pages open
// kept up to date as the game changes; the doorbell wakes the chat when the player acts there.
import { type FSWatcher, watch } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { join } from "node:path";
import { type Context, positionIn, samePosition, type SeenPosition } from "../../commands/index.ts";
import { aiNameOf } from "../../core/index.ts";
import { forgetAnalyst, gameStamp, tableTalkStamp } from "../../games/index.ts";
import { outdatedHostFiles } from "../../host-files/index.ts";
import { gameFolder } from "../../profiles/index.ts";
import { Bell, bellProbe, forgetPagePort, notePagePort, pagePorts, type TableChat } from "../bell/index.ts";
import { analysesOf, answerAnalyses, sendSiteGames } from "./analyses.ts";
import { answerChat } from "./attach.ts";
import { type Attached, attachedSeen, type ChatSeen, chatSeenOf, pageContext } from "./chat.ts";
import { askNewGame, keepPosted, tellWatchers } from "./events.ts";
import { sendFile, sendHtml } from "./files.ts";
import { answerGame, chatCalls } from "./game.ts";
import { json, send } from "./http.ts";
import { answerProfiles, readRatingsOf } from "./profiles.ts";
import { answerTable, type Opening, restartWhenAtRest, type TableChats, updateWhenAtRest } from "./table.ts";
import { watchForUpdates } from "./update.ts";

/**
 * The page of a player's folder, served by the chat's process or by the table it is attached to (D-104): its address, how to tell it what the chat does
 * and was given, which change no file, and how to stop it.
 */
export interface Page
{
    readonly url: string;
    /** The page has news no file holds: words the AI was given, which it shows read (D-53), the position the chat moves on, the AI's model (D-82). */
    heard(): void;
    /** The chat calls a tool: the page hears it listens, and the AI's clock, held while nobody heard the player, starts now. */
    chatCalls(): void | Promise<void>;
    /** A tool of the chat's has ended: the table gets a copy of what the chat saw; the chat's own page reads it from the chat. */
    toolEnded(): void;
    /** Whether the doorbell finds the page: on its folder's usual ports, at the port it noted in the data folder, or at the table. */
    readonly findable: boolean;
    /** Whether a browser has the page open now: one listens to the game's changes. */
    open(): boolean;
    /** Whether the page is in use: open in a browser, or, on the table, with a chat attached. */
    inUse(): boolean;
    /** Opens the New game window on every page open now, for the player to choose the game there: whether one was open. */
    askNewGame(): boolean;
    close(): Promise<void>;
}

/** How a page is served, besides its context: the opponent's name, as the host gives it, and the table that serves it, when one does (D-104). */
export interface PageOptions
{
    readonly opponent?: () => string | undefined;
    readonly table?: TableEnd;
}

/**
 * What the page tells the table that serves it: a request came, so the table is in use, or another Chesspal version asked it to quit; how the table
 * opens a chat, which the page offers while none is at the table, and how it updates Chesspal.
 */
export interface TableEnd
{
    used(): void;
    quit(): void;
    readonly chats?: TableChats | undefined;
    readonly update?: TableUpdate | undefined;
}

/** How the table updates Chesspal (D-108): npm installs a version, whether it did, and the table closes to start again from it. */
export interface TableUpdate
{
    install(version: string): Promise<boolean>;
    restart(): void;
}

/**
 * Serves the page of the context's folder on 127.0.0.1, on a port of its own when free, else on any free one, which it notes in the data folder for the
 * doorbell to find it there; the table's on its own ports alone, which keep two tables apart. The page reads the chat from the context in the chat's process, and on the table from
 * what the chat attached to it tells it (D-104); it names the opponent as the chat's host does. The doorbell knows what the chat has read.
 */
export async function startPage(context: Context, options: PageOptions = {}): Promise<Page>
{
    const { folder } = context;
    const { table } = options;
    const watchers = new Set<ServerResponse>();
    const chat = table === undefined ? chatSeenOf(context) : attachedSeen(() => served.attached);
    const served: Served = {
        folder,
        context: pageContext(context),
        chat,
        opponent: options.opponent ?? (() => aiNameOf(chat.host())),
        // A start again asked while the chat was at work comes once it has ended its answer (D-107), as an update installed meanwhile (D-108).
        bell: new Bell(() => hasNews(context, chat), () => {
            restartWhenAtRest(served);
            updateWhenAtRest(served);
            tellWatchers(watchers);
        }),
        watchers,
        port: 0,
        outdated: outdatedHostFiles(folder, context.platform).length > 0,
        ...(table === undefined ? {} : { table }),
    };
    const server = createServer((request, response) => answer(request, response, served));
    const ports = table === undefined ? [...pagePorts(folder), 0] : pagePorts(folder);

    for (const port of ports) {
        if (await listened(server, port)) {
            server.unref();
            served.port = portOf(server);
            // Noted before the game is watched: the notes' folder, made in the data folder, is no news for the pages.
            const offPorts = table === undefined && !pagePorts(folder).includes(served.port);
            const noted = offPorts ? notePort(served) : undefined;
            const stopWatchingGame = watchGame(served);
            const stopAskingNpm = watchForUpdates(served);

            // A chat's process ends without closing its page: the note goes with it.
            const forgetPort = (): void => {
                if (noted !== undefined) {
                    forgetPagePort(noted, folder, served.port);
                }
            };

            if (noted !== undefined) {
                process.once("exit", forgetPort);
            }

            const stopWatching = (): void => {
                stopWatchingGame();
                stopAskingNpm();
                forgetPort();
                process.off("exit", forgetPort);
            };

            return {
                url: `http://127.0.0.1:${served.port}/`,
                findable: !offPorts || noted !== undefined,
                heard: () => tellWatchers(watchers),
                chatCalls: () => chatCalls(served),
                toolEnded: () => undefined,
                open: () => watchers.size > 0,
                inUse: () => watchers.size > 0 || served.attached !== undefined,
                askNewGame: () => askNewGame(watchers),
                close: () => closed(server, stopWatching),
            };
        }
    }

    if (table !== undefined) {
        throw new Error(`The table's ports ${ports.join(", ")} on 127.0.0.1 are taken by other programs: close them, or play from a chat, which serves its own page.`);
    }

    throw new Error("Chesspal could not open a port for the page on 127.0.0.1: check that a firewall does not block local servers, then try again.");
}

/** What the server keeps of its folder: the doorbell, and the pages that wait to hear the game has changed. */
export interface Served
{
    /** The host's folder, which gives the page its ports and the doorbell its chat; the game is in the context's data folder (D-71). */
    readonly folder: string;
    /** What the page runs its commands with: never the chat's own (D-71). */
    readonly context: Context;
    /** What the page reads of the chat: the words it was given, the game and the position it saw, its host; on the table, the attached chat's, or nobody's. */
    readonly chat: ChatSeen;
    readonly opponent: () => string | undefined;
    readonly bell: Bell;
    readonly watchers: Set<ServerResponse>;
    port: number;
    /**
     * The chat's folder was set up by an older init: the page asks the player to run it again. Read once, as init runs with the chat closed; on the table,
     * as the chat attached to it says it.
     */
    outdated: boolean;
    /** The table that serves the page, when one does (D-104). */
    readonly table?: TableEnd;
    /** The chat attached to the table, while one is. */
    attached?: Attached;
    /** When the table last opened a chat from the page, which has not attached yet: no second one meanwhile. */
    chatOpened?: { readonly at: number; readonly how: Opening; } | undefined;
    /** The host the page asked the chat to start again with while it was at work (D-107). */
    restartWanted?: { readonly host: string; } | undefined;
    /** The newer Chesspal npm has (D-108); the table installing it, installed and waiting to be at rest, or starting again from it. */
    newer?: string;
    updating?: "installing" | "installed" | "restarting" | undefined;
}

/**
 * The chat has read the game as it is now, at the end of a tool's call: the doorbell wakes it only for what changes it after; and, when the tool `showed` it
 * the game, it moves on that position and no other until a tool shows it another (D-71). A game that cannot be read shows none. The data folder is the call's.
 */
export function chatHasRead(context: Context, showed: boolean, home = context.home): void
{
    context.seen = gameSeen(home);

    if (showed) {
        const before = context.positionSeen;

        try {
            context.positionSeen = positionIn(gameFolder(home()));
        } catch {
            context.positionSeen = null;
        }

        context.positionFirstSeen ??= context.positionSeen ?? undefined;

        // The chat on another position may now be thinking on its move: the page hears it, which no file tells when no bell woke the chat.
        if (!sameSeen(before, context.positionSeen)) {
            context.heard?.();
        }
    }

    // The table the chat is attached to reads it from a copy (D-104).
    context.toolEnded?.();
}

function sameSeen(one: SeenPosition | null | undefined, other: SeenPosition | null | undefined): boolean
{
    return one === other || (one !== undefined && one !== null && other !== undefined && other !== null && samePosition(one, other));
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

    // A probe is no use of the table: a chat on its own page looks for it after each tool, and the hooks look for theirs.
    if (!(path === "/api/bell" && url.searchParams.has("probe"))) {
        served.table?.used();
    }

    const answered = answerProfiles(request, response, url, served) || answerGame(request, response, url, served) || answerAnalyses(request, response, url, served)
        || answerChat(request, response, url, served) || answerTable(request, response, url, served);

    if (answered) {
        return;
    }

    // The API answers GET alone: a HEAD at the doorbell would wait there as a hook does.
    if (request.method !== "GET" && (request.method !== "HEAD" || path.startsWith("/api/"))) {
        send(
            response,
            405,
            "text/plain; charset=utf-8",
            "The page only reads, moves with POST /api/move, writes with POST /api/message, starts a game with POST /api/new and its clocks with POST /api/start, "
                + "offers or answers a draw with POST /api/draw, resigns with POST /api/resign, brings a game to analyse or opens one again with POST /api/study, deletes a game or its review with POST /api/delete-game and /api/delete-review, and keeps the profiles with POST /api/profile/… and /api/settings.",
        );
        return;
    }

    if (path === "/") {
        sendHtml(response);
    } else if (path === "/api/analyses") {
        send(response, 200, json, JSON.stringify(analysesOf(served.context.home())));
    } else if (path === "/api/site-games") {
        sendSiteGames(response, served);
    } else if (path === "/api/events") {
        keepPosted(request, response, served.watchers);
        // A page that opens reads the player's ratings again after a day (D-106).
        readRatingsOf(served);
    } else if (path === "/api/bell") {
        if (url.searchParams.has("probe")) {
            send(response, 200, json, JSON.stringify(bellProbe(served.folder, served.watchers.size > 0, tableChat(served))));
        } else {
            if (url.searchParams.get("analyst") === "gone") {
                forgetGoneAnalyst(served);
            }

            served.bell.listen(request, response);
        }
    } else {
        sendFile(response, path);
    }
}

/** The chat's hook says no analyst runs any more (D-109): the game it held is free, and its review, unless finished, incomplete. */
function forgetGoneAnalyst(served: Served): void
{
    try {
        forgetAnalyst(gameFolder(served.context.home()));
    } catch {
        // A data folder that cannot be written keeps the analyst until half an hour has gone by.
    }
}

/** The chat at the table, as its probe says it: none on a page a chat serves itself. */
function tableChat(served: Served): TableChat | undefined
{
    if (served.table === undefined) {
        return undefined;
    }

    const chat = served.attached?.chat;
    return chat === undefined ? { session: null } : { session: chat.session, chat: chat.folder };
}

/**
 * Whether the chat has news from the page: a game changed since the chat's last tool, by the player's move, words, draw or resignation, a new game or a
 * flag that fell, or another profile in use, which wakes the chat at the next ring (D-66). The player's words the chat was given change nothing it has not read.
 */
function hasNews(context: Context, chat: ChatSeen): boolean
{
    return gameSeen(context.home) !== chat.seen;
}

// The game the chat sees: the profile's folder, and the stamps of its game.json and of the talk with no game, where the player's words go in analysis
// before any game was played here (Priya); none while the data folder cannot be made.
function gameSeen(home: () => string): string
{
    try {
        const folder = gameFolder(home());
        return `${folder}
${gameStamp(folder) ?? ""}
${tableTalkStamp(folder) ?? ""}`;
    } catch {
        return "";
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
                tellWatchers(served.watchers);
                // A game that has ended lets an update installed meanwhile start the table again (D-108).
                updateWhenAtRest(served);
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

// The current game, what the coach wrote on it, whether the AI thinks on the player's time, the talk before the first, the game in analysis, the profile
// in use, and what a profile keeps (who plays, their picture, their settings); a folder's name, for a profile made or gone.
const watched = /^(?:game\.json|coach\.json|thoughts\.json|talk\.json|analysis\.json|active\.json|profile\.md|settings\.json|ratings\.json|avatar\.\w+|[a-z0-9-]+)$/;

function fromHere(request: IncomingMessage, port: number, api: boolean): boolean
{
    const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    const origin = request.headers.origin;
    // An image or a script of another site sends no origin, but the browser says where it comes from: such a request could take the doorbell's place.
    const site = request.headers["sec-fetch-site"];
    return hosts.includes(request.headers.host ?? "") && (origin === undefined || hosts.some((host) => origin === `http://${host}`))
        && (!api || site === undefined || site === "same-origin" || site === "none");
}

/** Notes the port of a page off its folder's usual ports in the data folder: the data folder it noted it in, or none when it could not. */
function notePort(served: Served): string | undefined
{
    try {
        const home = served.context.home();
        void notePagePort(home, served.folder, served.port);
        return home;
    } catch {
        return undefined;
    }
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
