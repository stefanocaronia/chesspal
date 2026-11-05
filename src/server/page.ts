// The page on localhost (D-8, D-47): its HTML with the import map, its scripts, the chess core and the packages they import, the game it shows and keeps
// up to date, the player's moves and words (T-65), draws and resignations (D-65), and the doorbell that wakes the chat when the player acts there.
import { createHash } from "node:crypto";
import { type FSWatcher, readFileSync, watch } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createRequire } from "node:module";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { analyseGame } from "../commands/analyse-game.ts";
import { gameAt } from "../commands/clock.ts";
import type { Context } from "../commands/context.ts";
import { answerDraw, DrawRefused, offerDraw } from "../commands/draw-offer.ts";
import { endGame } from "../commands/end-game.ts";
import { ChatNotClear, newGame } from "../commands/new-game.ts";
import { bookPlies } from "../commands/opening-book.ts";
import { playMove } from "../commands/play-move.ts";
import { say } from "../commands/say.ts";
import { gameToStudy, namedGame } from "../commands/study.ts";
import { clockStarted, type GameRecord, writePgn } from "../core/index.ts";
import { type CurrentGame, drawOfferOf, endOf, gameInAnalysis, gameStamp, heardLines, loadGame, playerLinesThisMove, playerPgn, saveGame, startAnalysis, talkLimits, WordsRefused } from "../games/index.ts";
import { gameFolder } from "../profiles/index.ts";
import { analysesOf, isReviewed } from "./analyses.ts";
import { Bell, bellProbe, pagePorts } from "./bell.ts";
import { bodyOf, bytesOf, isJson, json, jsonOf, send, textOf } from "./http.ts";
import { answerProfiles, profilesShown } from "./profile-routes.ts";

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
const policy = `default-src 'self'; script-src 'self' 'sha256-${createHash("sha256").update(importMap).digest("base64")}'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; `
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

const types: Readonly<Record<string, string>> = { ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json; charset=utf-8", ".ogg": "audio/ogg" };

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

    if (answerProfiles(request, response, url, served)) {
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

    if (request.method === "POST" && path === "/api/new") {
        void newGameFromPage(request, response, served);
        return;
    }

    if (request.method === "POST" && path === "/api/draw") {
        void drawFromPage(request, response, served);
        return;
    }

    if (request.method === "POST" && path === "/api/resign") {
        resignFromPage(request, response, served);
        return;
    }

    if (request.method === "POST" && path === "/api/start") {
        startFromPage(request, response, served);
        return;
    }

    if (request.method === "POST" && path === "/api/study") {
        void studyFromPage(request, response, served);
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
        send(response, 200, "text/html; charset=utf-8", html, { "Content-Security-Policy": policy });
    } else if (path === "/api/game") {
        sendGame(response, served);
    } else if (path === "/api/analyses") {
        send(response, 200, json, JSON.stringify(analysesOf(served.folder)));
    } else if (path === "/api/events") {
        keepPosted(request, response, served);
    } else if (path === "/api/bell") {
        if (url.searchParams.has("probe")) {
            send(response, 200, json, JSON.stringify(bellProbe(served.folder)));
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

    const refused = refusalOf(served);

    if (refused !== undefined) {
        send(response, 409, json, JSON.stringify(refused));
        return;
    }

    const message = textOf(body?.message);
    let illegal = false;

    try {
        const now = served.context.now();

        const refuse = (problem: string): string => {
            illegal = true;
            return problem;
        };

        playMove(gameFolder(served.folder), now, "player", move, refuse, message === undefined ? {} : { said: { text: message, at: now } });
    } catch (error) {
        // The game may have changed since the page read it: the move refused, the AI's turn, a flag fallen.
        send(response, 409, json, JSON.stringify(refusalFrom(error, illegal ? "illegal" : refusalOf(served)?.refusal)));
        return;
    }

    // The pages hear of the move from the watcher, as of every other.
    served.bell.ring();
    send(response, 200, json, JSON.stringify({ played: true }));
}

/** The player's words from the page, without a move: saved with the game as player_say saves them, refused in the player's words, the doorbell rung for the first. */
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

    let current;

    try {
        current = say(gameFolder(served.folder), "player", text, served.context.now());
    } catch (error) {
        const noGame = refusalOf(served)?.refusal === "no-game";
        send(response, 409, json, JSON.stringify(refusalFrom(error, noGame ? "no-game" : undefined)));
        return;
    }

    // The first words of a move wake the chat; the AI finds the rest at its next call (D-54).
    if (playerLinesThisMove(current).length === 1) {
        served.bell.ring();
    }

    send(response, 200, json, JSON.stringify({ said: true }));
}

/**
 * A new game from the page, with the sides, the level and the clock the player chose (T-64, T-58): the sides and the level they leave out are as in the game
 * before, and no clock means a game without one. One going on goes to the archive unfinished, and the doorbell tells the chat.
 */
async function newGameFromPage(request: IncomingMessage, response: ServerResponse, served: Served): Promise<void>
{
    const asked = 'Send the new game as JSON: {"ai_colour": "black", "level": "club", "clock": "10+5"}, each one optional; no clock for a game without one.';
    const body = isJson(request) ? jsonOf(await bodyOf(request)) : undefined;

    if (body === undefined) {
        send(response, isJson(request) ? 400 : 415, json, JSON.stringify({ error: asked }));
        return;
    }

    try {
        const before = loadGame(gameFolder(served.folder));
        const input = newGame.input.safeParse({ ai_colour: body.ai_colour ?? before?.ai ?? "black", level: body.level, clock: body.clock, replace: true });

        if (!input.success) {
            send(response, 400, json, JSON.stringify({ error: asked }));
            return;
        }

        // The game starts from the page, open: its clocks wait for the player's Start there.
        newGame.run(input.data, { ...served.context, pageOpen: () => true });
    } catch (error) {
        send(response, 409, json, JSON.stringify(refusalFrom(error)));
        return;
    }

    served.bell.ring();
    send(response, 200, json, JSON.stringify({ started: true }));
}

/** The player's draw from the page (D-65): an offer on their turn, which rings the doorbell, or their answer to the AI's, which rings it when accepted. */
async function drawFromPage(request: IncomingMessage, response: ServerResponse, served: Served): Promise<void>
{
    const asked = 'Send the draw as JSON: {"action": "offer"}, "accept" or "decline".';

    if (!isJson(request)) {
        send(response, 415, json, JSON.stringify({ error: asked }));
        return;
    }

    const action = jsonOf(await bodyOf(request))?.action;

    if (action !== "offer" && action !== "accept" && action !== "decline") {
        send(response, 400, json, JSON.stringify({ error: asked }));
        return;
    }

    try {
        if (action === "offer") {
            offerDraw(served.context);
        } else {
            answerDraw(served.context, action === "accept");
        }
    } catch (error) {
        send(response, 409, json, JSON.stringify(refusalFrom(error, refusalOf(served)?.refusal)));
        return;
    }

    if (action !== "decline") {
        served.bell.ring();
    }

    send(response, 200, json, JSON.stringify({ done: true }));
}

/** The player starts the clocks from the page, which wait from the game's start; the doorbell wakes the chat when its move is first, waiting for this. */
function startFromPage(request: IncomingMessage, response: ServerResponse, served: Served): void
{
    if (!isJson(request)) {
        send(response, 415, json, JSON.stringify({ error: "Send the request as JSON: {}." }));
        return;
    }

    const folder = gameFolder(served.folder);
    const current = loadGame(folder);

    if (current?.clock?.waiting !== true || endOf(current.game) !== undefined) {
        send(response, 409, json, JSON.stringify({ error: "No clock waits to start: start a game with a clock first." }));
        return;
    }

    saveGame(folder, { ...current, clock: clockStarted(current.clock, served.context.now()) });

    if (current.game.position.turn === current.ai) {
        served.bell.ring();
    }

    send(response, 200, json, JSON.stringify({ started: true }));
}

/** The player resigns from the page (D-65), whoever is to move: the game ends and goes to the archive, and the doorbell tells the chat. */
function resignFromPage(request: IncomingMessage, response: ServerResponse, served: Served): void
{
    if (!isJson(request)) {
        send(response, 415, json, JSON.stringify({ error: "Send the request as JSON: {}." }));
        return;
    }

    try {
        endGame.run({ result: "player_resigns" }, served.context);
    } catch (error) {
        send(response, 409, json, JSON.stringify(refusalFrom(error, refusalOf(served)?.refusal === "no-game" ? "no-game" : undefined)));
        return;
    }

    served.bell.ring();
    send(response, 200, json, JSON.stringify({ resigned: true }));
}

/**
 * A game the player brings from elsewhere to analyse (T-92): kept to study and put in analysis as analyse_game does with a PGN, the page showing it at once,
 * and the doorbell rung for the chat to go over it. Never while a game goes on.
 */
async function studyFromPage(request: IncomingMessage, response: ServerResponse, served: Served): Promise<void>
{
    const asked = 'Send the game as JSON: {"pgn": "[White \\"…\\"] … 1. e4 e5 …"}, one to open again by its name: {"game": "study/2026-11-04-153012.pgn"}, '
        + 'or the game just over: {"last": true}.';

    if (!isJson(request)) {
        send(response, 415, json, JSON.stringify({ error: asked }));
        return;
    }

    const body = jsonOf((await bytesOf(request, pgnLimit))?.toString("utf8"));
    const pgn = textOf(body?.pgn);
    const game = textOf(body?.game);
    const last = body?.last === true;

    if (pgn === undefined && game === undefined && !last) {
        send(response, 400, json, JSON.stringify({ error: asked, refusal: "pgn-unreadable" }));
        return;
    }

    if (refusalOf(served)?.refusal !== "no-game") {
        send(response, 409, json, JSON.stringify({ error: "A game is going on: finish it before you bring another to analyse.", refusal: "game-going" }));
        return;
    }

    let reviewed: boolean;

    try {
        // Without what the chat was told: the analyst's instructions stay for the AI's own analyse_game.
        const opened = last ? lastPlayed(served.context) : game === undefined ? kept(served, pgn!) : namedGame(served.context, game);
        reviewed = isReviewed(opened.record);
        // A game not yet reviewed is marked as brought, for status to ask the AI to go over it (T-92); one reviewed is ready, and the chat sleeps on (T-106).
        startAnalysis(gameFolder(served.folder), opened.name, served.context.now(), !reviewed);
    } catch (error) {
        send(response, 400, json, JSON.stringify({ error: (error as Error).message, refusal: "pgn-unreadable" }));
        return;
    }

    if (!reviewed) {
        served.bell.ring();
    }

    send(response, 200, json, JSON.stringify({ kept: true, reviewed }));
}

/** The game just over, or else the last one played, as analyse_game takes it without a name: always one of the archive. */
function lastPlayed(context: Context): { name: string; record: GameRecord; }
{
    const { name, record } = gameToStudy(context);

    if (name === undefined) {
        throw new Error("The game just over is not in the archive yet: try again in a moment.");
    }

    return { name, record };
}

/** A game brought as a PGN, kept to study as analyse_game keeps it: the one already kept when it is the same game, with its review. */
function kept(served: Served, pgn: string): { name: string; record: GameRecord; }
{
    analyseGame.run({ pgn }, { ...served.context, told: undefined });
    return namedGame(served.context, gameInAnalysis(gameFolder(served.folder))!.game);
}

/** The longest PGN the page brings: a long game with its clocks, and the comments a site adds, which go. */
const pgnLimit = 256 * 1024;

/**
 * A request refused, as the page reads it: the server's words, and the code of a refusal the page says in the player's language (T-11), with the characters
 * left for words too long; without a code, the page shows the words.
 */
export interface Refused
{
    readonly error: string;
    readonly refusal?: "no-game" | "ai-to-move" | "illegal" | "clear-chat" | `words-${WordsRefused["reason"]}` | `draw-${DrawRefused["reason"]}` | "profile-game" | "game-going" | "pgn-unreadable";
    readonly most?: number;
}

/** Why the player cannot move now; undefined when they can. */
function refusalOf(served: Served): Refused | undefined
{
    try {
        const current = gameNow(served);

        if (current === undefined || endOf(current.game) !== undefined) {
            return { error: "There is no game going on: start one in the chat.", refusal: "no-game" };
        }

        return current.game.position.turn === current.ai ? { error: "Wait for the AI's move.", refusal: "ai-to-move" } : undefined;
    } catch (error) {
        return { error: (error as Error).message };
    }
}

/** The refusal of an error thrown by a command, with its code when the error or the caller knows it. */
function refusalFrom(error: unknown, refusal?: Refused["refusal"]): Refused
{
    const message = (error as Error).message;

    if (error instanceof ChatNotClear) {
        return { error: message, refusal: "clear-chat" };
    }

    if (error instanceof WordsRefused) {
        return { error: message, refusal: `words-${error.reason}`, most: error.most };
    }

    if (error instanceof DrawRefused) {
        return { error: message, refusal: `draw-${error.reason}` };
    }

    return refusal === undefined ? { error: message } : { error: message, refusal };
}

/** The game as the page reads it now: a flag that has fallen ends it (D-13), and the doorbell tells the chat, which hears how from status (T-37). */
function gameNow(served: Served): CurrentGame | undefined
{
    const folder = gameFolder(served.folder);
    const before = loadGame(folder);

    // The AI's clock is held while nobody hears the player: its flag cannot fall before the chat is there to move.
    if (before !== undefined && aiHeld(served, before)) {
        return before;
    }

    const current = gameAt(folder, served.context.now());

    if (before !== undefined && endOf(before.game) === undefined && current !== undefined && endOf(current.game) !== undefined) {
        served.bell.ring();
    }

    return current;
}

/** Whether the AI's clock is held: a game with a clock, going on, the AI to move, and nobody hearing the player. */
function aiHeld(served: Served, current: CurrentGame): boolean
{
    return !served.bell.listening && current.clock !== undefined && endOf(current.game) === undefined && current.game.position.turn === current.ai;
}

/** The chat calls a tool: when nobody heard the player before, the AI's clock, held since, starts now, with the time it was held given back. */
function chatCalls(served: Served): void
{
    const folder = gameFolder(served.folder);
    const current = loadGame(folder);
    const held = current !== undefined && aiHeld(served, current);

    if (served.bell.chatCalls() && held) {
        saveGame(folder, { ...current, clock: { ...current.clock!, since: served.context.now().toISOString() } });
    }
}

/** The chat has read the game as it is now, at the end of a tool's call: the doorbell wakes it only for what changes it after. */
export function chatHasRead(context: Context): void
{
    context.seen = gameSeen(context);
}

/**
 * Whether the chat has news from the page: a game changed since the chat's last tool, by the player's move, words, draw or resignation, a new game or a
 * flag that fell, or another profile in use, which wakes the chat at the next ring (D-66). The player's words the chat was given change nothing it has not read.
 */
function hasNews(context: Context): boolean
{
    return gameSeen(context) !== context.seen;
}

// The game the chat sees: the profile's folder, and the stamp of its game.json.
function gameSeen(context: Context): string
{
    const folder = gameFolder(context.folder);
    return `${folder}
${gameStamp(folder) ?? ""}`;
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
 * Watches the player's folder, its profiles and the profile in use for changes to the game and the profiles, whoever makes them (the AI's tools, the CLI, a
 * hand edit): the pages hear of them. Each folder is watched on its own, never its whole tree, and watched again after each change, since the profile in
 * use may be another. It returns how to stop watching.
 */
function watchGame(served: Served): () => void
{
    let waiting: NodeJS.Timeout | undefined;
    let watching: FSWatcher[] = [];

    const watchAll = (): void => {
        watching.forEach((watcher) => watcher.close());
        const folders = new Set([served.folder, join(served.folder, "profiles"), gameFolder(served.folder)]);
        watching = [...folders].flatMap((folder) => watchFolder(folder, heard));
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

// A folder watched, without its subfolders; none when it cannot be, or is not there yet: the pages see its files only as they load them.
function watchFolder(folder: string, heard: (name: string | null) => void): FSWatcher[]
{
    try {
        const watcher = watch(folder, (_event, name) => heard(name));
        watcher.on("error", () => watcher.close());
        watcher.unref();
        return [watcher];
    } catch {
        return [];
    }
}

// The current game, the game in analysis, the profile in use, and what a profile keeps (who plays, their picture, their settings); a folder's name, for a
// profile made or gone.
const watched = /^(?:game\.json|analysis\.json|active\.json|profile\.md|settings\.json|avatar\.\w+|[a-z0-9-]+)$/;

/**
 * The game in progress or just ended, as the player may see it: its PGN without the AI's plans while it goes on, the AI's side, when it started, and the
 * talk on the page, each line of the player's with how far it got (D-53), and the draw offer that stands (D-65); the AI's name; and the profiles.
 */
function sendGame(response: ServerResponse, served: Served): void
{
    try {
        const current = gameNow(served);
        const heard = current === undefined ? [] : heardLines(current, served.context.given);
        const talk = current?.talk.map(({ who, text, ply }, index) => heard[index] === undefined ? { who, text, ply } : { who, text, ply, heard: heard[index] });
        const offer = current === undefined ? undefined : drawOfferOf(current);
        const game = current === undefined ? null : {
            pgn: playerPgn(current),
            ai: current.ai,
            started: current.started,
            talk,
            // How many of its first moves are the book's: the page marks them while the game goes on, as the AI's review does after.
            book: bookPlies(current.game.record),
            ...(current.clock === undefined ? {} : { clock: current.clock }),
            ...(offer === undefined ? {} : { drawOffer: offer }),
        };
        const analysis = current === undefined || endOf(current.game) !== undefined ? analysisShown(served) : undefined;
        const body = { game, ...(analysis === undefined ? {} : { analysis }), opponent: served.opponent(), listening: served.bell.listening, ...profilesShown(served.folder) };
        send(response, 200, json, JSON.stringify(body));
    } catch (error) {
        send(response, 500, json, JSON.stringify({ error: (error as Error).message }));
    }
}

/** The game in analysis, once no game goes on (D-69): its name and its PGN with the AI's review; none without one, or when it cannot be read. */
function analysisShown(served: Served): { name: string; pgn: string; book: number; } | undefined
{
    const analysis = gameInAnalysis(gameFolder(served.folder));

    if (analysis === undefined) {
        return undefined;
    }

    try {
        const { name, record } = namedGame(served.context, analysis.game);
        // How far the book goes, which the page cannot tell without the book's moves: its card names the opening on those moves.
        return { name, pgn: writePgn(record), book: bookPlies(record) };
    } catch {
        // A game gone from the archive is no longer shown.
        return undefined;
    }
}

/** A script, style, picture or sound of the page, a module of the core, or a package's module: only from their folders, and only of the types the page uses. */
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

    // A pieces' set loaded again for each piece that moves blanks the pieces drawn from it, at times until the next move (T-88): the browser keeps it an hour.
    send(response, 200, type, bytes, type === types[".svg"] ? { "Cache-Control": "max-age=3600" } : {});
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
