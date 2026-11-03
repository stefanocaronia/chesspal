// The page on localhost (D-8, D-47): its HTML with the import map, its scripts, the chess core and the packages they import, the game it shows and keeps
// up to date, the player's moves and words (T-65), and the doorbell that wakes the chat when the player moves or writes.
import { createHash } from "node:crypto";
import { readFileSync, watch } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createRequire } from "node:module";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Context } from "../commands/context.ts";
import { playMove } from "../commands/play-move.ts";
import { say } from "../commands/say.ts";
import { endOf, loadGame, playerPgn, talkLimits, unheardWords } from "../games/index.ts";
import { Bell, bellProbe, pagePorts } from "./bell.ts";

/** The page of a player's folder, served: its address, and how to stop it. */
export interface Page
{
    readonly url: string;
    close(): Promise<void>;
}

/**
 * Serves the page of the context's folder on 127.0.0.1, on a port of its own when free, else on any free one, where the doorbell cannot find it. The page
 * names the opponent as the host does, once it has connected; the doorbell knows from the context what the chat has read of the player's words.
 */
export async function startPage(context: Context, opponent: () => string | undefined = () => undefined): Promise<Page>
{
    const { folder } = context;
    const served: Served = { folder, context, opponent, bell: new Bell(() => hasNews(context)), watchers: new Set(), port: 0 };
    const server = createServer((request, response) => answer(request, response, served));

    for (const port of [...pagePorts(folder), 0]) {
        if (await listened(server, port)) {
            server.unref();
            served.port = portOf(server);
            const stopWatching = watchGame(served);
            return { url: `http://127.0.0.1:${served.port}/`, close: () => closed(server, stopWatching) };
        }
    }

    throw new Error("Chesspal could not open a port for the page on 127.0.0.1: check that a firewall does not block local servers, then try again.");
}

/** What the server keeps of its folder: the doorbell, and the pages that wait to hear the game has changed. */
interface Served
{
    readonly folder: string;
    readonly context: Context;
    readonly opponent: () => string | undefined;
    readonly bell: Bell;
    readonly watchers: Set<ServerResponse>;
    port: number;
}

// The built page and core: dist/, from src/server and from dist/server alike.
const built = fileURLToPath(new URL("../../dist/", import.meta.url));

// The modules the page imports from packages, by the names the import map gives them: a package, and its file.
const vendorModules: Readonly<Record<string, readonly [string, string]>> = {
    "preact.js": ["preact", "dist/preact.module.js"],
    "hooks.js": ["preact", "hooks/dist/hooks.module.js"],
    "jsx-runtime.js": ["preact", "jsx-runtime/dist/jsxRuntime.module.js"],
    "chess.js": ["chess.js", "dist/esm/chess.js"],
};

const importMap = JSON.stringify({
    imports: { "preact": "/vendor/preact.js", "preact/hooks": "/vendor/hooks.js", "preact/jsx-runtime": "/vendor/jsx-runtime.js", "chess.js": "/vendor/chess.js" },
});

// The page runs only its own files and the import map written in it, known by its hash.
const policy = `default-src 'self'; script-src 'self' 'sha256-${createHash("sha256").update(importMap).digest("base64")}'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; `
    + "base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const html = [
    "<!doctype html>",
    '<html lang="en">',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="light dark">',
    "<title>Chesspal</title>",
    '<link rel="stylesheet" href="/page/style.css">',
    `<script type="importmap">${importMap}</script>`,
    '<script type="module" src="/page/main.js"></script>',
    '<div id="app"></div>',
    "",
].join("\n");

const types: Readonly<Record<string, string>> = { ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" };

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

    if (request.method === "POST" && path === "/api/move") {
        void moveFromPage(request, response, served);
        return;
    }

    if (request.method === "POST" && path === "/api/message") {
        void messageFromPage(request, response, served);
        return;
    }

    // The API answers GET alone: a HEAD at the doorbell would wait there as a hook does.
    if (request.method !== "GET" && (request.method !== "HEAD" || path.startsWith("/api/"))) {
        send(response, 405, "text/plain; charset=utf-8", "The page only reads, moves with POST /api/move and writes with POST /api/message.");
        return;
    }

    if (path === "/") {
        send(response, 200, "text/html; charset=utf-8", html, { "Content-Security-Policy": policy });
    } else if (path === "/api/game") {
        sendGame(response, served);
    } else if (path === "/api/events") {
        keepPosted(request, response, served);
    } else if (path === "/api/bell") {
        if (url.searchParams.has("probe")) {
            send(response, 200, "application/json; charset=utf-8", JSON.stringify(bellProbe(served.folder)));
        } else {
            served.bell.listen(request, response);
        }
    } else {
        sendFile(response, path);
    }
}

/**
 * The player's move from the page, with their words when they wrote some: played as player_move plays it (D-47) and saved with the words, refused in the
 * player's words, and the doorbell rung for the chat.
 */
async function moveFromPage(request: IncomingMessage, response: ServerResponse, served: Served): Promise<void>
{
    // A form of another site can post text, never JSON without asking first: the type keeps it out, with the origin.
    if (!isJson(request)) {
        send(response, 415, json, JSON.stringify({ error: 'Send the move as JSON: {"move": "e2e4"}.' }));
        return;
    }

    const body = jsonOf(await bodyOf(request));
    const move = textOf(body?.move);

    if (move === undefined || (body?.message !== undefined && typeof body.message !== "string")) {
        send(response, 400, json, JSON.stringify({ error: 'Send the move as JSON, in SAN or as squares, with your words if you like: {"move": "e2e4", "message": "…"}.' }));
        return;
    }

    const refused = refusalOf(served.folder);

    if (refused !== undefined) {
        send(response, 409, json, JSON.stringify({ error: refused }));
        return;
    }

    const message = textOf(body?.message);

    try {
        playMove(served.folder, "player", move, (problem) => problem, message === undefined ? {} : { said: { text: message, at: served.context.now() } });
    } catch (error) {
        send(response, 409, json, JSON.stringify({ error: (error as Error).message }));
        return;
    }

    // The pages hear of the move from the watcher, as of every other.
    served.bell.ring();
    send(response, 200, json, JSON.stringify({ played: true }));
}

/** The player's words from the page, without a move: saved with the game as player_say saves them, refused in the player's words, and the doorbell rung. */
async function messageFromPage(request: IncomingMessage, response: ServerResponse, served: Served): Promise<void>
{
    if (!isJson(request)) {
        send(response, 415, json, JSON.stringify({ error: 'Send the message as JSON: {"text": "…"}.' }));
        return;
    }

    const text = textOf(jsonOf(await bodyOf(request))?.text);

    if (text === undefined) {
        send(response, 400, json, JSON.stringify({ error: `Send the message as JSON, ${talkLimits.player} characters at most: {"text": "…"}.` }));
        return;
    }

    try {
        say(served.folder, "player", text, served.context.now());
    } catch (error) {
        send(response, 409, json, JSON.stringify({ error: (error as Error).message }));
        return;
    }

    served.bell.ring();
    send(response, 200, json, JSON.stringify({ said: true }));
}

const json = "application/json; charset=utf-8";

/** Why the player cannot move now, in their words; undefined when they can. */
function refusalOf(folder: string): string | undefined
{
    try {
        const current = loadGame(folder);

        if (current === undefined || endOf(current.game) !== undefined) {
            return "There is no game going on: start one in the chat.";
        }

        return current.game.position.turn === current.ai ? "Wait for the AI's move." : undefined;
    } catch (error) {
        return (error as Error).message;
    }
}

/**
 * Whether the chat has news from the page: a move of the player's the AI has not answered, a game the player ended there, or words of theirs it has not
 * been given. A game that cannot be read is news too: status says what is wrong.
 */
function hasNews(context: Context): boolean
{
    try {
        const current = loadGame(context.folder);
        return current !== undefined && (current.game.position.turn === current.ai || unheardWords(current, context.given).length > 0);
    } catch {
        return true;
    }
}

function isJson(request: IncomingMessage): boolean
{
    return (request.headers["content-type"] ?? "").startsWith("application/json");
}

function jsonOf(text: string | undefined): Record<string, unknown> | undefined
{
    try {
        const parsed: unknown = text === undefined ? undefined : JSON.parse(text);
        return typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : undefined;
    } catch {
        return undefined;
    }
}

/** A text field of a body, trimmed; undefined when it is not text, or empty. */
function textOf(value: unknown): string | undefined
{
    return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/** A request's body, up to a size a move with the player's words never reaches; undefined past it. */
function bodyOf(request: IncomingMessage): Promise<string | undefined>
{
    return new Promise((done) => {
        let text = "";
        request.setEncoding("utf8");
        request.on("data", (chunk: string) => {
            text += chunk;

            if (text.length > 4096) {
                request.destroy();
                done(undefined);
            }
        });
        request.on("end", () => done(text));
        request.on("error", () => done(undefined));
    });
}

/** A page that waits to hear the game has changed: a stream of events, one "changed" for each change, after which the page reads the game again. */
function keepPosted(request: IncomingMessage, response: ServerResponse, served: Served): void
{
    response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    response.write(": posted\n\n");
    served.watchers.add(response);
    request.on("close", () => served.watchers.delete(response));
}

function tellWatchers(served: Served): void
{
    for (const watcher of served.watchers) {
        watcher.write("data: changed\n\n");
    }
}

/** Watches the player's folder for changes to the game, whoever makes them (the AI's tools, the CLI, a hand edit): the pages hear of them. It returns how to stop watching. */
function watchGame(served: Served): () => void
{
    let waiting: NodeJS.Timeout | undefined;

    const changed = (): void => {
        waiting = undefined;
        tellWatchers(served);
    };

    try {
        // A save writes a new file and renames it: the events of one save come together, and the pages hear of it once.
        const watcher = watch(served.folder, (_event, name) => {
            if (name === "game.json" && waiting === undefined) {
                waiting = setTimeout(changed, 30);
            }
        });
        watcher.unref();

        return () => {
            clearTimeout(waiting);
            watcher.close();
        };
    } catch {
        // A folder that cannot be watched: the pages see the game only as they load it.
        return () => undefined;
    }
}

/**
 * The game in progress or just ended, as the player may see it: its PGN without the AI's plans while it goes on, the AI's side, and the talk on the page;
 * and the AI's name.
 */
function sendGame(response: ServerResponse, served: Served): void
{
    try {
        const current = loadGame(served.folder);
        const talk = current?.talk.map(({ who, text, ply }) => ({ who, text, ply }));
        const body = { game: current === undefined ? null : { pgn: playerPgn(current), ai: current.ai, talk }, opponent: served.opponent() };
        send(response, 200, "application/json; charset=utf-8", JSON.stringify(body));
    } catch (error) {
        send(response, 500, "application/json; charset=utf-8", JSON.stringify({ error: (error as Error).message }));
    }
}

/** A script or style of the page, a module of the core, or a package's module: only from their folders, and only of the types the page uses. */
function sendFile(response: ServerResponse, path: string): void
{
    const file = path.startsWith("/vendor/") ? vendorModule(path.slice("/vendor/".length)) : builtFile(path);
    const type = file === undefined ? undefined : types[extname(file)];
    let bytes: Buffer | undefined;

    try {
        bytes = file === undefined || type === undefined ? undefined : readFileSync(file);
    } catch {
        bytes = undefined;
    }

    if (bytes === undefined || type === undefined) {
        send(response, 404, "text/plain; charset=utf-8", `Nothing at ${path}.`);
        return;
    }

    send(response, 200, type, bytes);
}

function builtFile(path: string): string | undefined
{
    const area = /^\/(page|core)\//.exec(path)?.[1];

    if (area === undefined) {
        return undefined;
    }

    try {
        const root = join(built, area);
        const file = resolve(built, `.${decodeURIComponent(path)}`);
        const inside = relative(root, file);
        return inside === "" || inside.startsWith("..") || isAbsolute(inside) ? undefined : file;
    } catch {
        // An address that does not decode.
        return undefined;
    }
}

function vendorModule(name: string): string | undefined
{
    const module = vendorModules[name];

    if (module === undefined) {
        return undefined;
    }

    try {
        // The package's folder, from where its main file is: node_modules/<package>.
        const main = createRequire(import.meta.url).resolve(module[0]);
        const marker = join("node_modules", module[0]);
        return join(main.slice(0, main.lastIndexOf(marker) + marker.length), module[1]);
    } catch {
        return undefined;
    }
}

function fromHere(request: IncomingMessage, port: number, api: boolean): boolean
{
    const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    const origin = request.headers.origin;
    // An image or a script of another site sends no origin, but the browser says where it comes from: such a request could take the doorbell's place.
    const site = request.headers["sec-fetch-site"];
    return hosts.includes(request.headers.host ?? "") && (origin === undefined || hosts.some((host) => origin === `http://${host}`))
        && (!api || site === undefined || site === "same-origin" || site === "none");
}

function send(response: ServerResponse, status: number, type: string, body: string | Buffer, headers: Record<string, string> = {}): void
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
