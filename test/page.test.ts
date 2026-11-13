import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, request, type Server } from "node:http";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PositionChanged } from "../src/commands/answers/play-move.ts";
import { status } from "../src/commands/game/status.ts";
import { commands } from "../src/commands/index.ts";
import { type Context, withProfile } from "../src/commands/registry/context.ts";
import { archivedGames, gameInAnalysis, keepThought, noteAiModel, notePondering, saveChatStart, startAnalysis } from "../src/games/index.ts";
import { anchorName } from "../src/page/app/anchor.ts";
import { createProfile, gameFolder } from "../src/profiles/index.ts";
import { Bell, bellHeard, bellLine, codexBellAnswer, notedPagePorts, notePagePort, noteSilence, pageAt, pagePorts, waitForBell } from "../src/server/bell/bell.ts";
import { analysesOf } from "../src/server/page/analyses.ts";
import { chatHasRead, type Page, startPage } from "../src/server/page/page.ts";
import { profilesShown } from "../src/server/page/profiles.ts";
import { version } from "../src/version.ts";
import { testContext } from "./commands.ts";

const opened: Page[] = [];
const folders: string[] = [];

// The profile Chesspal makes at the first start, as the page reads it until the wizard completes it (D-71).
const madeProfile = { id: "player", name: "Player", new: true };
const firstProfile = { profile: madeProfile, profiles: [madeProfile], dataFolder: expect.any(Array) };
// What a chat is told when it would act on a game it was not shown (D-71).
const changed = new PositionChanged().message;

afterEach(async () => {
    await Promise.all(opened.splice(0).map((page) => page.close()));

    for (const folder of folders.splice(0)) {
        rmSync(folder, { recursive: true, force: true });
    }
});

describe("the page's server", () => {
    it("serves the page with its import map, on 127.0.0.1, not to be translated by the browser", async () => {
        const page = await open(playerFolder());
        const { status, body, headers } = await get(page, "/");

        expect(page.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
        expect(status).toBe(200);
        expect(body).toContain('<script type="importmap">');
        expect(body).toContain('"chess.js":"/vendor/chess.js"');
        expect(body).toContain('<html lang="en" translate="no">');
        expect(body).toContain('<meta name="google" content="notranslate">');
        expect(headers["content-security-policy"]).toMatch(/script-src 'self' 'sha256-/);
    });

    it("serves the favicon the page names, the Torretta", async () => {
        const page = await open(playerFolder());
        const href = /<link rel="icon"[^>]* href="([^"]+)"/.exec((await get(page, "/")).body)?.[1];

        expect(href).toBe("/page/layout/favicon.svg");
        expect(await get(page, href!)).toMatchObject({ status: 200, headers: { "content-type": "image/svg+xml" } });
    });

    it("serves the packages the page imports, and nothing else from node_modules", async () => {
        const page = await open(playerFolder());

        expect((await get(page, "/vendor/chess.js")).body).toContain("class Chess");
        expect((await get(page, "/vendor/preact.js")).status).toBe(200);
        expect((await get(page, "/vendor/zod.js")).status).toBe(404);
        expect(await get(page, "/page/sounds/move.ogg")).toMatchObject({ status: 200, headers: { "content-type": "audio/ogg" } });
        expect(await get(page, "/page/guide/en.md")).toMatchObject({ status: 200, headers: { "content-type": "text/markdown; charset=utf-8" } });
        expect((await get(page, "/core/../../package.json")).status).toBe(404);
        expect((await get(page, "/core/%2e%2e/%2e%2e/package.json")).status).toBe(404);
    });

    it("gives the game for the player, without the AI's plans while it goes on", async () => {
        const folder = playerFolder();
        const page = await open(folder);

        // The version that serves the page: a page loaded from another loads again.
        expect(JSON.parse((await get(page, "/api/game")).body)).toEqual({ version, game: null, listening: false, ...firstProfile });
        await run(folder, "new_game", { ai_colour: "black" });
        await run(folder, "player_move", { move: "e4" });
        await run(folder, "ai_move", { move: "e5", plan: "A secret plan.", comment: "The open game." });
        const { game } = JSON.parse((await get(page, "/api/game")).body) as { game: { pgn: string; ai: string; book: number; }; };

        expect(game.ai).toBe("black");
        // Both moves are the book's: the page marks them while the game goes on.
        expect(game.book).toBe(2);
        expect(game.pgn).toContain("1. e4 e5 {The open game.}");
        expect(game.pgn).not.toContain("secret");
    });

    it("names the opponent as the host does, once it has connected, and its model once noted (D-82)", async () => {
        let host: string | undefined;
        const folder = playerFolder();
        const page = await open(folder, () => host);

        expect(JSON.parse((await get(page, "/api/game")).body)).toEqual({ version, game: null, listening: false, ...firstProfile });
        host = "Claude";
        expect(JSON.parse((await get(page, "/api/game")).body)).toEqual({ version, game: null, opponent: "Claude", listening: false, ...firstProfile });
        noteAiModel(gameFolder(folder), { model: "claude-opus-5-5", effort: "xhigh" });
        expect(JSON.parse((await get(page, "/api/game")).body)).toEqual({
            version,
            game: null,
            opponent: "Claude",
            aiModel: { model: "claude-opus-5-5", effort: "xhigh" },
            listening: false,
            ...firstProfile,
        });
    });

    it("tells the page when an older init set the folder up", async () => {
        const folder = playerFolder();
        writeFileSync(join(folder, "AGENTS.md"), "<!-- chesspal: older -->\nOld instructions.\n<!-- chesspal: end -->\n");
        const page = await open(folder);

        expect(JSON.parse((await get(page, "/api/game")).body)).toMatchObject({ outdated: true });
    });

    it("gives the game in analysis, with the AI's review, once no game goes on (D-69)", async () => {
        const folder = playerFolder();
        const page = await open(folder);
        const served = async (): Promise<{ game: object | null; analysis?: { name: string; pgn: string; reviewing?: true; incomplete?: true; }; }> => JSON.parse((await get(page, "/api/game")).body);

        await run(folder, "analyse_game", { pgn: '[White "Ann"]\n[Black "Bob"]\n\n1. e4 e5 2. Qh5 Nc6 *' });
        // Without its review, an AI goes over the game only while a chat is at work: with none at the table, nobody does, and the analysis is incomplete.
        expect((await served()).analysis).toMatchObject({ incomplete: true });
        expect((await served()).analysis?.reviewing).toBeUndefined();
        await page.chatCalls();
        expect((await served()).analysis).toMatchObject({ reviewing: true });
        expect((await served()).analysis?.incomplete).toBeUndefined();
        await run(folder, "annotate_game", { notes: [{ move: "2.", badge: "inaccuracy", note: "early queen" }], summary: "A quiet start." });
        expect((await served()).analysis?.reviewing).toBeUndefined();
        expect((await served()).analysis?.incomplete).toBeUndefined();
        expect(await served()).toMatchObject({ game: null, analysis: { name: "study/2026-11-02-153012.pgn", book: 4 } });
        expect((await served()).analysis?.pgn.replace(/\s+/g, " ")).toContain("{[%review A quiet start.]} 1. e4 {[%badge book]} 1... e5 {[%badge book]} 2. Qh5?! {[%badge inaccuracy] [%review early queen]} 2... Nc6 {[%badge book]}");

        await run(folder, "new_game", { ai_colour: "black" });
        expect((await served()).analysis).toBeUndefined();
    });

    it("says an AI goes over the game in analysis while a chat that hears the player has its analyst on it, not once the chat has started again", async () => {
        const folder = playerFolder();
        const context = testContext(folder);
        const page = await open(folder, undefined, context);
        const kept = "study/2026-11-02-153012.pgn";
        const reviewing = async (): Promise<unknown> => JSON.parse((await get(page, "/api/game")).body).analysis?.reviewing;

        await run(folder, "analyse_game", { pgn: '[White "Ann"]\n[Black "Bob"]\n\n1. e4 e5 2. Qh5 Nc6 *' }, context);
        startAnalysis(gameFolder(context.home()), kept, context.now(), { analyst: { game: kept, run: "analyst-1", since: context.now().toISOString() } });
        expect(await reviewing()).toBeUndefined();

        // The chat's turn has ended and its hook waits for the bell, while the analyst works in the background.
        expect(await shortly(waitForBell(JSON.stringify({ cwd: folder }), [Number(new URL(page.url).port)]))).toBe("waiting");
        expect(await reviewing()).toBe(true);

        // A chat started clean since has no analyst at work any more.
        saveChatStart(folder, { source: "clear", at: new Date(context.now().getTime() + 60_000).toISOString() });
        expect(await reviewing()).toBeUndefined();
    });

    it("lets the analyst go when the chat's Stop hook lists no analyst running, as Claude Code does after it ends, is stopped or fails", async () => {
        const folder = playerFolder();
        const context = testContext(folder);
        const page = await open(folder, undefined, context);
        const kept = "study/2026-11-02-153012.pgn";
        const port = Number(new URL(page.url).port);
        const shown = async (): Promise<unknown> => JSON.parse((await get(page, "/api/game")).body).analysis;
        const running = [{ id: "a1", type: "subagent", status: "running", agent_type: "chesspal-analyst" }];

        await run(folder, "analyse_game", { pgn: '[White "Ann"]\n[Black "Bob"]\n\n1. e4 e5 2. Qh5 Nc6 *' }, context);
        startAnalysis(gameFolder(context.home()), kept, context.now(), { analyst: { game: kept, run: "analyst-1", since: context.now().toISOString() } });
        expect(await shortly(waitForBell(JSON.stringify({ cwd: folder, background_tasks: running }), [port]))).toBe("waiting");
        expect(await shown()).toMatchObject({ reviewing: true });

        // Another agent still running is no analyst.
        const other = [{ ...running[0], agent_type: "chesspal-coach" }];
        expect(await shortly(waitForBell(JSON.stringify({ cwd: folder, background_tasks: other }), [port]))).toBe("waiting");
        expect(await shown()).toMatchObject({ incomplete: true });
        expect(gameInAnalysis(gameFolder(context.home()))?.analyst).toBeUndefined();
    });

    it("counts an analyst that has written nothing for half an hour as gone: the analysis is then incomplete", async () => {
        const folder = playerFolder();
        const started = testContext(folder);
        let now = started.now();
        const context = { ...started, now: () => now };
        const page = await open(folder, undefined, context);
        const kept = "study/2026-11-02-153012.pgn";
        const shown = async (): Promise<unknown> => JSON.parse((await get(page, "/api/game")).body).analysis;

        await run(folder, "analyse_game", { pgn: '[White "Ann"]\n[Black "Bob"]\n\n1. e4 e5 2. Qh5 Nc6 *' }, context);
        startAnalysis(gameFolder(context.home()), kept, now, { analyst: { game: kept, run: "analyst-1", since: now.toISOString() } });
        expect(await shortly(waitForBell(JSON.stringify({ cwd: folder }), [Number(new URL(page.url).port)]))).toBe("waiting");

        // Thinking long without a write is still at work.
        now = new Date(started.now().getTime() + 29 * 60_000);
        expect(await shown()).toMatchObject({ reviewing: true });
        now = new Date(started.now().getTime() + 31 * 60_000);
        expect(await shown()).toMatchObject({ incomplete: true });
    });

    it("keeps a game the player brings to analyse and puts it in analysis, refusing a PGN it cannot read or a game going on", async () => {
        const folder = playerFolder();
        const page = await open(folder);
        const kept = "study/2026-11-02-153012.pgn";

        expect(await post(page, "/api/study", { pgn: "1. e4 e5 2. Ke3 Ke6 3. Kxe5 *" })).toMatchObject({ status: 400, body: expect.stringContaining('"refusal":"pgn-unreadable"') });
        expect(await post(page, "/api/study", { pgn: " " })).toMatchObject({ status: 400 });
        expect(await post(page, "/api/study", { pgn: '[White "Ann"]\n[Black "Bob"]\n\n1. e4 e5 2. Qh5 Nc6 *' })).toMatchObject({ status: 200, body: '{"kept":true,"reviewed":false}' });
        expect(JSON.parse((await get(page, "/api/game")).body)).toMatchObject({ game: null, analysis: { name: kept } });
        expect(await statusOf(folder)).toMatch(new RegExp(`\\nNo game\\.\\nThe player brought ${kept} on the board page to analyse it\\. Next: call analyse_game \\{"game": "${kept}"\\}`));

        // The same game brought again is news again; once the AI goes over it, it is only the game in analysis.
        await run(folder, "analyse_game", { game: kept });
        expect(await statusOf(folder)).toContain(`\nIn analysis on the board page: ${kept} (no review yet); analyse_game {"game": "${kept}"} goes over it with the player.`);
        await post(page, "/api/study", { pgn: '[White "Ann"]\n[Black "Bob"]\n\n1. e4 e5 2. Qh5 Nc6 *' });
        expect(await statusOf(folder)).toContain(`The player brought ${kept} on the board page`);

        await run(folder, "new_game", { ai_colour: "black" });
        expect(await post(page, "/api/study", { pgn: "1. e4 *" })).toMatchObject({ status: 409, body: expect.stringContaining('"refusal":"game-going"') });
        expect(await statusOf(folder)).not.toContain("In analysis");
    });

    it("refuses a game to study by a name no game has as missing, and one there that cannot be read as unreadable", async () => {
        const folder = playerFolder();
        const page = await open(folder);
        mkdirSync(join(gameFolder(folder), "games"), { recursive: true });
        writeFileSync(join(gameFolder(folder), "games", "2026-11-01-100000.pgn"), "1. e4 e5 2. Ke3 Ke6 3. Kxe5 *\n");

        expect(await post(page, "/api/study", { game: "games/2026-11-02-153012.pgn" })).toMatchObject({ status: 400, body: expect.stringContaining('"refusal":"game-missing"') });
        expect(await post(page, "/api/study", { game: "study/2026-11-02-153012.pgn" })).toMatchObject({ status: 400, body: expect.stringContaining('"refusal":"game-missing"') });
        expect(await post(page, "/api/study", { game: "games/2026-11-01-100000.pgn" })).toMatchObject({ status: 400, body: expect.stringContaining('"refusal":"pgn-unreadable"') });
        expect(gameInAnalysis(gameFolder(folder))).toBeUndefined();
    });

    it("keeps the player's words on a game in analysis with the move the page shows, rings the chat for each, and tells it where the player stood (D-101)", async () => {
        const folder = playerFolder();
        // The chat's context, as the MCP server shares it with the page: the bell rings for what changed since the chat's last tool.
        const context = testContext(folder);
        const page = await open(folder, undefined, context);
        const port = Number(new URL(page.url).port);
        const kept = "study/2026-11-02-153012.pgn";
        const hook = JSON.stringify({ cwd: folder });
        await post(page, "/api/study", { pgn: '[White "Ann"]\n[Black "Bob"]\n\n1. e4 e5 2. Qh5 Nc6 *' });
        await run(folder, "analyse_game", { game: kept }, context);

        let waiting = waitForBell(hook, [port]);
        expect(await post(page, "/api/message", { text: "Why the queen?", game: kept, at: 3 })).toMatchObject({ status: 200 });
        expect(await waiting).toBe(true);
        // Words without a position ring only as the first since the AI spoke; on a position, every line does.
        waiting = waitForBell(hook, [port]);
        await post(page, "/api/message", { text: "Hm." });
        expect(await shortly(waiting)).toBe("waiting");
        await post(page, "/api/message", { text: "And at the start?", game: kept, at: 0 });
        expect(await waiting).toBe(true);
        // A position the game does not have is no position.
        await post(page, "/api/message", { text: "Later?", game: kept, at: 9 });

        const { talk } = JSON.parse((await get(page, "/api/game")).body) as { talk: { text: string; shown?: object; }[]; };
        expect(talk.map(({ text, shown }) => ({ text, shown }))).toEqual([
            { text: "Why the queen?", shown: { game: kept, at: 3, move: "2.Qh5" } },
            { text: "Hm.", shown: undefined },
            { text: "And at the start?", shown: { game: kept, at: 0 } },
            { text: "Later?", shown: undefined },
        ]);
        expect(await statusOf(folder)).toContain(
            "Player wrote on the board page, at 2.♛h5: «Why the queen?»\nPlayer wrote on the board page: «Hm.»\nPlayer wrote on the board page, at the start: «And at the start?»",
        );
        expect(await statusOf(folder)).toContain("\nNext: answer the player with ai_say, about the move they were looking at. When they show you something the review missed");

        // Words on a game other than the one in analysis name it.
        startAnalysis(gameFolder(context.home()), "study/2026-11-01-100000.pgn", context.now());
        await post(page, "/api/message", { text: "Back to this one.", game: kept, at: 3 });
        expect(await statusOf(folder)).toContain(`Player wrote on the board page, at 2.♛h5 of ${kept}: «Back to this one.»`);

        // While a game goes on, no game is in analysis: the words keep no position.
        await post(page, "/api/new", {});
        await post(page, "/api/message", { text: "Good luck!", game: kept, at: 3 });
        const playing = JSON.parse((await get(page, "/api/game")).body) as { game: { talk: { text: string; shown?: object; }[]; }; };
        expect(playing.game.talk.at(-1)).toMatchObject({ text: "Good luck!" });
        expect(playing.game.talk.at(-1)?.shown).toBeUndefined();
    });

    it("lists the analyses, opens one again by its name, and takes back a review exported from the page ready, without waking the chat", async () => {
        const folder = playerFolder();
        const page = await open(folder);
        const kept = "study/2026-11-02-153012.pgn";
        const pgn = '[White "Ann"]\n[Black "Bob"]\n[Date "2026.10.01"]\n\n1. e4 e5 2. Qh5 Nc6 *';

        await post(page, "/api/study", { pgn });
        expect(JSON.parse((await get(page, "/api/analyses")).body)).toEqual([{ name: kept, white: "Ann", black: "Bob", date: "2026.10.01", result: "*", opening: expect.any(String), moves: 2, reviewed: false }]);

        await run(folder, "annotate_game", { notes: [{ move: "2.", badge: "inaccuracy", note: "early queen", arrows: ["Rh5f7"] }], summary: "A quiet start." });
        expect(JSON.parse((await get(page, "/api/analyses")).body)).toMatchObject([{ name: kept, reviewed: true }]);
        const exported = JSON.parse((await get(page, "/api/game")).body).analysis.pgn as string;

        // In another folder, the exported game comes in with its review, ready: the chat is not asked to go over it.
        const other = playerFolder();
        const elsewhere = await open(other);
        expect(await post(elsewhere, "/api/study", { pgn: exported })).toMatchObject({ status: 200, body: '{"kept":true,"reviewed":true}' });
        const ready = JSON.parse((await get(elsewhere, "/api/game")).body).analysis.pgn as string;
        expect(ready.replace(/\s+/g, " ")).toContain("{[%review A quiet start.]}");
        expect(ready.replace(/\s+/g, " ")).toContain("2. Qh5?! {[%badge inaccuracy] [%review early queen] [%cal Rh5f7]}");
        expect(await statusOf(other)).toContain("In analysis on the board page");
        expect(await statusOf(other)).not.toContain("brought");

        // Opened again by its name, a reviewed game stays quiet too; a name that is not there is refused.
        expect(await post(page, "/api/study", { game: kept })).toMatchObject({ status: 200, body: '{"kept":true,"reviewed":true}' });
        expect(await post(page, "/api/study", { game: "study/2026-01-01-000000.pgn" })).toMatchObject({ status: 400 });
    });

    it("deletes a game's review, then the game, as the command line does (D-92)", async () => {
        const folder = playerFolder();
        const page = await open(folder);
        const kept = "study/2026-11-02-153012.pgn";
        await post(page, "/api/study", { pgn: '[White "Ann"]\n[Black "Bob"]\n\n1. e4 e5 2. Qh5 Nc6 *' });
        await run(folder, "annotate_game", { notes: [{ move: "2.", badge: "inaccuracy", note: "early queen" }], summary: "A quiet start." });

        for (const route of ["/api/delete-review", "/api/delete-game"]) {
            expect(await post(page, route, {})).toMatchObject({ status: 400, body: expect.stringContaining("Send the game as JSON") });
            expect(await post(page, route, { game: "../../etc/passwd" })).toMatchObject({ status: 409 });
        }

        expect(await post(page, "/api/delete-review", { game: kept })).toMatchObject({ status: 200, body: `{"game":"${kept}","reviewed":true}` });
        expect(JSON.parse((await get(page, "/api/analyses")).body)).toMatchObject([{ name: kept, reviewed: false }]);
        expect(await post(page, "/api/delete-game", { game: kept })).toMatchObject({ status: 200, body: `{"deleted":"${kept}"}` });
        expect(JSON.parse((await get(page, "/api/analyses")).body)).toEqual([]);
        expect(await post(page, "/api/delete-game", { game: kept })).toMatchObject({ status: 409, body: expect.stringContaining("There is no") });
    });

    it("lets the player redo or delete a review begun and never finished, and lists a position brought without moves", async () => {
        const folder = playerFolder();
        const page = await open(folder);
        const listed = async (): Promise<unknown> => JSON.parse((await get(page, "/api/analyses")).body);
        await post(page, "/api/study", { pgn: '[White "Ann"]\n[Black "Bob"]\n\n1. e4 e5 2. Qh5 Nc6 *' });
        // The book's badges are Chesspal's, not a review begun.
        expect(await listed()).toEqual([expect.not.objectContaining({ begun: true })]);
        await run(folder, "annotate_game", { notes: [{ move: "2.", badge: "inaccuracy" }] });
        expect(await listed()).toMatchObject([{ reviewed: false, begun: true }]);
        // «Analyse again» asks for a new review, which status tells the chat.
        const [{ name }] = (await listed()) as [{ name: string; }];
        await post(page, "/api/delete-review", { game: name });
        expect(await post(page, "/api/study", { game: name, redo: true })).toMatchObject({ status: 200 });
        expect(gameInAnalysis(gameFolder(folder))).toMatchObject({ game: name, brought: true, redo: true });

        const other = playerFolder();
        const shown = await open(other);
        await run(other, "analyse_game", { pgn: '[FEN "8/8/4k3/8/8/4K3/8/7R w - - 0 1"]\n[SetUp "1"]\n\n*' });
        expect(JSON.parse((await get(shown, "/api/analyses")).body)).toMatchObject([{ moves: 0, reviewed: false }]);
    });

    it("lists the games of the archive from their tags as it does reading them whole, a game to study read whole", async () => {
        const folder = playerFolder();
        const home = testContext(folder).home();
        const games = join(gameFolder(home), "games");

        for (const from of ["1. e4 c5 2. Nf3 d6 *", '[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]\n\n1. e3 Kd7 *', "1. d4 d5 2. c4 *"]) {
            await run(folder, "new_game", { ai_colour: "black", from, replace: true });
            await run(folder, "end_game", { result: "player_resigns" });
        }

        // One left unfinished, one reviewed, one with a review begun, and a game brought to study, which carries no tags of the archive.
        await run(folder, "new_game", { ai_colour: "white", from: "1. e4 e5 2. Nf3 *", replace: true });
        await run(folder, "new_game", { ai_colour: "black", replace: true });
        await run(folder, "player_move", { move: "e4" });
        await run(folder, "end_game", { result: "player_resigns" });
        const [, unfinished, , , sicilian] = archivedGames(gameFolder(home));
        await run(folder, "annotate_game", { game: sicilian, summary: "Corta." });
        await run(folder, "annotate_game", { game: unfinished, notes: [{ move: "2.", badge: "inaccuracy" }] });
        await run(folder, "analyse_game", { pgn: '[White "Ann"]\n[Black "Bob"]\n[PlyCount "9"]\n[Opening "Not the book\'s"]\n\n1. e4 e5 *' });
        const withTags = analysesOf(home);
        expect(withTags).toHaveLength(6);
        expect(withTags).toEqual(expect.arrayContaining([
            expect.objectContaining({ name: sicilian, reviewed: true, opening: "Sicilian Defense: Modern Variations" }),
            expect.objectContaining({ name: unfinished, begun: true }),
            expect.objectContaining({ white: "Ann", moves: 1, opening: expect.not.stringContaining("Not the book") }),
        ]));

        for (const name of readdirSync(games)) {
            const text = readFileSync(join(games, name), "utf8");
            expect(text).toContain("[PlyCount ");
            writeFileSync(join(games, name), text.replace(/^\[(?:ECO|Opening|PlyCount) .*\]\n/gm, ""));
        }

        expect(analysesOf(home)).toEqual(withTags);
    });

    it("lists the games played, reviewed or not, and opens the one just over for the chat to go over", async () => {
        const folder = playerFolder();
        const page = await open(folder);
        // A game an older Chesspal kept with no move is not listed: there is nothing to analyse.
        mkdirSync(join(gameFolder(folder), "games"), { recursive: true });
        writeFileSync(join(gameFolder(folder), "games", "2026-11-01-100000.pgn"), '[White "Player"]\n[Black "AI"]\n[Result "0-1"]\n\n0-1\n');
        await run(folder, "new_game", { ai_colour: "black" });
        await post(page, "/api/move", { move: "e4" });
        await run(folder, "ai_move", { move: "e5", plan: "A plan.", comment: "Symmetry." });
        noteAiModel(gameFolder(folder), { model: "claude-opus-5-5", effort: "xhigh" });

        expect(await post(page, "/api/study", { last: true })).toMatchObject({ status: 409, body: expect.stringContaining('"refusal":"game-going"') });
        await post(page, "/api/resign", {});
        // With the model the AI played it with, which the list names it by (D-82).
        expect(JSON.parse((await get(page, "/api/analyses")).body)).toMatchObject([{ white: "Player", black: "AI", aiModel: { model: "claude-opus-5-5", effort: "xhigh" }, moves: 1, reviewed: false }]);

        // A link of the page opens it to look at, the chat not asked to go over it; the game named as the archive keeps it.
        const { game } = JSON.parse((await get(page, "/api/game")).body) as { game: { name: string; }; };
        expect(archivedGames(gameFolder(folder))[0]).toBe(game.name);
        expect(await post(page, "/api/study", { game: anchorName(game.name), look: true })).toMatchObject({ status: 200, body: '{"kept":true,"reviewed":false}' });
        expect(await statusOf(folder)).not.toContain("call analyse_game");

        expect(await post(page, "/api/study", { last: true })).toMatchObject({ status: 200, body: '{"kept":true,"reviewed":false}' });
        expect(await statusOf(folder)).toContain("call analyse_game");
    });

    it("refuses the game just over to analyse while the archive does not keep it yet, saying so rather than a PGN it cannot read", async () => {
        const folder = playerFolder();
        const page = await open(folder);
        await run(folder, "new_game", { ai_colour: "black" });
        await post(page, "/api/move", { move: "e4" });
        await run(folder, "ai_move", { move: "e5", plan: "A plan.", comment: "Symmetry." });
        await post(page, "/api/resign", {});
        const { game } = JSON.parse((await get(page, "/api/game")).body) as { game: { name: string; }; };
        rmSync(join(gameFolder(folder), game.name));

        expect(await post(page, "/api/study", { last: true })).toMatchObject({ status: 400, body: expect.stringContaining('"refusal":"game-not-archived"') });
        expect(gameInAnalysis(gameFolder(folder))).toBeUndefined();
    });

    it("answers only at its own address, and changes nothing but by a move", async () => {
        const page = await open(playerFolder());

        expect((await get(page, "/", { host: "example.com" })).status).toBe(403);
        expect((await get(page, "/api/game", { origin: "http://example.com" })).status).toBe(403);
        expect((await post(page, "/api/move", { move: "e4" }, { origin: "http://example.com" })).status).toBe(403);
        expect((await get(page, "/api/bell", { "sec-fetch-site": "cross-site" })).status).toBe(403);
        expect((await get(page, "/", { "sec-fetch-site": "cross-site", "sec-fetch-mode": "navigate" })).status).toBe(200);
        expect((await get(page, "/", {}, "POST")).status).toBe(405);
        expect((await get(page, "/api/bell", {}, "HEAD")).status).toBe(405);
    });
});

describe("the player's moves on the page", () => {
    it("plays the player's move as player_move does, and refuses in the player's words", async () => {
        const folder = playerFolder();
        const page = await open(folder);

        expect(await post(page, "/api/move", { move: "e2e4" })).toMatchObject({ status: 409, body: '{"error":"There is no game going on: start one in the chat.","refusal":"no-game"}' });
        await run(folder, "new_game", { ai_colour: "black" });

        expect(await post(page, "/api/move", { move: "e2e4" })).toMatchObject({ status: 200, body: '{"played":true}' });
        expect(await post(page, "/api/move", { move: "d2d4" })).toMatchObject({ status: 409, body: '{"error":"Wait for the AI\'s move.","refusal":"ai-to-move"}' });
        await run(folder, "ai_move", { move: "e5", plan: "A plan.", comment: "Symmetry." });

        expect(await post(page, "/api/move", { move: "e4e5" })).toMatchObject({ status: 409, body: expect.stringContaining('"refusal":"illegal"') });
        expect((await post(page, "/api/move", { move: "Nf3" }, { "content-type": "text/plain" })).status).toBe(415);
        expect((await post(page, "/api/move", { san: "Nf3" })).status).toBe(400);
        expect(JSON.parse((await get(page, "/api/game")).body).game.pgn).toContain("1. e4 e5 {Symmetry.} *");
    });

    it("refuses a chat's move or resignation on a position another chat or the page changed since a tool showed it the game, never for words (D-71)", async () => {
        const folder = playerFolder();
        const [chat, other] = [testContext(folder), testContext(folder)];
        const page = await open(folder, undefined, chat);
        await run(folder, "new_game", { ai_colour: "black" }, chat);
        await run(folder, "status", {}, other);
        await post(page, "/api/move", { move: "e4" });

        await expect(run(folder, "ai_move", { move: "e5", plan: "A plan." }, chat)).rejects.toThrow(changed);
        // Neither the refusal nor a tool that shows no game shows the chat the position: it moves once one does, whatever words came since.
        await run(folder, "past_games", {}, chat);
        await expect(run(folder, "ai_move", { move: "e5", plan: "A plan." }, chat)).rejects.toThrow(changed);
        await run(folder, "status", {}, chat);
        await post(page, "/api/message", { text: "Your move." });
        await run(folder, "ai_move", { move: "e5", plan: "A plan." }, chat);

        await expect(run(folder, "player_move", { move: "Nf3" }, other)).rejects.toThrow(changed);
        await expect(run(folder, "end_game", { result: "ai_resigns" }, other)).rejects.toThrow(changed);
        // Words on a later move of the game it was shown do no harm.
        await run(folder, "ai_say", { text: "Your turn." }, other);
        expect(JSON.parse((await get(page, "/api/game")).body).game.pgn).toContain("1. e4 e5 *");
    });

    it("refuses a chat's words or game replaced on a game it was never shown, and its own decisions before any tool showed it the game, not the player's move (D-71)", async () => {
        const folder = playerFolder();
        const [chat, other] = [testContext(folder), testContext(folder)];
        await run(folder, "new_game", { ai_colour: "white" }, chat);
        await run(folder, "ai_move", { move: "e4", plan: "A plan." }, chat);
        await run(folder, "status", {}, other);
        await run(folder, "new_game", { ai_colour: "black", replace: true }, chat);

        await expect(run(folder, "ai_say", { text: "Nice bishop." }, other)).rejects.toThrow(changed);
        await expect(run(folder, "new_game", { ai_colour: "black", replace: true }, other)).rejects.toThrow(changed);
        // A chat whose server has just started, as a resumed one, was shown no game: it decides nothing before a tool shows it the game, but plays the player's
        // move, whose answer shows it.
        const fresh = { ...testContext(folder), positionSeen: null };
        await expect(run(folder, "end_game", { result: "ai_resigns" }, fresh)).rejects.toThrow(changed);
        await expect(run(folder, "ai_say", { text: "Hello." }, fresh)).rejects.toThrow(changed);
        await run(folder, "player_move", { move: "d4" }, fresh);
        await run(folder, "ai_move", { move: "d5", plan: "A plan." }, fresh);
    });

    it("starts a new game with the sides of the game before, the one going on archived", async () => {
        const folder = playerFolder();
        const page = await open(folder);

        expect(await post(page, "/api/new", {})).toMatchObject({ status: 200, body: '{"started":true}' });
        expect(JSON.parse((await get(page, "/api/game")).body).game.ai).toBe("black");
        await run(folder, "new_game", { ai_colour: "white", replace: true });
        await run(folder, "ai_move", { move: "e4", plan: "A plan." });

        expect(await post(page, "/api/new", {})).toMatchObject({ status: 200, body: '{"started":true}' });
        const game = JSON.parse((await get(page, "/api/game")).body).game;
        expect(game.ai).toBe("white");
        expect(game.pgn).not.toContain("e4");
        expect((await post(page, "/api/new", {}, { "content-type": "text/plain" })).status).toBe(415);
    });

    it("starts a new game from the page while the chat has not seen the last move made there, since only the page chooses one (D-85)", async () => {
        const folder = playerFolder();
        const chat = testContext(folder);
        const page = await open(folder, undefined, chat);
        await run(folder, "new_game", { ai_colour: "black" }, chat);
        await post(page, "/api/move", { move: "e4" });

        expect(await post(page, "/api/new", {})).toMatchObject({ status: 200, body: '{"started":true}' });
        await expect(run(folder, "new_game", { ai_colour: "black", replace: true }, chat)).rejects.toThrow(changed);
    });

    it("starts a new game with the colour, the level and the clock the player chose", async () => {
        const folder = playerFolder();
        const page = await open(folder);

        expect(await post(page, "/api/new", { ai_colour: "white", level: "club", clock: "10+5" })).toMatchObject({ status: 200 });
        const game = JSON.parse((await get(page, "/api/game")).body).game;
        expect(game.ai).toBe("white");
        expect(game.pgn).toContain('[AILevel "club"]\n[TimeControl "600+5"]');
        expect(game.clock.control).toEqual({ base: 600_000, increment: 5_000 });

        // What the player leaves out: the level of the game before, and no clock.
        expect(await post(page, "/api/new", {})).toMatchObject({ status: 200 });
        const next = JSON.parse((await get(page, "/api/game")).body).game;
        expect(next.pgn).toContain('[AILevel "club"]');
        expect(next.clock).toBeUndefined();
        expect(await post(page, "/api/new", { clock: "none" })).toMatchObject({ status: 200 });
        expect(JSON.parse((await get(page, "/api/game")).body).game.clock).toBeUndefined();
        expect(await post(page, "/api/new", { level: "grandmaster" })).toMatchObject({ status: 400, body: expect.stringContaining("Send the new game as JSON") });
        expect(await post(page, "/api/new", { clock: "forever" })).toMatchObject({ status: 409, body: expect.stringContaining("is not a time control") });
    });

    it("offers a draw on the player's turn, answers the AI's, and resigns, ringing the chat (D-65)", async () => {
        const folder = playerFolder();
        const page = await open(folder);
        const port = Number(new URL(page.url).port);
        const game = async (): Promise<{ pgn: string; drawOffer?: string; }> => JSON.parse((await get(page, "/api/game")).body).game;
        await run(folder, "new_game", { ai_colour: "black" });

        expect(await post(page, "/api/draw", { action: "offer" })).toMatchObject({ status: 409, body: expect.stringContaining('"refusal":"draw-early"') });
        await post(page, "/api/move", { move: "e2e4" });
        expect(await post(page, "/api/draw", { action: "offer" })).toMatchObject({ status: 409, body: expect.stringContaining('"refusal":"ai-to-move"') });
        await run(folder, "ai_move", { move: "e5", plan: "A plan.", offer_draw: true });
        expect((await game()).drawOffer).toBe("ai");
        expect((await game()).pgn).toContain("1. e4 e5 {(=)}");
        expect(await post(page, "/api/draw", { action: "offer" })).toMatchObject({ status: 409, body: expect.stringContaining('"refusal":"draw-offered"') });
        expect(await post(page, "/api/draw", { action: "decline" })).toMatchObject({ status: 200 });
        expect((await game()).drawOffer).toBeUndefined();
        expect(await post(page, "/api/draw", { action: "accept" })).toMatchObject({ status: 409, body: expect.stringContaining('"refusal":"draw-none"') });
        expect((await post(page, "/api/draw", { action: "maybe" })).status).toBe(400);

        const waiting = waitForBell(JSON.stringify({ cwd: folder }), [port]);
        expect(await post(page, "/api/draw", { action: "offer" })).toMatchObject({ status: 200 });
        expect(await waiting).toBe(true);
        expect((await game()).drawOffer).toBe("player");

        expect(await post(page, "/api/resign", {})).toMatchObject({ status: 200, body: '{"resigned":true}' });
        const ended = await game();
        expect(ended.pgn).toContain('[Termination "White resigns"]');
        expect(ended.drawOffer).toBeUndefined();
        expect(await waitForBell(JSON.stringify({ cwd: folder }), [port])).toBe(true);
        expect(await post(page, "/api/resign", {})).toMatchObject({ status: 409, body: expect.stringContaining('"refusal":"no-game"') });
    });

    it("lets the player resign from the page while the chat thinks on the position before their move: the chat's refusals are not the page's", async () => {
        const folder = playerFolder();
        const chat = { ...testContext(folder), positionSeen: null };
        const page = await open(folder, undefined, chat);
        await run(folder, "new_game", { ai_colour: "black" }, chat);
        await post(page, "/api/move", { move: "e2e4" });

        expect(await post(page, "/api/resign", {})).toMatchObject({ status: 200, body: '{"resigned":true}' });
        await expect(run(folder, "ai_move", { move: "e5", plan: "A plan." }, chat)).rejects.toThrow(/changed since you last saw it/);
    });

    it("keeps the first position a tool showed the chat while the game moves on, by which a new game tells a chat that played from one that greeted", async () => {
        const folder = playerFolder();
        const chat = { ...testContext(folder), positionSeen: null };
        const page = await open(folder, undefined, chat);
        await run(folder, "new_game", { ai_colour: "black" }, chat);
        const first = chat.positionSeen;
        await post(page, "/api/move", { move: "e2e4" });
        await run(folder, "status", {}, chat);

        expect(first).toMatchObject({ plies: 0 });
        expect(chat.positionFirstSeen).toEqual(first);
        expect(chat.positionSeen).toMatchObject({ plies: 1 });
    });

    it("takes the player's words, alone or with their move, and refuses them in the player's words", async () => {
        const folder = playerFolder();
        const page = await open(folder);

        // Before the first game the words go in the talk with no game, and the page shows them (D-77).
        expect(await post(page, "/api/message", { text: "Hi" })).toMatchObject({ status: 200, body: '{"said":true}' });
        expect(JSON.parse((await get(page, "/api/game")).body)).toMatchObject({ game: null, talk: [{ who: "player", text: "Hi", ply: 0, heard: "sent" }] });
        await run(folder, "new_game", { ai_colour: "black" });
        expect(JSON.parse((await get(page, "/api/game")).body)).not.toHaveProperty("talk");

        expect(await post(page, "/api/message", { text: "  Hi!  " })).toMatchObject({ status: 200, body: '{"said":true}' });
        // 200 characters a move: the words sent alone count with those sent with the move.
        expect(await post(page, "/api/move", { move: "e4", message: "y".repeat(198) })).toMatchObject({
            status: 409,
            body: '{"error":"The words are 198 characters long: write at most 197 more until the AI\'s next move.","refusal":"words-longer-than-left","most":197}',
        });
        expect(await post(page, "/api/move", { move: "e4", message: "Your turn." })).toMatchObject({ status: 200, body: '{"played":true}' });
        expect(JSON.parse((await get(page, "/api/game")).body).game.talk).toEqual([
            { who: "player", text: "Hi!", ply: 0, heard: "sent" },
            { who: "player", text: "Your turn.", ply: 1, heard: "sent" },
        ]);
        expect(JSON.parse(readFileSync(join(gameFolder(folder), "game.json"), "utf8")).talk[0]).toEqual({ who: "player", text: "Hi!", ply: 0, at: new Date(2026, 10, 2, 15, 30, 12).toISOString() });

        // The words written while the AI thinks count with those of the move, until the AI moves.
        expect(await post(page, "/api/message", { text: "x".repeat(201) })).toMatchObject({
            status: 409,
            body: '{"error":"The words are 201 characters long: write at most 187 more until the AI\'s next move.","refusal":"words-longer-than-left","most":187}',
        });
        expect((await post(page, "/api/message", { text: "x".repeat(187) })).status).toBe(200);
        expect(await post(page, "/api/message", { text: "Hello?" })).toMatchObject({ status: 409, body: expect.stringContaining('"refusal":"words-spent"') });
        await run(folder, "ai_move", { move: "e5", plan: "A plan.", comment: "Symmetry." });
        expect(await post(page, "/api/move", { move: "Nf3", message: "And a move." })).toMatchObject({ status: 200, body: '{"played":true}' });
        expect((await post(page, "/api/message", { text: "Hi" }, { "content-type": "text/plain" })).status).toBe(415);
        expect((await post(page, "/api/message", { text: "  " })).status).toBe(400);
        // A body past 4 KB is cut off where it stands.
        await expect(post(page, "/api/message", { text: "x".repeat(4100) })).rejects.toThrow();

        await run(folder, "ai_move", { move: "Nc6", plan: "A plan.", comment: "Development." });
        expect((await post(page, "/api/move", { move: "Bb5", message: 7 })).status).toBe(400);
        expect(await post(page, "/api/move", { move: "Bb5", message: "x".repeat(201) })).toMatchObject({ status: 409, body: '{"error":"The words are 201 characters long: write at most 200.","refusal":"words-long","most":200}' });
        expect(await post(page, "/api/move", { move: "Bb5", message: "Pin." })).toMatchObject({ status: 200, body: '{"played":true}' });
        expect(JSON.parse((await get(page, "/api/game")).body).game.pgn).toContain("1. e4 e5 {Symmetry.} 2. Nf3 Nc6 {Development.} 3. Bb5 *");
    });

    it("tells the pages when the game changes, by a move or words on the page or through the AI's tools", async () => {
        const folder = playerFolder();
        const page = await open(folder);
        await run(folder, "new_game", { ai_colour: "black" });
        const events = listenTo(page);

        await events.next();
        await post(page, "/api/move", { move: "e4" });
        expect(await events.next()).toBe("data: changed");
        await run(folder, "ai_move", { move: "e5", plan: "A plan.", comment: "Symmetry." });
        expect(await events.next()).toBe("data: changed");
        await post(page, "/api/message", { text: "Why e5?" });
        expect(await events.next()).toBe("data: changed");
        events.close();
    });

    it("says when the game started and how far each of the player's words got, and tells the pages when the chat reads them", async () => {
        const folder = playerFolder();
        const chat = testContext(folder);
        const page = await open(folder, undefined, chat);
        chat.heard = page.heard;
        await run(folder, "new_game", { ai_colour: "black" }, chat);
        const game = async (): Promise<{ started: string; talk: { heard?: string; }[]; }> => JSON.parse((await get(page, "/api/game")).body).game;
        const events = listenTo(page);

        await events.next();
        expect((await game()).started).toBe(new Date(2026, 10, 2, 15, 30, 12).toISOString());
        await post(page, "/api/message", { text: "Ready?" });
        expect(await events.next()).toBe("data: changed");
        expect((await game()).talk.map((line) => line.heard)).toEqual(["sent"]);
        // The chat reads the words: no file changes, but the pages hear of it.
        await run(folder, "look", {}, chat);
        expect(await events.next()).toBe("data: changed");
        expect((await game()).talk.map((line) => line.heard)).toEqual(["read"]);
        await run(folder, "ai_say", { text: "Always." }, chat);
        expect((await game()).talk.map((line) => line.heard)).toEqual(["answered", undefined]);
        events.close();
    });
});

describe("the profiles on the page (D-23, D-45)", () => {
    it("completes the profile Chesspal made from the wizard, with the game played before, without waking the chat, and keeps the profile while a game goes on", async () => {
        const folder = playerFolder();
        const page = await open(folder);
        const port = Number(new URL(page.url).port);
        await run(folder, "new_game", { ai_colour: "black" });

        expect(JSON.parse((await get(page, "/api/game")).body)).toMatchObject({ profile: madeProfile });
        expect(await post(page, "/api/profile/new", { name: " " })).toMatchObject({ status: 400 });

        // Who plays is read at the chat's next call: no turn of its own (D-66).
        const waiting = waitForBell(JSON.stringify({ cwd: folder }), [port]);
        expect(await post(page, "/api/profile/new", { name: "Anna", level: "regular" })).toMatchObject({ status: 200, body: '{"profile":"anna"}' });
        expect(await shortly(waiting)).toBe("waiting");

        const served = JSON.parse((await get(page, "/api/game")).body) as { game: object | null; profile: object; profiles: object[]; };
        expect(served.game).not.toBeNull();
        expect(served.profile).toEqual({ id: "anna", name: "Anna", level: "regular" });
        expect(served.profiles).toEqual([served.profile]);
        expect(await post(page, "/api/profile/use", { profile: "anna" })).toMatchObject({ status: 200 });
        // A player added while a game goes on waits for it to end: the one in use stays, and their picture goes to them.
        expect(await post(page, "/api/profile/new", { name: "Bruno" })).toMatchObject({ status: 200, body: '{"profile":"bruno"}' });
        expect(JSON.parse((await get(page, "/api/game")).body).profile.id).toBe("anna");
        const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
        expect((await get(page, "/api/profile/image?profile=bruno", { "content-type": "image/png" }, "POST", png)).status).toBe(200);
        expect(await post(page, "/api/profile/use", { profile: "bruno" })).toMatchObject({ status: 409, body: expect.stringContaining('"refusal":"profile-game"') });
    });

    it("keeps the picture and the settings of the profile the page shows, never another's, and serves only its image", async () => {
        const folder = playerFolder();
        const page = await open(folder);
        const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
        const served = async (): Promise<{ profile: { avatar?: string; image?: string; accounts?: object; fide?: number; }; settings?: object; }> => JSON.parse((await get(page, "/api/game")).body);
        const image = (body: string | Buffer, type = "image/png"): ReturnType<typeof get> => get(page, "/api/profile/image?profile=anna", { "content-type": type }, "POST", body);

        expect((await get(page, "/api/profile/image?profile=anna", { "content-type": "image/png" }, "POST", png)).status).toBe(404);
        await post(page, "/api/profile/new", { name: "Anna" });

        const sent = await image(png);
        expect(sent.status).toBe(200);
        expect((await served()).profile.image).toBe(JSON.parse(sent.body).image);

        expect(await get(page, "/api/profile/image?profile=anna")).toMatchObject({ status: 200, headers: { "content-type": "image/png" } });
        expect((await get(page, "/api/profile/image?profile=..%2Fanna")).status).toBe(404);
        expect((await image("<svg/>", "text/plain")).status).toBe(415);
        expect((await image("<svg/>")).status).toBe(400);

        expect(await post(page, "/api/profile/avatar?profile=anna", { avatar: "owl" })).toMatchObject({ status: 200 });
        expect((await served()).profile).toMatchObject({ avatar: "owl" });
        expect((await served()).profile.image).toBeUndefined();
        expect((await post(page, "/api/profile/avatar?profile=anna", { avatar: "dragon" })).status).toBe(400);

        expect(await post(page, "/api/profile/edit?profile=anna", { lichess: "anna_k", chesscom: "" })).toMatchObject({ status: 200 });
        expect((await served()).profile.accounts).toEqual({ lichess: "anna_k" });
        expect(await post(page, "/api/profile/edit?profile=anna", { name: "Anna Rossi", level: "casual" })).toMatchObject({ status: 200, body: expect.stringContaining('"name":"Anna Rossi"') });
        expect((await served()).profile).toMatchObject({ id: "anna", name: "Anna Rossi", level: "casual", accounts: { lichess: "anna_k" } });
        expect(await post(page, "/api/profile/edit?profile=anna", { lichess: "anna k" })).toMatchObject({ status: 400, body: expect.stringContaining("only letters") });
        expect((await post(page, "/api/profile/edit?profile=anna", { level: "grandmaster" })).status).toBe(400);
        expect(await post(page, "/api/profile/edit?profile=anna", { fide: 1650 })).toMatchObject({ status: 200 });
        expect((await served()).profile.fide).toBe(1650);
        expect(await post(page, "/api/profile/edit?profile=anna", { fide: 900 })).toMatchObject({ status: 400, body: expect.stringContaining("FIDE's lowest") });
        expect((await post(page, "/api/profile/edit?profile=bruno", { lichess: "bruno" })).status).toBe(409);
        expect((await served()).profile.accounts).toEqual({ lichess: "anna_k" });

        expect(await post(page, "/api/settings?profile=anna", { theme: "dark", dots: false })).toMatchObject({ status: 200 });
        expect((await served()).settings).toEqual({ theme: "dark", dots: false });
        expect((await post(page, "/api/settings?profile=anna", [1])).status).toBe(400);

        // A page that has not yet heard of another profile put in use elsewhere never writes in it.
        expect(await post(page, "/api/settings?profile=bruno", { theme: "light" })).toMatchObject({ status: 409, body: expect.stringContaining("anna is in use now") });
        expect((await post(page, "/api/profile/avatar", { avatar: "cat" })).status).toBe(409);
        expect((await served()).settings).toEqual({ theme: "dark", dots: false });
    });

    it("says where the profiles are, as the file manager walks there from the player's own folder, and opens it there", async () => {
        const folder = playerFolder();
        const opens: string[] = [];
        const page = await open(folder, undefined, {
            ...testContext(folder),
            openFolder: (opened) => {
                opens.push(opened);
                return Promise.resolve(true);
            },
        });
        const dotted = withProfile(join(folder, "..chesspal"), "Player");

        expect(JSON.parse((await get(page, "/api/game")).body).dataFolder.at(-1)).toBe(basename(folder));
        expect(profilesShown(folder, dirname(folder)).dataFolder).toEqual([basename(folder)]);
        expect(profilesShown(folder, dirname(dirname(folder))).dataFolder).toEqual([basename(dirname(folder)), basename(folder)]);
        expect(profilesShown(dotted, folder).dataFolder).toEqual(["..chesspal"]);
        expect(profilesShown(folder, join(folder, "elsewhere")).dataFolder).toEqual(folder.split(/[\\/]+/).filter((name) => name !== ""));

        expect(await post(page, "/api/data-folder/open", {})).toMatchObject({ status: 200 });
        expect(opens).toEqual([folder]);
        // Only as JSON, which another site cannot send without the browser asking first.
        expect((await get(page, "/api/data-folder/open", { "content-type": "text/plain" }, "POST", "{}")).status).toBe(400);
        expect(opens).toHaveLength(1);

        // Once the player completes their profile, their own folder, with the games they played and those they loaded.
        createProfile(folder, { name: "Anna" });
        expect(profilesShown(folder, folder).dataFolder).toEqual(["profiles", "anna"]);
        expect(await post(page, "/api/data-folder/open", {})).toMatchObject({ status: 200 });
        expect(opens.at(-1)).toBe(join(folder, "profiles", "anna"));
    });

    it("opens no folder where nothing can, and says so", async () => {
        const folder = playerFolder();
        const page = await open(folder);
        const managerless = await open(folder, undefined, { ...testContext(folder), openFolder: () => Promise.resolve(false) });

        expect(await post(page, "/api/data-folder/open", {})).toMatchObject({ status: 501, body: expect.stringContaining("shows its path") });
        expect(await post(managerless, "/api/data-folder/open", {})).toMatchObject({ status: 500, body: expect.stringContaining("No file manager") });
    });

    it("tells the page of a file it cannot write, and goes on serving", async () => {
        const folder = playerFolder();
        const page = await open(folder);
        await post(page, "/api/profile/new", { name: "Anna" });
        mkdirSync(join(folder, "profiles", "anna", "settings.json"));

        expect((await post(page, "/api/settings?profile=anna", { theme: "dark" })).status).toBe(500);
        expect((await get(page, "/api/game")).status).toBe(200);
    });

    it("answers a game it cannot read with an error, and goes on serving", async () => {
        const folder = playerFolder();
        const page = await open(folder);
        mkdirSync(gameFolder(folder), { recursive: true });
        writeFileSync(join(gameFolder(folder), "game.json"), "{ not json");

        expect((await post(page, "/api/start", {})).status).toBe(500);
        expect((await get(page, "/api/game")).status).toBe(500);
        expect((await get(page, "/")).status).toBe(200);
    });

    it("does not wake the chat when another profile is put in use, but its game is news at the next ring", async () => {
        const folder = playerFolder();
        const context = testContext(folder);
        const page = await open(folder, undefined, context);
        const port = Number(new URL(page.url).port);
        await run(folder, "new_profile", { name: "Anna" }, context);
        await run(folder, "new_game", { ai_colour: "black" }, context);
        await run(folder, "end_game", { result: "ai_resigns" }, context);
        await run(folder, "new_profile", { name: "Bruno" }, context);

        const waiting = waitForBell(JSON.stringify({ cwd: folder }), [port]);
        expect(await post(page, "/api/profile/use", { profile: "anna" })).toMatchObject({ status: 200 });
        expect(await shortly(waiting)).toBe("waiting");

        expect(await post(page, "/api/new", {})).toMatchObject({ status: 200 });
        expect(await waiting).toBe(true);
    });
});

describe("the doorbell of the chat", () => {
    beforeEach(() => {
        // The tests may run inside a chat of Claude Code, which names its own folder.
        vi.stubEnv("CLAUDE_PROJECT_DIR", undefined);
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("rings the hook that waits, or the next one while it is news, and lets go of a hook another takes the place of", () => {
        let news = true;
        const bell = new Bell(() => news);
        const first = hookAt(bell);
        const second = hookAt(bell);

        expect(first.heard).toBe("dismissed");
        bell.ring();
        expect(second.heard).toBe("ring");
        bell.ring();
        expect(hookAt(bell).heard).toBe("ring");
        bell.ring();
        news = false;
        expect(hookAt(bell).heard).toBeUndefined();
    });

    it("knows whether the chat hears the player: in a turn, or with a hook waiting, never before its first tool or once its hook went", () => {
        let told = 0;
        const bell = new Bell(() => true, () => told++);

        expect(bell.listening).toBe(false);
        expect(bell.chatCalls()).toBe(true);
        expect(bell.chatCalls()).toBe(false);
        expect([bell.listening, told]).toEqual([true, 1]);

        // The turn ends with a hook that waits, then the hook goes without the bell: the chat was stopped or cleared.
        const request = new EventEmitter();
        const response = { writeHead: () => response, end: () => undefined };
        bell.listen(request as never, response as never);
        expect([bell.listening, told]).toEqual([true, 2]);
        request.emit("close");
        expect([bell.listening, told]).toEqual([false, 3]);

        // A ring no hook heard wakes the next hook at once, and the chat is in a turn again.
        bell.ring();
        expect(hookAt(bell).heard).toBe("ring");
        expect([bell.listening, told]).toEqual([true, 4]);
    });

    it("ends the chat's turn at the player's act in a host that runs no hook, but for words while it may think on its move, until a hook waits", () => {
        let told = 0;
        const bell = new Bell(() => true, () => told++);

        bell.chatCalls();
        bell.ring(true);
        expect([bell.listening, told]).toEqual([true, 1]);
        bell.ring();
        expect([bell.listening, bell.inTurn, told]).toEqual([false, false, 2]);
        bell.ring();
        expect(told).toBe(2);
        expect(bell.chatCalls()).toBe(true);

        // A hook that comes hears what the player did meanwhile; from then on only the hooks end a turn, until the chat leaves.
        expect(hookAt(bell).heard).toBe("ring");
        bell.ring();
        expect(bell.listening).toBe(true);
        bell.chatLeft();
        bell.chatCalls();
        bell.ring();
        expect(bell.listening).toBe(false);
    });

    it("holds the AI's clock from the player's move on the page in a host that runs no hook, and starts it when the chat calls a tool", async () => {
        const folder = playerFolder();
        const base = testContext(folder);
        const start = base.now().getTime();
        let seconds = 0;
        const context = { ...base, now: () => new Date(start + seconds * 1000) };
        const page = await open(folder, undefined, context);
        const served = async (): Promise<{ listening: boolean; game: { clock: { since: string; left: { black: number; }; }; }; }> => JSON.parse((await get(page, "/api/game")).body);

        expect(await post(page, "/api/new", { ai_colour: "black", clock: "5+0" })).toMatchObject({ status: 200 });
        page.chatCalls();
        await run(folder, "status", {}, context);
        seconds = 5;
        expect(await post(page, "/api/move", { move: "e4" })).toMatchObject({ status: 200 });
        expect((await served()).listening).toBe(false);

        seconds = 65;
        page.chatCalls();
        expect((await served()).game.clock).toMatchObject({ since: new Date(start + 65_000).toISOString(), left: { black: 300_000 } });
    });

    it("knows whether the doorbell woke the chat in the turn it is in, and tells when it wakes it or the turn ends", () => {
        let told = 0;
        const bell = new Bell(() => true, () => told++);

        bell.chatCalls();
        expect([bell.inTurn, bell.woke, told]).toEqual([true, false, 1]);
        hookAt(bell);
        expect([bell.inTurn, bell.woke, told]).toEqual([false, false, 2]);
        bell.ring();
        expect([bell.inTurn, bell.woke, told]).toEqual([true, true, 3]);
        hookAt(bell);
        expect([bell.inTurn, bell.woke, told]).toEqual([false, false, 4]);
    });

    it("tells the page what the AI thinks on: its move once the chat is on it, the player's time while it ponders, nothing once it waits", async () => {
        const folder = playerFolder();
        const context = testContext(folder);
        const page = await open(folder, undefined, context);
        context.heard = page.heard;
        const thinking = async (): Promise<unknown> => JSON.parse((await get(page, "/api/game")).body).thinking;

        expect(await post(page, "/api/new", { ai_colour: "white" })).toMatchObject({ status: 200 });
        const started = JSON.parse((await get(page, "/api/game")).body).game.started as string;
        expect(await thinking()).toBeUndefined();

        // In a turn on a position it has not seen yet, the chat is not on the AI's move; once a tool showed it, it is, and the page hears it.
        page.chatCalls();
        expect(await thinking()).toBeUndefined();
        const events = listenTo(page);
        await events.next();
        await run(folder, "status", {}, context);
        expect(await events.next()).toBe("data: changed");
        events.close();
        expect(await thinking()).toBe("move");

        await run(folder, "ai_move", { move: "e4", plan: "The centre." }, context);
        expect(await thinking()).toBeUndefined();
        // The ponder agent notes it on disk, as in Codex, where it has a process of its own (D-98).
        const games = gameFolder(context.home());
        notePondering(games, `${started}#1`, true, context.now());
        expect(await thinking()).toBe("ponder");
        notePondering(games, `${started}#0`, true, context.now());
        expect(await thinking()).toBeUndefined();
        notePondering(games, `${started}#1`, true, context.now());
        notePondering(games, `${started}#1`, false, context.now());
        expect(await thinking()).toBeUndefined();
    });

    it("tells the pages of the ponder agent only when its sign comes or goes, not at each thought it keeps", async () => {
        const folder = playerFolder();
        const context = testContext(folder);
        const page = await open(folder, undefined, context);
        const games = gameFolder(context.home());
        const events = listenTo(page);
        const thinking = async (): Promise<unknown> => JSON.parse((await get(page, "/api/game")).body).thinking;

        await events.next();
        await run(folder, "new_game", { ai_colour: "black" }, context);
        expect(await events.next()).toBe("data: changed");
        const key = `${JSON.parse((await get(page, "/api/game")).body).game.started as string}#0`;

        notePondering(games, key, true, context.now());
        expect(await events.next()).toBe("data: changed");
        expect(await thinking()).toBe("ponder");
        notePondering(games, key, false, context.now());
        expect(await events.next()).toBe("data: changed");
        expect(await thinking()).toBeUndefined();
        notePondering(games, key, true, context.now());
        expect(await events.next()).toBe("data: changed");
        expect(await thinking()).toBe("ponder");

        // A thought rewrites the file, and the sign stays: the pages hear nothing.
        keepThought(games, key, { reply: "e4", move: "e5", why: "Symmetry." }, context.now());
        expect(await Promise.race([events.next(), new Promise((done) => setTimeout(() => done("nothing"), 300))])).toBe("nothing");
        events.close();
    });

    it("shows the AI on its move as soon as the doorbell wakes the chat for the player's act on the page, before it reads the position", async () => {
        const folder = playerFolder();
        const page = await open(folder);
        const served = async (): Promise<{ listening: boolean; thinking?: string; }> => JSON.parse((await get(page, "/api/game")).body);

        // The game started on the page rings at once the hook of the chat that ends its turn.
        expect(await post(page, "/api/new", { ai_colour: "white" })).toMatchObject({ status: 200 });
        expect((await get(page, "/api/bell")).body).toBe("ring");
        expect((await served()).thinking).toBe("move");

        // Its turn ends without a move: nothing, until the player's words wake it again.
        const hook = get(page, "/api/bell");

        while ((await served()).thinking !== undefined) {
            await new Promise((done) => setTimeout(done, 10));
        }

        await post(page, "/api/message", { text: "Your move." });
        expect((await hook).body).toBe("ring");
        expect((await served()).thinking).toBe("move");
    });

    it("holds the AI's clock while no chat hears the player, and starts it when the chat calls a tool", async () => {
        const folder = playerFolder();
        const base = testContext(folder);
        const start = base.now().getTime();
        let seconds = 0;
        const page = await open(folder, undefined, { ...base, now: () => new Date(start + seconds * 1000) });
        const game = async (): Promise<{ pgn: string; clock: { since: string; }; }> => JSON.parse((await get(page, "/api/game")).body).game;

        expect(await post(page, "/api/new", { ai_colour: "white", clock: "0.5+0" })).toMatchObject({ status: 200 });
        expect(await post(page, "/api/start", {})).toMatchObject({ status: 200 });
        seconds = 31;
        expect((await game()).pgn).toContain('[Result "*"]');
        expect(JSON.parse((await get(page, "/api/game")).body).listening).toBe(false);

        page.chatCalls();
        expect((await game()).clock.since).toBe(new Date(start + 31_000).toISOString());
        seconds = 62;
        expect((await game()).pgn).toContain('[Result "0-1"]');
    });

    it("rings the chat when the player presses Start and the AI is to move", async () => {
        const folder = playerFolder();
        const page = await open(folder);
        const port = Number(new URL(page.url).port);
        const hook = JSON.stringify({ cwd: folder });
        await post(page, "/api/new", { ai_colour: "white", clock: "5+0" });
        expect(await waitForBell(hook, [port])).toBe(true);

        const waiting = waitForBell(hook, [port]);
        expect(await Promise.race([waiting, new Promise((done) => setTimeout(() => done("waiting"), 300))])).toBe("waiting");
        await post(page, "/api/start", {});
        expect(await waiting).toBe(true);
    });

    it("opens the New game window on the pages that watch, when the chat asks for a game", async () => {
        const page = await open(playerFolder());
        expect(page.askNewGame()).toBe(false);
        const events = listenTo(page);

        await events.next();
        expect(page.askNewGame()).toBe(true);
        expect(await events.next()).toBe("data: new-game");
        events.close();
    });

    it("keeps quiet for the player's words once the chat has read them, and rings for their move", async () => {
        const folder = playerFolder();
        const chat = testContext(folder);
        const page = await open(folder, undefined, chat);
        const port = Number(new URL(page.url).port);
        const hook = JSON.stringify({ cwd: folder });
        await run(folder, "new_game", { ai_colour: "black" }, chat);
        await run(folder, "player_move", { move: "e4" }, chat);
        await run(folder, "ai_move", { move: "e5", plan: "A plan.", comment: "Symmetry." }, chat);

        // Written while the chat works: status gives the words before its turn ends, so the hook that comes then waits.
        await post(page, "/api/message", { text: "Why e5?" });
        await run(folder, "status", {}, chat);
        const waiting = waitForBell(hook, [port]);
        const heard = await Promise.race([waiting, new Promise((done) => setTimeout(() => done("waiting"), 300))]);

        expect(heard).toBe("waiting");
        // The first words of a move rang already: the next ones wait for the AI's next call.
        await post(page, "/api/message", { text: "Are you there?" });
        expect(await Promise.race([waiting, new Promise((done) => setTimeout(() => done("waiting"), 300))])).toBe("waiting");
        await post(page, "/api/move", { move: "Nf3" });
        expect(await waiting).toBe(true);
    });

    it("takes the player's words between games without the move's count, and rings for the first since the AI spoke (D-74)", async () => {
        const folder = playerFolder();
        const chat = testContext(folder);
        const page = await open(folder, undefined, chat);
        const port = Number(new URL(page.url).port);
        const hook = JSON.stringify({ cwd: folder });
        await run(folder, "new_game", { ai_colour: "black", from: "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1" }, chat);
        await post(page, "/api/move", { move: "Rd8" });
        await run(folder, "status", {}, chat);

        const first = waitForBell(hook, [port]);
        await new Promise((done) => setTimeout(done, 50));
        expect((await post(page, "/api/message", { text: "x".repeat(190) })).status).toBe(200);
        expect(await first).toBe(true);

        // A line holds 200 characters, as in a game, but none counts against the next.
        expect(await post(page, "/api/message", { text: "x".repeat(201) })).toMatchObject({ status: 409, body: expect.stringContaining('"refusal":"words-long"') });
        expect((await post(page, "/api/message", { text: "y".repeat(190) })).status).toBe(200);
        await run(folder, "ai_say", { text: "Well played." }, chat);

        const second = waitForBell(hook, [port]);
        await new Promise((done) => setTimeout(done, 50));
        expect((await post(page, "/api/message", { text: "Another?" })).status).toBe(200);
        expect(await second).toBe(true);
    });

    it("tells the hook whose page it is, the chat's folder first, and rings when the player moves there", async () => {
        const folder = playerFolder();
        const page = await open(folder);
        const port = Number(new URL(page.url).port);
        const hook = JSON.stringify({ session_id: "a-chat", cwd: join(folder, "games") });
        vi.stubEnv("CLAUDE_PROJECT_DIR", folder);
        await run(folder, "new_game", { ai_colour: "black" });

        expect(JSON.parse((await get(page, "/api/bell?probe")).body)).toMatchObject({ folder: resolve(folder) });

        const waiting = waitForBell(hook, [port]);
        await new Promise((done) => setTimeout(done, 50));
        await post(page, "/api/move", { move: "e4" });

        expect(await waiting).toBe(true);
    });

    it("keeps the news of a game the player ended on the page while no hook waited", async () => {
        const folder = playerFolder();
        const page = await open(folder);
        await run(folder, "new_game", { ai_colour: "black", from: "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1" });
        await post(page, "/api/move", { move: "Rd8" });
        // The watcher hears of the mate before the hook comes.
        await new Promise((done) => setTimeout(done, 200));

        expect(await waitForBell(JSON.stringify({ cwd: folder }), [Number(new URL(page.url).port)])).toBe(true);
    });

    it("keeps quiet for a game over the chat has read, and rings for what changes after (D-65)", async () => {
        const folder = playerFolder();
        const chat = testContext(folder);
        const page = await open(folder, undefined, chat);
        const hook = JSON.stringify({ cwd: folder });
        const port = Number(new URL(page.url).port);
        await run(folder, "new_game", { ai_colour: "black" }, chat);
        await post(page, "/api/resign", {});
        await run(folder, "status", {}, chat);
        const waiting = waitForBell(hook, [port]);

        expect(await Promise.race([waiting, new Promise((done) => setTimeout(() => done("waiting"), 300))])).toBe("waiting");
        await post(page, "/api/new", {});
        expect(await waiting).toBe(true);
    });

    it("gives the page the clock, and rings the chat when a flag falls as the page reads the game", async () => {
        const folder = playerFolder();
        const base = testContext(folder);
        const start = base.now().getTime();
        let seconds = 0;
        const chat: Context = { ...base, now: () => new Date(start + seconds * 1000), pageOpen: () => true };
        const page = await open(folder, undefined, chat);
        await run(folder, "new_game", { ai_colour: "black", clock: "1+0" }, chat);
        const game = async (): Promise<{ pgn: string; clock: Record<string, unknown>; }> => JSON.parse((await get(page, "/api/game")).body).game;

        // The clocks wait for the player to start them.
        expect((await game()).clock).toMatchObject({ waiting: true });
        seconds = 30;
        expect((await game()).clock).toMatchObject({ left: { white: 60_000, black: 60_000 } });
        expect(await post(page, "/api/start", {})).toMatchObject({ status: 200, body: '{"started":true}' });
        expect(await post(page, "/api/start", {})).toMatchObject({ status: 409, body: expect.stringContaining("No clock waits to start") });

        expect((await game()).clock).toMatchObject({ left: { white: 60_000, black: 60_000 } });
        seconds = 91;
        expect((await game()).pgn).toContain('[Result "0-1"]');
        expect(await waitForBell(JSON.stringify({ cwd: folder }), [Number(new URL(page.url).port)])).toBe(true);
    });

    it("hears a page that answered while the process asking was stalled, and gives up on a port that never answers", async () => {
        const page = await open(playerFolder());
        const asked = pageAt(Number(new URL(page.url).port));
        // A stall longer than a probe waits, as on a busy computer: its timer fires before the answer waiting is read.
        const until = Date.now() + 1200;

        while (Date.now() < until) {
            // Stalled.
        }

        expect(await asked).toMatchObject({ open: false });

        const silent = createServer(() => undefined);
        await new Promise<void>((done) => silent.listen(0, "127.0.0.1", done));

        try {
            expect(await pageAt((silent.address() as { port: number; }).port)).toBeUndefined();
        } finally {
            silent.closeAllConnections();
            silent.close();
        }
    });

    it("finds no page for a folder that has none", async () => {
        const page = await open(playerFolder());

        expect(await waitForBell(JSON.stringify({ cwd: playerFolder() }), [Number(new URL(page.url).port)])).toBe(false);
    });

    it("wakes Codex with a Stop hook's block and the same fixed line, never the move", () => {
        expect(JSON.parse(codexBellAnswer)).toEqual({ decision: "block", reason: bellLine });
    });

    it("says why a hook heard no bell: no page of its folder, or another hook took its place", async () => {
        const other = playerFolder();
        const port = Number(new URL((await open(other)).url).port);
        const folder = playerFolder();
        const lost = await bellHeard(JSON.stringify({ cwd: folder }), [port]);

        expect(lost).toEqual({ folder: resolve(folder), rang: false, why: `no page of it at ports ${port}; ${port} is ${resolve(other)}'s` });

        const hook = JSON.stringify({ cwd: other });
        const first = bellHeard(hook, [port]);
        await new Promise((done) => setTimeout(done, 100));
        void bellHeard(hook, [port]);
        expect(await first).toEqual({ folder: resolve(other), rang: false, why: `the page at port ${port} said "dismissed"` });
    });

    it("waits at the page a browser has open when its folder has several and none says the chat's session, as with Codex", async () => {
        const folder = playerFolder();
        const left = await open(folder);
        const played = await open(folder);
        const ports = [left, played].map((page) => Number(new URL(page.url).port));
        const hook = JSON.stringify({ cwd: folder });

        expect(await bellHeard(hook, ports)).toMatchObject({ rang: false, why: expect.stringContaining(`2 pages of it, none of this chat's session, 0 open in a browser at ports ${ports.join(", ")};`) });

        const browser = listenTo(played);
        await browser.next();
        const first = bellHeard(hook, ports);

        // The open page hears the first hook before the second takes its place.
        for (let tries = 0; JSON.parse((await get(played, "/api/game")).body).listening !== true; tries++) {
            expect(tries).toBeLessThan(200);
            await new Promise((done) => setTimeout(done, 10));
        }

        void bellHeard(hook, ports);
        expect(await first).toEqual({ folder: resolve(folder), rang: false, why: `the page at port ${ports[1]} said "dismissed"` });
        browser.close();
    });

    it("finds the chat's page at the port it noted in the data folder when its usual ones are taken, and forgets the note as the page closes", async () => {
        const folder = playerFolder();
        vi.stubEnv("CHESSPAL_HOME", folder);
        const taken = await takeUsualPorts(folder);

        try {
            const page = await open(folder);
            const port = Number(new URL(page.url).port);

            expect(pagePorts(folder)).not.toContain(port);
            expect(page.findable).toBe(true);
            expect(notedPagePorts(folder, folder)).toEqual([port]);

            await run(folder, "new_game", { ai_colour: "black" });
            const waiting = bellHeard(JSON.stringify({ cwd: folder }));
            await untilListening(page);
            await post(page, "/api/move", { move: "e4" });

            expect(await waiting).toEqual({ folder: resolve(folder), rang: true });

            await page.close();
            expect(existsSync(join(folder, "pages", `${port}.json`))).toBe(false);
        } finally {
            await taken.close();
        }
    });

    it("keeps the note of a page that answers late, busy, and forgets those where nobody listens or another folder's page answers", async () => {
        const home = playerFolder();
        const folder = playerFolder();
        const wait = 100;
        const late = createServer((_request, response) => {
            setTimeout(() => response.end(JSON.stringify({ session: null, folder, open: true })), wait * 5);
        });
        const another = createServer((_request, response) => response.end(JSON.stringify({ session: null, folder: playerFolder(), open: true })));
        const [latePort, anotherPort] = await Promise.all([late, another].map(async (server) => {
            await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
            return (server.address() as { port: number; }).port;
        }));
        const [gone, own] = [await portGone(), await portGone()];
        mkdirSync(join(home, "pages"));

        for (const port of [latePort!, anotherPort!, gone]) {
            writeFileSync(join(home, "pages", `${port}.json`), JSON.stringify({ folder }));
        }

        try {
            await notePagePort(home, folder, own, wait);
            expect(notedPagePorts(home, folder).sort()).toEqual([latePort!, own].sort());
        } finally {
            for (const server of [late, another]) {
                server.closeAllConnections();
                server.close();
            }
        }
    });

    it("ignores a note of a page gone, and the next page of its folder clears it, as one whose port another folder's page took", async () => {
        const folder = playerFolder();
        vi.stubEnv("CHESSPAL_HOME", folder);
        const another = Number(new URL((await open(playerFolder())).url).port);
        mkdirSync(join(folder, "pages"));
        writeFileSync(join(folder, "pages", `${await portGone()}.json`), JSON.stringify({ folder }));
        writeFileSync(join(folder, "pages", `${another}.json`), JSON.stringify({ folder }));
        const taken = await takeUsualPorts(folder);

        try {
            const page = await open(folder);
            const port = Number(new URL(page.url).port);

            for (let tries = 0; notedPagePorts(folder, folder).length > 1; tries++) {
                expect(tries).toBeLessThan(300);
                await new Promise((done) => setTimeout(done, 10));
            }

            expect(notedPagePorts(folder, folder)).toEqual([port]);

            // A page that ended without forgetting its note, as a chat closed at once.
            writeFileSync(join(folder, "pages", `${await portGone()}.json`), JSON.stringify({ folder }));
            await run(folder, "new_game", { ai_colour: "black" });
            const waiting = bellHeard(JSON.stringify({ cwd: folder }));
            await untilListening(page);
            await post(page, "/api/move", { move: "e4" });

            expect(await waiting).toEqual({ folder: resolve(folder), rang: true });
        } finally {
            await taken.close();
        }
    });

    it("says the doorbell cannot find a page off its usual ports whose port it could not note", async () => {
        const folder = playerFolder();
        const taken = await takeUsualPorts(folder);

        try {
            const page = await open(folder, undefined, {
                ...testContext(folder),
                home: () => {
                    throw new Error("No data folder.");
                },
            });

            expect(page.findable).toBe(false);
            expect(existsSync(join(folder, "pages"))).toBe(false);
        } finally {
            await taken.close();
        }
    });

    it("moves a folder's ports by CHESSPAL_PORT_SHIFT, a multiple of ten under a thousand, which keeps runs side by side apart, and by nothing else", () => {
        const folder = playerFolder();
        vi.stubEnv("CHESSPAL_PORT_SHIFT", "0");
        const usual = pagePorts(folder);
        const offset = usual[0]! - 5870;

        expect(usual).toEqual([5870 + offset, 6870 + offset, 7870 + offset]);
        expect(offset).toBeLessThan(10);

        vi.stubEnv("CHESSPAL_PORT_SHIFT", "990");
        expect(pagePorts(folder)).toEqual(usual.map((port) => port + 990));

        for (const shift of ["1000", "15", "-10", "ten"]) {
            vi.stubEnv("CHESSPAL_PORT_SHIFT", shift);
            expect(pagePorts(folder)).toEqual(usual);
        }
    });

    it("logs the hooks that heard no bell in the chat's folder, keeping the last hundred", () => {
        const folder = playerFolder();

        for (let index = 0; index < 101; index++) {
            noteSilence(folder, `silence ${index}`, new Date(Date.UTC(2026, 10, 5, 0, 0, index)));
        }

        const lines = readFileSync(join(folder, "listen.log"), "utf8").trimEnd().split("\n");
        expect(lines).toHaveLength(100);
        expect(lines[0]).toBe("2026-11-05T00:00:01.000Z silence 1");
        expect(lines.at(-1)).toBe("2026-11-05T00:01:40.000Z silence 100");
    });
});

async function open(folder: string, opponent?: () => string | undefined, context: Context = testContext(folder)): Promise<Page>
{
    const page = await startPage(context, opponent === undefined ? {} : { opponent });
    opened.push(page);
    return page;
}

/** Holds a folder's usual ports with servers that are no page, as other programs may: its page then starts elsewhere. Those already taken stay so. */
async function takeUsualPorts(folder: string): Promise<{ close: () => Promise<void>; }>
{
    const servers: Server[] = await Promise.all(
        pagePorts(folder).map((port) =>
            new Promise<Server>((done) => {
                const server = createServer((request, response) => response.writeHead(404).end());
                server.once("error", () => done(server));
                server.listen(port, "127.0.0.1", () => done(server));
            })
        ),
    );
    return { close: () => Promise.all(servers.map((server) => new Promise<void>((done) => server.close(() => done())))).then(() => undefined) };
}

/** A port no page answers at any more. */
async function portGone(): Promise<number>
{
    const server = createServer();
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const { port } = server.address() as { port: number; };
    await new Promise<void>((done) => server.close(() => done()));
    return port;
}

/** Waits until the page knows a hook listens at its doorbell. */
async function untilListening(page: Page): Promise<void>
{
    for (let tries = 0; JSON.parse((await get(page, "/api/game")).body).listening !== true; tries++) {
        expect(tries).toBeLessThan(300);
        await new Promise((done) => setTimeout(done, 10));
    }
}

function playerFolder(): string
{
    const folder = mkdtempSync(join(tmpdir(), "chesspal-page-"));
    folders.push(folder);
    return folder;
}

async function statusOf(folder: string): Promise<string>
{
    return status.format(await status.run({}, testContext(folder)));
}

async function run(folder: string, name: string, input: Record<string, unknown>, context: Context = testContext(folder)): Promise<void>
{
    const command = commands.find((each) => each.name === name)!;
    let refused = false;

    try {
        await command.run(command.input.parse(input), context);
    } catch (error) {
        refused = error instanceof PositionChanged;
        throw error;
    } finally {
        // As the MCP server does after each tool.
        chatHasRead(context, command.showsGame === true && !refused);
    }
}

function get(page: Page, path: string, headers: Record<string, string> = {}, method = "GET", sentBody?: string | Buffer): Promise<{ status: number; body: string; headers: Record<string, unknown>; }>
{
    const url = new URL(path, page.url);
    return new Promise((done, fail) => {
        // The path as written: URL would resolve the dots away. A connection of its own: a page closed by the test before may have had the same port.
        const sent = request({ host: url.hostname, port: url.port, path, method, agent: false, headers: { host: url.host, ...headers } }, (response) => {
            let body = "";
            response.setEncoding("utf8");
            response.on("data", (chunk: string) => body += chunk);
            response.on("end", () => done({ status: response.statusCode ?? 0, body, headers: response.headers }));
        });
        sent.on("error", fail);
        sent.end(sentBody);
    });
}

/** A hook waiting at a bell, and what it heard, once it did. */
function hookAt(bell: Bell): { heard?: string; }
{
    const hook: { heard?: string; } = {};
    const response = { writeHead: () => response, end: (text: string) => hook.heard = text };
    bell.listen(new EventEmitter() as never, response as never);
    return hook;
}

/** What the hook heard within a short while: "waiting" while the bell has not rung. */
function shortly(waiting: Promise<boolean>): Promise<boolean | string>
{
    return Promise.race([waiting, new Promise<string>((done) => setTimeout(() => done("waiting"), 300))]);
}

function post(page: Page, path: string, value: unknown, headers: Record<string, string> = {}): ReturnType<typeof get>
{
    return get(page, path, { "content-type": "application/json", ...headers }, "POST", JSON.stringify(value));
}

/** The events a page hears, one at a time, from the first: the server's greeting, then each change. */
function listenTo(page: Page): { next: () => Promise<string>; close: () => void; }
{
    const url = new URL("/api/events", page.url);
    const heard: string[] = [];
    const waiting: ((event: string) => void)[] = [];
    let text = "";
    const sent = request({ host: url.hostname, port: url.port, path: url.pathname, headers: { host: url.host } }, (response) => {
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
            text += chunk;
            const events = text.split("\n\n");
            text = events.pop() ?? "";

            for (const event of events) {
                const taker = waiting.shift();

                if (taker === undefined) {
                    heard.push(event);
                } else {
                    taker(event);
                }
            }
        });
    });
    sent.on("error", () => undefined);
    sent.end();
    return {
        next: () => heard.length > 0 ? Promise.resolve(heard.shift()!) : new Promise((done) => waiting.push(done)),
        close: () => sent.destroy(),
    };
}
