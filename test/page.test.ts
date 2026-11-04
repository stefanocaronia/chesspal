import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "../src/commands/context.ts";
import { commands } from "../src/commands/index.ts";
import { Bell, waitForBell } from "../src/server/bell.ts";
import { chatHasRead, type Page, startPage } from "../src/server/page.ts";
import { testContext } from "./commands.ts";

const opened: Page[] = [];
const folders: string[] = [];

afterEach(async () => {
    await Promise.all(opened.splice(0).map((page) => page.close()));

    for (const folder of folders.splice(0)) {
        rmSync(folder, { recursive: true, force: true });
    }
});

describe("the page's server", () => {
    it("serves the page with its import map, on 127.0.0.1", async () => {
        const page = await open(playerFolder());
        const { status, body, headers } = await get(page, "/");

        expect(page.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
        expect(status).toBe(200);
        expect(body).toContain('<script type="importmap">');
        expect(body).toContain('"chess.js":"/vendor/chess.js"');
        expect(headers["content-security-policy"]).toMatch(/script-src 'self' 'sha256-/);
    });

    it("serves the packages the page imports, and nothing else from node_modules", async () => {
        const page = await open(playerFolder());

        expect((await get(page, "/vendor/chess.js")).body).toContain("class Chess");
        expect((await get(page, "/vendor/preact.js")).status).toBe(200);
        expect((await get(page, "/vendor/zod.js")).status).toBe(404);
        expect(await get(page, "/page/sounds/move.ogg")).toMatchObject({ status: 200, headers: { "content-type": "audio/ogg" } });
        expect((await get(page, "/core/../../package.json")).status).toBe(404);
        expect((await get(page, "/core/%2e%2e/%2e%2e/package.json")).status).toBe(404);
    });

    it("gives the game for the player, without the AI's plans while it goes on", async () => {
        const folder = playerFolder();
        const page = await open(folder);

        expect(JSON.parse((await get(page, "/api/game")).body)).toEqual({ game: null, profiles: [] });
        await run(folder, "new_game", { ai_colour: "black" });
        await run(folder, "player_move", { move: "e4" });
        await run(folder, "ai_move", { move: "e5", plan: "A secret plan.", comment: "The open game." });
        const { game } = JSON.parse((await get(page, "/api/game")).body) as { game: { pgn: string; ai: string; }; };

        expect(game.ai).toBe("black");
        expect(game.pgn).toContain("1. e4 e5 {The open game.}");
        expect(game.pgn).not.toContain("secret");
    });

    it("names the opponent as the host does, once it has connected", async () => {
        let host: string | undefined;
        const page = await open(playerFolder(), () => host);

        expect(JSON.parse((await get(page, "/api/game")).body)).toEqual({ game: null, profiles: [] });
        host = "Claude";
        expect(JSON.parse((await get(page, "/api/game")).body)).toEqual({ game: null, opponent: "Claude", profiles: [] });
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

    it("starts a new game with the colour, the level and the clock the player chose (T-58)", async () => {
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

    it("takes the player's words, alone or with their move, and refuses them in the player's words", async () => {
        const folder = playerFolder();
        const page = await open(folder);

        expect(await post(page, "/api/message", { text: "Hi" })).toMatchObject({ status: 409, body: '{"error":"There is no game going on: start one in the chat.","refusal":"no-game"}' });
        await run(folder, "new_game", { ai_colour: "black" });

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
        expect(JSON.parse(readFileSync(join(folder, "game.json"), "utf8")).talk[0]).toEqual({ who: "player", text: "Hi!", ply: 0, at: new Date(2026, 10, 2, 15, 30, 12).toISOString() });

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
    it("makes the first profile from the wizard, with the game played before, without waking the chat, and keeps the profile while a game goes on", async () => {
        const folder = playerFolder();
        const page = await open(folder);
        const port = Number(new URL(page.url).port);
        await run(folder, "new_game", { ai_colour: "black" });

        expect(JSON.parse((await get(page, "/api/game")).body)).toMatchObject({ profiles: [] });
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
        expect(await post(page, "/api/profile/new", { name: "Bruno" })).toMatchObject({ status: 409, body: expect.stringContaining('"refusal":"profile-game"') });
    });

    it("keeps the picture and the settings of the profile the page shows, never another's, and serves only its image", async () => {
        const folder = playerFolder();
        const page = await open(folder);
        const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
        const served = async (): Promise<{ profile: { avatar?: string; image?: string; }; settings?: object; }> => JSON.parse((await get(page, "/api/game")).body);
        const image = (body: string | Buffer, type = "image/png"): ReturnType<typeof get> => get(page, "/api/profile/image?profile=anna", { "content-type": type }, "POST", body);

        expect((await image(png)).status).toBe(409);
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

        expect(await post(page, "/api/settings?profile=anna", { theme: "dark", dots: false })).toMatchObject({ status: 200 });
        expect((await served()).settings).toEqual({ theme: "dark", dots: false });
        expect((await post(page, "/api/settings?profile=anna", [1])).status).toBe(400);

        // A page that has not yet heard of another profile put in use elsewhere never writes in it.
        expect(await post(page, "/api/settings?profile=bruno", { theme: "light" })).toMatchObject({ status: 409, body: expect.stringContaining("anna is in use now") });
        expect((await post(page, "/api/profile/avatar", { avatar: "cat" })).status).toBe(409);
        expect((await served()).settings).toEqual({ theme: "dark", dots: false });
    });

    it("tells the page of a file it cannot write, and goes on serving", async () => {
        const folder = playerFolder();
        const page = await open(folder);
        await post(page, "/api/profile/new", { name: "Anna" });
        mkdirSync(join(folder, "profiles", "anna", "settings.json"));

        expect((await post(page, "/api/settings?profile=anna", { theme: "dark" })).status).toBe(500);
        expect((await get(page, "/api/game")).status).toBe(200);
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

    it("gives the page the clock, and rings the chat when a flag falls as the page reads the game (T-37)", async () => {
        const folder = playerFolder();
        const base = testContext(folder);
        const start = base.now().getTime();
        let seconds = 0;
        const chat: Context = { ...base, now: () => new Date(start + seconds * 1000) };
        const page = await open(folder, undefined, chat);
        await run(folder, "new_game", { ai_colour: "black", clock: "1+0" }, chat);
        const game = async (): Promise<{ pgn: string; clock: Record<string, unknown>; }> => JSON.parse((await get(page, "/api/game")).body).game;

        expect((await game()).clock).toMatchObject({ left: { white: 60_000, black: 60_000 } });
        seconds = 61;
        expect((await game()).pgn).toContain('[Result "0-1"]');
        expect(await waitForBell(JSON.stringify({ cwd: folder }), [Number(new URL(page.url).port)])).toBe(true);
    });

    it("finds no page for a folder that has none", async () => {
        const page = await open(playerFolder());

        expect(await waitForBell(JSON.stringify({ cwd: playerFolder() }), [Number(new URL(page.url).port)])).toBe(false);
    });
});

async function open(folder: string, opponent?: () => string | undefined, context: Context = testContext(folder)): Promise<Page>
{
    const page = await startPage(context, opponent);
    opened.push(page);
    return page;
}

function playerFolder(): string
{
    const folder = mkdtempSync(join(tmpdir(), "chesspal-page-"));
    folders.push(folder);
    return folder;
}

async function run(folder: string, name: string, input: Record<string, unknown>, context: Context = testContext(folder)): Promise<void>
{
    const command = commands.find((each) => each.name === name)!;

    try {
        await command.run(command.input.parse(input), context);
    } finally {
        // As the MCP server does after each tool.
        chatHasRead(context);
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
