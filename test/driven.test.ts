import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { newGame, startNewGame } from "../src/commands/game/new.ts";
import { type Context, PositionChanged } from "../src/commands/index.ts";
import { aiSay } from "../src/commands/talk/index.ts";
import { endOf, loadGame, positionShownNote } from "../src/games/index.ts";
import { tableFolder } from "../src/home/index.ts";
import { analystAgent } from "../src/host-files/index.ts";
import type { ChatOptions, HostChat, HostDriver, HostEvent } from "../src/hosts/index.ts";
import { activeProfile, gameFolder, saveProfileSettings } from "../src/profiles/index.ts";
import { Bell, type BellListener } from "../src/server/bell/index.ts";
import { doorVariable, keyVariable } from "../src/server/door/index.ts";
import { chatInPage, drivenChats, failureCode, failureOf, keepChat, keptChat } from "../src/server/driven/index.ts";
import type { TableChats } from "../src/server/page/index.ts";
import { type TablePlaces, tablePlaces } from "../src/server/places/index.ts";
import { startTable, type Table, type TableTimes } from "../src/server/table/index.ts";
import { version } from "../src/version.ts";
import { playedHere, testContext } from "./commands.ts";
import { removeFolder } from "./folders.ts";
import { sent } from "./http.ts";
import { sitAt } from "./place-client.ts";
import { onFreePorts } from "./ports.ts";

const folders: string[] = [];
const tables: Table[] = [];
const clients: Client[] = [];

afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close().catch(() => undefined)));
    await Promise.all(tables.splice(0).map((table) => table.close()));
    await Promise.all(folders.splice(0).map(removeFolder));
});

const longGame = "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7";

describe("the doorbell with a listener of the table's own", () => {
    it("rings at once a listener for a ring it missed, lets one go for the next, and hears when one goes without it", () => {
        const bell = new Bell(() => true, () => undefined, () => false, () => undefined, () => "the game");
        const heard: string[] = [];
        const listener = (name: string): BellListener => ({ rung: (game) => void heard.push(`${name} ${game ?? "alone"}`), dismissed: () => void heard.push(`${name} dismissed`) });

        bell.ring();
        bell.wait(listener("first"));
        expect(heard).toEqual(["first the game"]);
        expect(bell.inTurn).toBe(true);

        bell.wait(listener("second"));
        bell.wait(listener("third"));
        expect(heard.at(-1)).toBe("second dismissed");
        expect([bell.listening, bell.inTurn]).toEqual([true, false]);

        bell.chatPrompted();
        expect(heard.at(-1)).toBe("third dismissed");

        const gone = bell.wait(listener("fourth"));
        gone();
        expect([bell.listening, bell.deaf]).toEqual([false, true]);
        bell.ring();
        expect(heard.at(-1)).toBe("third dismissed");
    });

    it("keeps a ring for a hooked chat in its turn until the turn ends, which one never hooked would take for out of it", () => {
        const hooked = new Bell();
        hooked.chatHooked();
        hooked.chatCalls();
        hooked.ring();
        expect(hooked.listening).toBe(true);

        const never = new Bell();
        never.chatCalls();
        never.ring();
        expect(never.listening).toBe(false);
    });
});

describe("what a chat the table drives failed of", () => {
    it("tells apart the host's words it knows, and keeps of a program that ended by itself its last words, else its exit code", () => {
        expect(failureCode("Not logged in · Please run /login")).toBe("not-signed-in");
        expect(failureCode("the host's program ended (exit code 1): Not logged in | Please run /login")).toBe("not-signed-in");
        expect(failureCode("Invalid API key · Please run /login")).toBe("not-signed-in");
        expect(failureCode("Claude AI usage limit reached|1764000000")).toBe("usage-limit");
        expect(failureCode("5-hour limit reached ∙ resets 3pm")).toBe("usage-limit");
        expect(failureCode("You've hit your usage limit.")).toBe("usage-limit");
        expect(failureCode("spawn C:\\Users\\player\\.local\\bin\\claude.exe ENOENT")).toBe("program-missing");
        expect(failureCode("the host's program ended (exit code 4294967295)")).toBe("program-ended");
        expect(failureCode("the host runs the model claude-haiku instead of claude-opus")).toBe("other");

        expect(failureOf("the host's program ended (exit code 4294967295)", 3)).toEqual({
            why: "exit code 4294967295",
            code: "program-ended",
            number: 3,
        });
        expect(failureOf("the host's program ended (exit code 1): Segmentation fault", 4)).toEqual({ why: "Segmentation fault", code: "program-ended", number: 4 });
        expect(failureOf("Not logged in · Please run /login", 1)).toEqual({ why: "Not logged in · Please run /login", code: "not-signed-in", number: 1 });
    });
});

describe("the chat the table drives", () => {
    it("plays a game through its place: attached, held, moved by the bell with the game, the player's words read, a move written alone, stopped and woken", async () => {
        const { table, home, ai } = await drivenTable();
        expect(await opened(table.url)).toEqual({ status: 200, text: JSON.stringify({ opened: true }) });
        await until(() => ai.chats.length === 1 && ai.chats[0]!.idle());
        const chat = ai.chats[0]!;

        expect(chat.options).toMatchObject({ model: "sonnet", effort: "medium", allowed: ["chesspal"], folder: join(home, "chats", "opponent") });
        expect(chat.options.server).toMatchObject({ name: "chesspal", command: "node", args: ["cli.js", "mcp"] });
        expect(chat.options.instructions).toContain("open the chat again from the board page");
        expect(chat.options.instructions).not.toContain("reopen this chat in this folder");
        expect(Object.keys(chat.options.server!.environment).sort()).toEqual([doorVariable, keyVariable].sort());
        expect(chat.sent).toEqual(["Let's play!"]);
        expect(chat.calls).toEqual(["instructions", "status"]);
        expect((await shown(table.url)).table).toMatchObject({ chat: true, host: "claude", held: true, started: { model: "sonnet", effort: "medium" }, driven: true });

        // A new game: the chat, which has only greeted the player, hears it from the bell.
        expect((await posted(table.url, "/api/new", { ai_colour: "black" })).status).toBe(200);
        await until(() => chat.sent.length === 2 && chat.idle());
        expect(ai.chats).toHaveLength(1);

        // The player moves: the bell sends the game, and the AI moves on it without status; its answer says the table wakes it.
        // Its server gives no instructions of its own: the chat has the table's.
        const serverInstructions: (string | undefined)[] = [];
        chat.turns.push(async (client) => {
            serverInstructions.push(client.getInstructions());
            chat.answers.push(await call(client, "ai_move", { move: "e5", plan: "Hold the centre." }));
        });
        expect((await posted(table.url, "/api/move", { move: "e4" })).status).toBe(200);
        await until(() => chat.sent.length === 3 && chat.idle());
        expect(chat.sent[2]).toMatch(/^The player acted on the board page\. Here is the game now, as status shows it: don't call status for it, decide on it\.\n/);
        expect(chat.calls.slice(2)).toEqual(["ai_move"]);
        expect(chat.answers[0]!.isError).toBe(false);
        expect(chat.answers[0]!.text).toContain("Next: end your turn: the table wakes you with the player's move, already played.");
        expect(chat.answers[0]!.text).not.toContain("player_move");
        // No browser has the page open here: still no board to copy, the player has the page in front of them.
        expect(chat.answers[0]!.text).not.toContain("No board page is open");
        expect(serverInstructions).toEqual([undefined]);
        expect(sans(home)).toEqual(["e4", "e5"]);
        expect(existsSync(join(chat.options.folder, "position-shown.json"))).toBe(false);
        expect(positionShownNote(chat.options.folder)).toBeUndefined();
        const atRest = await shown(table.url);
        expect(atRest.thinking).toBeUndefined();
        expect(atRest.aiModel).toMatchObject({ model: "claude-sonnet", effort: "medium" });

        // The player's words reach the AI with the game, which counts them read though the turn calls no tool.
        expect((await posted(table.url, "/api/message", { text: "Nice opening!" })).status).toBe(200);
        await until(() => chat.sent.length === 4 && chat.idle());
        expect(chat.sent[3]).toContain("Nice opening!");
        expect(chat.sent[3]!.split("Nice opening!")).toHaveLength(2);
        expect(chat.calls).toHaveLength(3);
        expect((await shown(table.url)).game?.talk?.find((line) => line.text === "Nice opening!")?.heard).toBe("read");

        // A move written alone in the message box the table plays, and the bell rings for it.
        chat.turns.push(async (client) => void chat.answers.push(await call(client, "ai_move", { move: "Nc6", plan: "Develop." })));
        expect(await posted(table.url, "/api/message", { text: "Nf3" })).toEqual({ status: 200, text: JSON.stringify({ said: true, played: true }) });
        await until(() => chat.sent.length === 5 && chat.idle());
        expect(sans(home)).toEqual(["e4", "e5", "Nf3", "Nc6"]);

        // Nothing to stop at rest; a turn stopped waits at the bell, and the player's next act wakes the chat.
        expect((await posted(table.url, "/api/table/stop", {})).status).toBe(409);
        chat.turns.push(() => new Promise<void>(() => undefined));
        expect((await posted(table.url, "/api/move", { move: "Bc4" })).status).toBe(200);
        await until(() => chat.sent.length === 6 && !chat.idle());
        expect(await posted(table.url, "/api/table/stop", {})).toEqual({ status: 200, text: JSON.stringify({ stopping: true }) });
        await until(() => chat.idle());
        expect(chat.ends.at(-1)).toBe("interrupted");
        chat.turns.push(async (client) => void chat.answers.push(await call(client, "ai_move", { move: "Nf6", plan: "Develop." })));
        expect((await posted(table.url, "/api/message", { text: "Your move." })).status).toBe(200);
        await until(() => chat.sent.length === 7 && chat.idle());
        expect(sans(home).at(-1)).toBe("Nf6");
        expect(ai.chats).toHaveLength(1);
    }, 30_000);

    it("runs in a folder of the data folder's, outside the table's: no folder above it, up to the data folder, holds a host's files", async () => {
        const { table, home, ai } = await drivenTable();
        await opened(table.url);
        await until(() => ai.chats.length === 1 && ai.chats[0]!.idle());
        const hostFiles = [".claude", "CLAUDE.md", "AGENTS.md"];

        for (let folder = ai.chats[0]!.options.folder; folder.startsWith(home); folder = dirname(folder)) {
            expect(hostFiles.filter((name) => existsSync(join(folder, name)))).toEqual([]);
        }

        expect(keptChat(join(home, "chats"))).toMatchObject({ host: "claude", session: ai.chats[0]!.session, closed: false });
        expect(keptChat(join(home, "chats"))).not.toHaveProperty("model");
    }, 30_000);

    it("starts again clean for a new game from the page once it has played, and with the model the player changed: no /clear asked", async () => {
        const { table, home, ai } = await drivenTable();
        await opened(table.url);
        await until(() => ai.chats.length === 1 && ai.chats[0]!.idle());
        const first = ai.chats[0]!;
        await posted(table.url, "/api/new", { ai_colour: "black" });
        await until(() => first.sent.length === 2 && first.idle());
        first.turns.push(async (client) => void (await call(client, "ai_move", { move: "e5", plan: "Hold the centre." })));
        await posted(table.url, "/api/move", { move: "e4" });
        await until(() => first.sent.length === 3 && first.idle());

        expect(await posted(table.url, "/api/new", { ai_colour: "black" })).toEqual({ status: 200, text: JSON.stringify({ started: true }) });
        await until(() => ai.chats.length === 2 && ai.chats[1]!.idle());
        expect(first.closed).toBe(true);
        expect(ai.chats[1]!.options.session).toBeUndefined();
        expect(ai.chats[1]!.sent).toEqual(["Let's play!"]);
        await until(async () => (await shown(table.url)).table?.chat === true);

        // The player chooses another model on the page, and the chat starts again with it.
        saveProfileSettings(home, activeProfile(home).id, { [chatInPage]: true, claudeModel: "opus", claudeEffort: "high" });
        expect(await posted(table.url, "/api/table/restart", { host: "claude" })).toEqual({ status: 200, text: JSON.stringify({ restarting: true }) });
        await until(() => ai.chats.length === 3 && ai.chats[2]!.idle());
        expect(ai.chats[2]!.options).toMatchObject({ model: "opus", effort: "high" });
        await until(async () => (await shown(table.url)).table?.started?.model === "opus");
    }, 30_000);

    it("starts a new game from the page with the page's own sight, never asking for /clear for a chat in a terminal that sat at the table before", async () => {
        const { table, home, ai } = await drivenTable();
        // A chat in a terminal played here before, and its start is still noted in the table's folder.
        writeFileSync(join(tableFolder(home), "chat.json"), JSON.stringify({ source: "startup", at: "2026-11-20T10:00:00.000Z", session: "old-session" }));
        startNewGame(newGame.input.parse({ ai_colour: "black", from: longGame, replace: true }), { ...homeContext(home), pageOpen: () => true }, "page");
        playedHere(gameFolder(home));
        await opened(table.url);
        await until(() => ai.chats.length === 1 && ai.chats[0]!.idle());

        expect(await posted(table.url, "/api/new", { ai_colour: "black" })).toEqual({ status: 200, text: JSON.stringify({ started: true }) });
    }, 30_000);

    it("starts again clean when the chat itself begins a new game after a long one, in place of asking the player for /clear", async () => {
        const { table, home, ai } = await drivenTable();
        await opened(table.url);
        await until(() => ai.chats.length === 1 && ai.chats[0]!.idle());
        const chat = ai.chats[0]!;

        // A long game the chat has played, its own moves; the player's words wake it on it.
        startNewGame(newGame.input.parse({ ai_colour: "black", from: longGame, replace: true }), { ...homeContext(home), pageOpen: () => true }, "page");
        playedHere(gameFolder(home));
        chat.turns.push(async (client) => void chat.answers.push(await call(client, "new_game", { ai_colour: "white", from: "8/8/8/4k3/8/8/4K3/7Q w - - 0 1", replace: true })));
        await posted(table.url, "/api/message", { text: "Let's start from an ending." });
        await until(() => ai.chats.length === 2 && ai.chats[1]!.idle());

        expect(chat.answers[0]).toMatchObject({ isError: false });
        expect(chat.answers[0]!.text).not.toContain("/clear");
        expect(chat.closed).toBe(true);
        expect(ai.chats[1]!.sent[0]).toBe("Let's play!");
    }, 30_000);

    it("has a new game wait for the chat at work on a long game, then starts it again clean; after an update the next table opens a clean one", async () => {
        const { table, home, ai, chats, withdrawn } = await drivenTable();
        await opened(table.url);
        await until(() => ai.chats.length === 1 && ai.chats[0]!.idle());
        const chat = ai.chats[0]!;
        startNewGame(newGame.input.parse({ ai_colour: "black", from: longGame, replace: true }), { ...homeContext(home), pageOpen: () => true }, "page");
        playedHere(gameFolder(home));
        chat.turns.push(() => new Promise<void>(() => undefined));
        await posted(table.url, "/api/message", { text: "Think it over." });
        await until(() => chat.sent.length === 2 && !chat.idle());

        expect(await posted(table.url, "/api/new", { ai_colour: "black" })).toEqual({ status: 200, text: JSON.stringify({ waiting: true }) });
        expect(ai.chats).toHaveLength(1);
        await posted(table.url, "/api/table/stop", {});
        await until(() => ai.chats.length === 2 && ai.chats[1]!.idle());
        expect(chat.closed).toBe(true);
        expect(withdrawn).toEqual(["opponent"]);
        expect(sans(home)).toEqual([]);

        // An update asks the page for the chat of the table's folder again (D-108): it closes, and the table started next opens a clean one.
        await until(async () => (await shown(table.url)).table?.chat === true);
        expect(keptChat(join(home, "chats"))?.session).toBe(ai.chats[1]!.session);
        expect(chats.relaunch(tableFolder(home), undefined, true)).toBe(true);
        expect(ai.chats[1]!.closed).toBe(true);
        expect(withdrawn).toEqual(["opponent", "opponent"]);
        expect(ai.chats).toHaveLength(2);
        expect(keptChat(join(home, "chats"))).toMatchObject({ closed: false, session: undefined });
    }, 30_000);

    it("leaves the table when its host ends, and the page hears what it said, or its exit code alone, with the code of why; the table closes the chat it drives as it closes", async () => {
        const { table, home, ai } = await drivenTable();
        await opened(table.url);
        await until(() => ai.chats.length === 1 && ai.chats[0]!.idle());
        await posted(table.url, "/api/new", { ai_colour: "black" });
        await until(() => ai.chats[0]!.sent.length === 2 && ai.chats[0]!.idle());

        ai.chats[0]!.emit({ type: "ended", why: "the host's program ended (exit code 1)" });
        await until(async () => (await shown(table.url)).table?.chat === false);
        expect((await shown(table.url)).table?.failed).toEqual({
            why: "exit code 1",
            code: "program-ended",
            number: 1,
        });
        expect(keptChat(join(home, "chats"))?.closed).toBe(true);
    }, 30_000);

    it("lets go a chat whose first turn fails before it says which chat it is, and the page says why with its code", async () => {
        const { table, ai } = await drivenTable();
        ai.failFirst = true;
        await opened(table.url);
        await until(() => ai.chats.length === 1 && ai.chats[0]!.closed);
        await until(async () => (await shown(table.url)).table?.failed !== undefined);
        const table1 = (await shown(table.url)).table;
        expect(table1).toMatchObject({ chat: false, failed: { why: "Not logged in · Please run /login", code: "not-signed-in", number: 1 } });
        expect(table1).not.toHaveProperty("opening");
    }, 30_000);

    it("leaves every host to the terminal with the switch off, and every other host with it on", async () => {
        const off = await drivenTable(undefined, undefined, undefined, false);
        await opened(off.table.url);
        expect(off.terminal.opened).toEqual(["claude"]);
        expect(off.ai.chats).toEqual([]);

        const on = await drivenTable();
        await opened(on.table.url, "codex");
        expect(on.terminal.opened).toEqual(["codex"]);
        expect(on.ai.chats).toEqual([]);
    }, 30_000);

    it("opens Claude Code in a terminal where the driver does not find its program, as one npm installed", async () => {
        const ai = fakeDriver();
        ai.missing = true;
        const { table, terminal } = await drivenTable(undefined, ai);
        expect(await opened(table.url)).toEqual({ status: 200, text: JSON.stringify({ opened: false }) });
        expect(terminal.opened).toEqual(["claude"]);
        expect(ai.chats).toEqual([]);
        expect((await shown(table.url)).table).not.toHaveProperty("failed");
    }, 30_000);

    it("lets the table close when no browser uses it, closing the chat, which it keeps for its next start", async () => {
        const { table, home, ai } = await drivenTable(undefined, undefined, undefined, true, { idle: 300, every: 50 });
        await opened(table.url);
        await until(() => ai.chats.length === 1 && ai.chats[0]!.idle());
        let closed = false;
        void table.closed.then(() => (closed = true));
        await until(() => closed, 5_000);
        expect(ai.chats[0]!.closed).toBe(true);
        expect(keptChat(join(home, "chats"))).toMatchObject({ session: ai.chats[0]!.session, closed: false });
    }, 30_000);
});

describe("the chat the table drives, across the table's restarts", () => {
    it("is taken up again only while the game it played goes on: else the player's request opens a clean one", async () => {
        const first = await drivenTable();
        const { home, ai, context } = first;
        await opened(first.table.url);
        await until(() => ai.chats.length === 1 && ai.chats[0]!.idle());
        await first.table.close();

        const again = await drivenTable(home, ai, context);
        const page = await eventsOf(again.table.url);

        try {
            await pause(300);
            expect(ai.chats).toHaveLength(1);
            await opened(again.table.url);
            await until(() => ai.chats.length === 2 && ai.chats[1]!.idle());
            expect(ai.chats[1]!.options.session).toBeUndefined();
        } finally {
            page.destroy();
        }
    }, 30_000);

    it("at the AI's move, rings the chat taken up again at once, its clock given back the time the table was gone, once a page is open", async () => {
        const home = temporary();
        const { context, ahead } = movingContext(home);
        const ai = fakeDriver();
        const first = await drivenTable(home, ai, context);
        await opened(first.table.url);
        await until(() => ai.chats.length === 1 && ai.chats[0]!.idle());
        await posted(first.table.url, "/api/new", { ai_colour: "black", clock: "10+5" });
        await until(() => ai.chats[0]!.sent.length === 2 && ai.chats[0]!.idle());
        await posted(first.table.url, "/api/start", {});
        ai.chats[0]!.turns.push(() => new Promise<void>(() => undefined));
        await posted(first.table.url, "/api/move", { move: "e4" });
        await until(() => ai.chats[0]!.sent.length === 3);
        await first.table.close();

        // Fifteen minutes go by with no table, more than the AI's ten.
        ahead.ms = 15 * 60_000;
        ai.queued.push(async (client) => void (await call(client, "ai_move", { move: "e5", plan: "Hold the centre." })));
        const again = await drivenTable(home, ai, context);
        await pause(300);
        expect(ai.chats).toHaveLength(1);
        const page = await eventsOf(again.table.url);

        try {
            await until(() => ai.chats.length === 2 && ai.chats[1]!.sent.length === 1 && ai.chats[1]!.idle());
            const chat = ai.chats[1]!;
            expect(chat.options.session).toBe(ai.chats[0]!.session);
            expect(chat.sent[0]).toMatch(/^The player acted on the board page\. Here is the game now/);
            expect(sans(home)).toEqual(["e4", "e5"]);
            expect(endOf(loadGame(gameFolder(home))!.game)).toBeUndefined();
            expect(loadGame(gameFolder(home))!.clock!.left.black).toBeGreaterThan(9 * 60_000);
            expect((await shown(again.table.url)).table).toMatchObject({ chat: true, driven: true });
        } finally {
            page.destroy();
        }
    }, 30_000);

    it("at the player's move, waits for it without a word, and counts as a chat that has played: a new game from the page starts it again clean", async () => {
        const first = await drivenTable();
        const { home, ai, context } = first;
        await opened(first.table.url);
        await until(() => ai.chats.length === 1 && ai.chats[0]!.idle());
        await posted(first.table.url, "/api/new", { ai_colour: "black" });
        await until(() => ai.chats[0]!.sent.length === 2 && ai.chats[0]!.idle());
        await first.table.close();

        const again = await drivenTable(home, ai, context);
        const page = await eventsOf(again.table.url);

        try {
            await until(async () => (await shown(again.table.url)).table?.chat === true);
            const chat = ai.chats[1]!;
            expect(chat.options.session).toBe(ai.chats[0]!.session);
            await pause(200);
            expect(chat.sent).toEqual([]);

            // The player's move wakes it.
            chat.turns.push(async (client) => void (await call(client, "status")));
            await posted(again.table.url, "/api/move", { move: "e4" });
            await until(() => chat.sent.length >= 1 && chat.idle());
            expect(chat.sent[0]).toMatch(/^The player acted on the board page/);
            await until(async () => (await shown(again.table.url)).table?.noMove === true);

            expect(await posted(again.table.url, "/api/new", { ai_colour: "black" })).toEqual({ status: 200, text: JSON.stringify({ started: true }) });
            await until(() => ai.chats.length === 3 && ai.chats[2]!.idle());
            expect(chat.closed).toBe(true);
            expect(ai.chats[2]!.options.session).toBeUndefined();
        } finally {
            page.destroy();
        }
    }, 30_000);

    it("starts no process while a chat in a terminal is at the table, which it leaves as it is", async () => {
        const home = temporary();
        const context = homeContext(home);
        startNewGame(newGame.input.parse({ ai_colour: "black", replace: true }), { ...context, pageOpen: () => true }, "page");
        keepChat(join(home, "chats"), { host: "claude", session: "kept-session", game: loadGame(gameFolder(home))!.started, closed: false });
        const { table, ai } = await drivenTable(home, fakeDriver(), context);
        const terminal = await terminalAttached(table.url, join(home, "elsewhere"));
        const hook = await hookWaiting(table.url);
        const page = await eventsOf(table.url);

        try {
            await pause(300);
            expect(ai.chats).toEqual([]);
            expect(await Promise.race([hook.heard, pause(200).then(() => "waiting")])).toBe("waiting");
            expect((await opened(table.url)).status).toBe(409);
            expect(ai.chats).toEqual([]);
        } finally {
            page.destroy();
            terminal.leave();
        }
    }, 30_000);
});

describe("the turns of the chat the table drives", () => {
    it("tells the page a turn at work for anything, and a chat the player stopped until something wakes it", async () => {
        const { table, ai } = await drivenTable();
        await opened(table.url);
        await until(() => ai.chats.length === 1 && ai.chats[0]!.idle());
        const chat = ai.chats[0]!;
        await posted(table.url, "/api/new", { ai_colour: "black" });
        await until(() => chat.sent.length === 2 && chat.idle());
        expect((await shown(table.url)).table).not.toHaveProperty("atWork");

        chat.turns.push(() => new Promise<void>(() => undefined));
        await posted(table.url, "/api/message", { text: "Hello there." });
        await until(() => chat.sent.length === 3 && !chat.idle());
        expect((await shown(table.url)).table).toMatchObject({ atWork: true });

        await posted(table.url, "/api/table/stop", {});
        await until(async () => (await shown(table.url)).table?.stopped === true);
        expect((await shown(table.url)).table).not.toHaveProperty("atWork");

        await posted(table.url, "/api/message", { text: "Still there?" });
        await until(() => chat.sent.length === 4 && chat.idle());
        expect((await shown(table.url)).table).not.toHaveProperty("stopped");
    }, 30_000);

    it("asks once more for the AI's move a turn did not make, then holds the AI's clock; after a Stop it holds it at once", async () => {
        const home = temporary();
        const { context, ahead } = movingContext(home);
        // The clock moves an hour ahead, which a table with no browser would take for idle time.
        const { table, ai } = await drivenTable(home, fakeDriver(), context, true, { idle: 3_600_000, every: 10 });
        await opened(table.url);
        await until(() => ai.chats.length === 1 && ai.chats[0]!.idle());
        const chat = ai.chats[0]!;
        await posted(table.url, "/api/new", { ai_colour: "black", clock: "10+5" });
        await until(() => chat.sent.length === 2 && chat.idle());
        await posted(table.url, "/api/start", {});

        // Two turns without a move: the second is the table's, and then the clock is held.
        await posted(table.url, "/api/move", { move: "e4" });
        await until(async () => (await shown(table.url)).table?.noMove === true);
        expect(chat.sent).toHaveLength(4);
        expect(chat.sent[3]).toMatch(/^It is your move, and the player waits for it: here is the game now, as status shows it\./);
        ahead.ms = 20 * 60_000;
        await shown(table.url);
        expect(endOf(loadGame(gameFolder(home))!.game)).toBeUndefined();

        // The player's words wake it, with its time given back.
        chat.turns.push(async (client) => void chat.answers.push(await call(client, "ai_move", { move: "e5", plan: "Hold the centre." })));
        await posted(table.url, "/api/message", { text: "Your move?" });
        await until(() => chat.sent.length === 5 && chat.idle());
        expect(chat.answers.map((one) => one.isError)).toEqual([false]);
        expect(sans(home)).toEqual(["e4", "e5"]);
        expect((await shown(table.url)).table).not.toHaveProperty("noMove");

        // A turn stopped by the player is not asked again: the clock is held at once.
        chat.turns.push(() => new Promise<void>(() => undefined));
        await posted(table.url, "/api/move", { move: "Nf3" });
        await until(() => chat.sent.length === 6 && !chat.idle());
        await posted(table.url, "/api/table/stop", {});
        await until(async () => (await shown(table.url)).table?.stopped === true);
        await pause(200);
        expect(chat.sent).toHaveLength(6);
        // Every page shows the clock where it stood as the chat stalled, however late it loads; it runs on from there once the chat is woken.
        const clockNow = async () => ((await raw(table.url)).game as { clock: { since: string; held?: string; }; }).clock;
        const held = (await clockNow()).held;
        expect(held).toBeDefined();
        expect(Date.parse(held!)).toBeGreaterThanOrEqual(Date.parse((await clockNow()).since));
        ahead.ms = 40 * 60_000;
        expect((await clockNow()).held).toBe(held);
        expect(endOf(loadGame(gameFolder(home))!.game)).toBeUndefined();
        const before = loadGame(gameFolder(home))!.clock!;
        chat.turns.push(async (client) => void chat.answers.push(await call(client, "ai_move", { move: "Nc6", plan: "Develop." })));
        await posted(table.url, "/api/message", { text: "Go on." });
        await until(() => chat.answers.length === 2 && chat.idle());
        expect(chat.answers[1]!.isError).toBe(false);
        // The AI used before the Stop the time between its clock's start and the stall, and no more.
        const used = Date.parse(held!) - Date.parse(before.since);
        expect(before.left.black - loadGame(gameFolder(home))!.clock!.left.black).toBeGreaterThanOrEqual(used - 5_000);
        expect(before.left.black - loadGame(gameFolder(home))!.clock!.left.black).toBeLessThan(used + 60_000);
    }, 30_000);

    it("rings at every line the player writes to it, and lets the AI answer each", async () => {
        const { table, home, ai } = await drivenTable();
        await opened(table.url);
        await until(() => ai.chats.length === 1 && ai.chats[0]!.idle());
        const chat = ai.chats[0]!;
        await posted(table.url, "/api/new", { ai_colour: "black" });
        await until(() => chat.sent.length === 2 && chat.idle());

        const answer = (text: string) => async (client: Client) => void chat.answers.push(await call(client, "ai_say", { text }));
        chat.turns.push(answer("Hello!"), answer("Yes, I am here."));
        await posted(table.url, "/api/message", { text: "Hi." });
        await until(() => chat.sent.length === 3 && chat.idle());
        await posted(table.url, "/api/message", { text: "Are you there?" });
        await until(() => chat.sent.length === 4 && chat.idle());
        expect(chat.answers.map((one) => one.isError)).toEqual([false, false]);

        // Lines written while a turn runs go together in the next.
        const busy = gate();
        chat.turns.push(async () => await busy.passed, answer("Both read."));
        await posted(table.url, "/api/message", { text: "One." });
        await until(() => chat.sent.length === 5 && !chat.idle());
        await posted(table.url, "/api/message", { text: "Two." });
        await posted(table.url, "/api/message", { text: "Three." });
        busy.open();
        await until(() => chat.sent.length === 6 && chat.idle());
        expect(chat.sent[5]).toContain("Two.");
        expect(chat.sent[5]).toContain("Three.");
        expect(chat.answers.at(-1)!.isError).toBe(false);
        await pause(200);
        expect(chat.sent).toHaveLength(6);
        expect(loadGame(gameFolder(home))!.talk.filter((line) => line.who === "ai").map((line) => line.text)).toEqual(["Hello!", "Yes, I am here.", "Both read."]);
    }, 30_000);

    it("lets the AI answer a line given to it in a tool's answer, written before its words, and never speak twice with nothing new", async () => {
        const { table, home, ai } = await drivenTable();
        await opened(table.url);
        await until(() => ai.chats.length === 1 && ai.chats[0]!.idle());
        const chat = ai.chats[0]!;
        await posted(table.url, "/api/new", { ai_colour: "black" });
        await until(() => chat.sent.length === 2 && chat.idle());

        // The second line comes while the AI thinks on the first: its first ai_say gives it, and its next answers it.
        const busy = gate();
        chat.turns.push(async (client) => {
            await busy.passed;
            chat.answers.push(await call(client, "ai_say", { text: "Hello!" }));
            chat.answers.push(await call(client, "ai_say", { text: "Yes, the Sicilian." }));
            chat.answers.push(await call(client, "ai_say", { text: "And more." }));
        });
        await posted(table.url, "/api/message", { text: "Hi." });
        await until(() => chat.sent.length === 3 && !chat.idle());
        await posted(table.url, "/api/message", { text: "Shall we play the Sicilian?" });
        busy.open();
        await until(() => chat.answers.length === 3 && chat.idle());

        expect(chat.answers[0]!.text).toContain("Shall we play the Sicilian?");
        expect(chat.answers.map((one) => one.isError)).toEqual([false, false, true]);
        expect(chat.answers[2]!.text).toContain("You have spoken once for this move: say the rest in ai_move's comment. Nothing changed.");
        expect(loadGame(gameFolder(home))!.talk.filter((line) => line.who === "ai").map((line) => line.text)).toEqual(["Hello!", "Yes, the Sicilian."]);
        expect((await shown(table.url)).game?.talk?.map((line) => line.text)).toEqual(["Hi.", "Shall we play the Sicilian?", "Hello!", "Yes, the Sicilian."]);
    }, 30_000);

    it("shows on the page what the AI wrote outside its tools only when in its turn no tool spoke and it did not move, once", async () => {
        const { table, home, ai } = await drivenTable();
        await opened(table.url);
        await until(() => ai.chats.length === 1 && ai.chats[0]!.idle());
        const chat = ai.chats[0]!;
        await posted(table.url, "/api/new", { ai_colour: "black" });
        await until(() => chat.sent.length === 2 && chat.idle());
        const aiLines = (): string[] => loadGame(gameFolder(home))!.talk.filter((line) => line.who === "ai").map((line) => line.text);

        chat.turns.push(async () => {
            chat.emit({ type: "text", block: 0, text: "There is a game going on. " });
            chat.emit({ type: "text", block: 0, text: "Shall we go on?" });
        });
        await posted(table.url, "/api/message", { text: "Hello?" });
        await until(() => chat.sent.length === 3 && chat.idle());
        await until(() => aiLines().length === 1);
        expect(aiLines()).toEqual(["There is a game going on. Shall we go on?"]);

        chat.turns.push(async (client) => {
            chat.emit({ type: "text", block: 0, text: "Let me answer on the page." });
            await call(client, "ai_say", { text: "Of course." });
        });
        await posted(table.url, "/api/message", { text: "Sure?" });
        await until(() => chat.sent.length === 4 && chat.idle());
        await posted(table.url, "/api/message", { text: "Fine." });
        await until(() => chat.sent.length === 5 && chat.idle());
        await pause(200);
        expect(aiLines()).toEqual(["There is a game going on. Shall we go on?", "Of course."]);

        // Its reasoning before a move without a comment is never shown: the turn moved.
        const reasoning = "Nf6 attacks e4; e5 is met by Ng5 ideas... Nf6 is fine (Bxf7+ isn't a threat to fear).";
        chat.turns.push(async (client) => {
            chat.emit({ type: "text", block: 0, text: reasoning });
            chat.answers.push(await call(client, "ai_move", { move: "Nf6", plan: "Develop." }));
        });
        await posted(table.url, "/api/move", { move: "e4" });
        await until(() => chat.answers.length === 1 && chat.idle());
        await pause(200);
        expect(chat.answers[0]!.isError).toBe(false);
        expect(sans(home)).toEqual(["e4", "Nf6"]);
        expect(aiLines()).toEqual(["There is a game going on. Shall we go on?", "Of course."]);
        expect(JSON.stringify(await raw(table.url))).not.toContain("Ng5 ideas");

        // A later turn on the player's move, after the AI moved and spoke in turns before it, shows its words.
        chat.turns.push(async () => void chat.emit({ type: "text", block: 0, text: "Thank you." }));
        await posted(table.url, "/api/message", { text: "Nice move?" });
        await until(() => aiLines().length === 3);
        expect(aiLines().at(-1)).toBe("Thank you.");
    }, 30_000);

    it("listens from its attach, in the first turn the table sent it, before it calls any tool", async () => {
        const { table, ai } = await drivenTable();
        const first = gate();

        ai.first = async (client) => {
            await first.passed;
            await startTurn(client);
        };

        await opened(table.url);
        await until(async () => (await shown(table.url)).table?.chat === true);
        expect(ai.chats[0]!.calls).toEqual([]);
        expect((await raw(table.url)).listening).toBe(true);
        first.open();
        await until(() => ai.chats[0]!.idle());
    }, 30_000);

    it("keeps a chat in its first turn listening, and one in a turn from passing for stopped by an old chat's notes in the table's folder", async () => {
        const { table, home, ai } = await drivenTable();
        // A chat in a terminal sat here before, and was stopped with Esc.
        const transcript = join(home, "old-transcript.jsonl");
        writeFileSync(transcript, `${JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "text", text: "[Request interrupted by user]" }] } })}\n`);
        writeFileSync(join(tableFolder(home), "chat.json"), JSON.stringify({ source: "startup", at: "2026-11-20T10:00:00.000Z", session: "old-session", transcript }));
        startNewGame(newGame.input.parse({ ai_colour: "black", replace: true }), { ...homeContext(home), pageOpen: () => true }, "page");
        const first = gate();

        ai.first = async (client) => {
            await call(client, "instructions");
            await call(client, "status");
            await first.passed;
        };

        await opened(table.url);
        await until(() => ai.chats.length === 1 && ai.chats[0]!.calls.length === 2);
        const chat = ai.chats[0]!;

        expect((await posted(table.url, "/api/move", { move: "e4" })).status).toBe(200);
        expect((await raw(table.url)).listening).toBe(true);
        expect(await posted(table.url, "/api/table/restart", { host: "claude" })).toEqual({ status: 200, text: JSON.stringify({ waiting: true }) });
        await pause(300);
        expect(chat.closed).toBe(false);

        // Its first turn ends: the move it missed reaches it.
        await posted(table.url, "/api/table/waiting", { now: false });
        chat.turns.push(async (client) => void (await call(client, "ai_move", { move: "e5", plan: "Hold the centre." })));
        first.open();
        await until(() => chat.sent.length === 2 && chat.idle());
        expect(sans(home)).toEqual(["e4", "e5"]);
    }, 30_000);

    it("tells the bell of a turn its host begins by itself: the player's move then waits for its end", async () => {
        const { table, home, ai } = await drivenTable();
        await opened(table.url);
        await until(() => ai.chats.length === 1 && ai.chats[0]!.idle());
        const chat = ai.chats[0]!;
        await posted(table.url, "/api/new", { ai_colour: "black" });
        await until(() => chat.sent.length === 2 && chat.idle());

        const own = gate();
        void chat.ownTurn(() => own.passed);
        await until(async () => (await shown(table.url)).table?.atWork === true);
        chat.turns.push(async (client) => void (await call(client, "ai_move", { move: "e5", plan: "Hold the centre." })));
        await posted(table.url, "/api/move", { move: "e4" });
        await pause(100);
        expect(chat.sent).toHaveLength(2);

        own.open();
        await until(() => chat.sent.length === 3 && chat.idle());
        expect(chat.sent[2]).toMatch(/^The player acted on the board page\./);
        expect(sans(home)).toEqual(["e4", "e5"]);
    }, 30_000);

    it("refuses the AI's words with the game when the player moved while it thought on them, and takes its move on it with no call between", async () => {
        const { table, home, ai } = await drivenTable();
        await opened(table.url);
        await until(() => ai.chats.length === 1 && ai.chats[0]!.idle());
        const chat = ai.chats[0]!;
        await posted(table.url, "/api/new", { ai_colour: "black" });
        await until(() => chat.sent.length === 2 && chat.idle());

        const thinking = gate();
        chat.turns.push(async (client) => {
            await thinking.passed;
            chat.answers.push(await call(client, "ai_say", { text: "Hello to you!" }));
            chat.answers.push(await call(client, "ai_move", { move: "e5", plan: "Hold the centre.", comment: "Hello to you!" }));
        });
        await posted(table.url, "/api/message", { text: "Hello!" });
        await until(() => chat.sent.length === 3 && !chat.idle());
        await posted(table.url, "/api/move", { move: "e4" });
        const calls = chat.calls.length;
        thinking.open();
        await until(() => chat.answers.length === 2);

        expect(chat.answers.map((one) => one.isError)).toEqual([true, false]);
        expect(chat.answers[0]!.text.startsWith("It is your move: here is the game now. Decide on it, and speak in ai_move's comment. Nothing changed.\n")).toBe(true);
        expect(chat.answers[0]!.text).toContain("1.e4");
        expect(chat.calls.slice(calls)).toEqual(["ai_say", "ai_move"]);
        expect(sans(home)).toEqual(["e4", "e5"]);
    }, 30_000);

    it("never gives the chat the board page's address, which its player has open already", async () => {
        const { table, ai } = await drivenTable();
        await opened(table.url);
        await until(() => ai.chats.length === 1 && ai.chats[0]!.idle());
        const chat = ai.chats[0]!;

        chat.turns.push(async (client) => void chat.answers.push(await call(client, "status")));
        await posted(table.url, "/api/message", { text: "Hello." });
        await until(() => chat.answers.length === 1 && chat.idle());
        expect(chat.answers[0]!.isError).toBe(false);
        expect(chat.answers[0]!.text).toContain("Chesspal ");
        expect(chat.answers[0]!.text).not.toContain("Board page");
        expect(chat.answers[0]!.text).not.toContain(new URL(table.url).host);
    }, 30_000);

    it("ends the turn itself once the AI's move asks nothing more of it, never as the player's Stop; not when the move gives words to answer or ends the game", async () => {
        const { table, home, ai } = await drivenTable();
        await opened(table.url);
        await until(() => ai.chats.length === 1 && ai.chats[0]!.idle());
        const chat = ai.chats[0]!;
        await posted(table.url, "/api/new", { ai_colour: "black" });
        await until(() => chat.sent.length === 2 && chat.idle());

        // A plain move: the turn is interrupted once the chat has its answer, and what it writes after is not shown.
        chat.turns.push(async (client) => {
            chat.answers.push(await call(client, "ai_move", { move: "e5", plan: "Hold the centre." }));
            chat.emit({ type: "text", block: 0, text: "I played e5: your move." });
            await new Promise<void>(() => undefined);
        });
        await posted(table.url, "/api/move", { move: "f3" });
        await until(() => chat.sent.length === 3 && chat.idle());
        expect(chat.ends.at(-1)).toBe("interrupted");
        expect(chat.answers.map((one) => one.isError)).toEqual([false]);
        const after = await shown(table.url);
        expect(after.table).not.toHaveProperty("stopped");
        expect(after.table).not.toHaveProperty("noMove");
        expect(after.game?.talk ?? []).toEqual([]);

        // Words of the player's given with the move: the AI answers them in the same turn.
        const busy = gate();
        chat.turns.push(async (client) => {
            await busy.passed;
            chat.answers.push(await call(client, "ai_move", { move: "Nc6", plan: "Develop." }));
            chat.answers.push(await call(client, "ai_say", { text: "Thanks, you too." }));
        });
        await posted(table.url, "/api/move", { move: "a3" });
        await until(() => chat.sent.length === 4 && !chat.idle());
        await posted(table.url, "/api/message", { text: "Good luck!" });
        busy.open();
        await until(() => chat.answers.length === 3 && chat.idle());
        expect(chat.ends.at(-1)).toBe("done");
        expect(chat.answers.map((one) => one.isError)).toEqual([false, false, false]);

        // The next move of the player's wakes the chat; a move that ends the game leaves the AI its words on the end.
        await pause(100);
        const sent = chat.sent.length;
        chat.turns.push(async (client) => void chat.answers.push(await call(client, "ai_move", { move: "Qh4#", plan: "Mate." })));
        await posted(table.url, "/api/move", { move: "g4" });
        await until(() => chat.sent.length === sent + 1 && chat.idle());
        expect(chat.answers.at(-1)!.isError).toBe(false);
        expect(chat.ends.at(-1)).toBe("done");
        expect(sans(home)).toEqual(["f3", "e5", "a3", "Nc6", "g4", "Qh4#"]);
    }, 30_000);

    it("plays a move written alone in the message box for the chat the table drives only: a chat in a terminal reads it as words", async () => {
        const home = temporary();
        const context = homeContext(home);
        startNewGame(newGame.input.parse({ ai_colour: "black", replace: true }), { ...context, pageOpen: () => true }, "page");
        const { table } = await drivenTable(home, fakeDriver(), context);
        const terminal = await terminalAttached(table.url, join(home, "elsewhere"));

        try {
            expect(await posted(table.url, "/api/message", { text: "e4" })).toEqual({ status: 200, text: JSON.stringify({ said: true }) });
            expect(sans(home)).toEqual([]);
        } finally {
            terminal.leave();
        }
    }, 30_000);

    it("stops its turn when the player cancels the analysis they asked", async () => {
        const { table, ai } = await drivenTable();
        await opened(table.url);
        await until(() => ai.chats.length === 1 && ai.chats[0]!.idle());
        const chat = ai.chats[0]!;
        chat.turns.push(() => new Promise<void>(() => undefined));
        await posted(table.url, "/api/message", { text: "Look at my last game." });
        await until(() => chat.sent.length === 2 && !chat.idle());

        expect((await posted(table.url, "/api/stop-analysis", { game: "games/none.pgn" })).status).toBe(200);
        await until(() => chat.idle());
        expect(chat.ends.at(-1)).toBe("interrupted");
    }, 30_000);
});

describe("the opening of a chat the table drives", () => {
    it("says on the page that the chat opening is one the table drives, and opens none once the table has let it go meanwhile", async () => {
        const ai = fakeDriver();
        const loaded = gate();
        ai.loading = loaded.passed;
        const { table, home, chats, withdrawn } = await drivenTable(undefined, ai);
        const asked = opened(table.url);
        await until(async () => (await shown(table.url)).table?.opening === "chat");
        expect((await shown(table.url)).table).toMatchObject({ opening: "chat", openingDriven: true });

        // The player chooses Codex while Claude Code is still opening.
        expect(chats.relaunch(tableFolder(home), "codex")).toBe(true);
        loaded.open();
        await asked;
        await pause(300);
        expect(ai.chats).toEqual([]);
        expect(withdrawn).toEqual(["opponent"]);
    }, 30_000);

    it("opens the chat for the game in analysis with the start for it, gives it the bell's turn for its own folder, and starts it again for a new game", async () => {
        const { table, ai } = await drivenTable();
        const page = await eventsOf(table.url);

        try {
            const brought = await posted(table.url, "/api/study", { pgn: '[White "Ann"]\n[Black "Bob"]\n\n1. e4 e5 2. Qh5 Nc6 *' });
            const kept = (JSON.parse(brought.text) as { game: string; }).game;
            await opened(table.url);
            await until(() => ai.chats.length === 1 && ai.chats[0]!.calls.length >= 2 && ai.chats[0]!.idle());
            const chat = ai.chats[0]!;
            expect(chat.sent[0]).toBe("Let's analyse the game!");

            await posted(table.url, "/api/message", { text: "Why Qh5?", game: kept, at: 3 });
            await until(() => chat.sent.some((text) => text.includes("Why Qh5?")) && chat.idle());
            expect(chat.sent.find((text) => text.includes("Why Qh5?"))).not.toContain(analystAgent);

            expect(await posted(table.url, "/api/new", { ai_colour: "black" })).toEqual({ status: 200, text: JSON.stringify({ started: true }) });
            await until(() => ai.chats.length === 2 && ai.chats[1]!.idle());
            expect(chat.closed).toBe(true);
            expect(ai.chats[1]!.sent).toEqual(["Let's play!"]);
        } finally {
            page.destroy();
        }
    }, 30_000);

    it("shows the game in analysis reviewed only while the chat goes over it, never while it only answers the player about it", async () => {
        const { table, ai } = await drivenTable();
        const looked = await posted(table.url, "/api/study", { pgn: '[White "Ann"]\n[Black "Bob"]\n\n1. e4 e5 2. Qh5 Nc6 *', look: true });
        const kept = (JSON.parse(looked.text) as { game: string; }).game;
        await opened(table.url);
        await until(() => ai.chats.length === 1 && ai.chats[0]!.idle());
        const chat = ai.chats[0]!;
        const analysisNow = async () => (await raw(table.url)).analysis as { reviewing?: true; incomplete?: true; };

        const answering = gate();
        chat.turns.push(async () => await answering.passed);
        await posted(table.url, "/api/message", { text: "Why Qh5?", game: kept, at: 3 });
        await until(() => !chat.idle());
        expect(await analysisNow()).toMatchObject({ incomplete: true });
        expect(await analysisNow()).not.toHaveProperty("reviewing");
        answering.open();
        await until(() => chat.idle());

        const reviewing = gate();
        chat.turns.push(async (client) => {
            chat.answers.push(await call(client, "analyse_game", { game: kept }));
            await reviewing.passed;
        });
        await posted(table.url, "/api/message", { text: "Go over it, please.", game: kept, at: 3 });
        await until(() => chat.answers.length === 1);
        expect(chat.answers[0]!.isError).toBe(false);
        expect(await analysisNow()).toMatchObject({ reviewing: true });
        reviewing.open();
        await until(() => chat.idle());
        expect(await analysisNow()).not.toHaveProperty("reviewing");
    }, 30_000);
});

describe("the stalls and the words of the chat the table drives", () => {
    /** A table whose clock the test moves, a chat at it, and a game of 10+5 begun with the AI as Black, the player's e4 played and its turn hanging. */
    async function stalledGame(): Promise<{ table: Table; home: string; ai: FakeDriver; chat: FakeChat; ahead: { ms: number; }; }>
    {
        const home = temporary();
        const { context, ahead } = movingContext(home);
        const { table, ai } = await drivenTable(home, fakeDriver(), context, true, { idle: 3_600_000, every: 10 });
        await opened(table.url);
        await until(() => ai.chats.length === 1 && ai.chats[0]!.idle());
        const chat = ai.chats[0]!;
        await posted(table.url, "/api/new", { ai_colour: "black", clock: "10+5" });
        await until(() => chat.sent.length === 2 && chat.idle());
        await posted(table.url, "/api/start", {});
        chat.turns.push(() => new Promise<void>(() => undefined));
        await posted(table.url, "/api/move", { move: "e4" });
        await until(() => chat.sent.length === 3 && !chat.idle());
        return { table, home, ai, chat, ahead };
    }

    it("after a Stop, wakes nobody for a line the turn missed, and keeps the AI's clock held through a line refused, a Resign and the minutes", async () => {
        const { table, home, chat, ahead } = await stalledGame();
        await posted(table.url, "/api/message", { text: "w".repeat(200) });
        await posted(table.url, "/api/table/stop", {});
        await until(async () => (await shown(table.url)).table?.stopped === true);
        await pause(200);
        expect(chat.sent).toHaveLength(3);

        // A line refused, its move's characters spent, wakes nobody and leaves the stall on.
        expect((await posted(table.url, "/api/message", { text: "Still there?" })).status).toBe(409);
        ahead.ms = 20 * 60_000;
        expect((await shown(table.url)).table).toMatchObject({ stopped: true });
        expect(endOf(loadGame(gameFolder(home))!.game)).toBeUndefined();
        expect(chat.sent).toHaveLength(3);

        // Longer than the AI's whole time: the player who resigns loses by resigning, never wins on time.
        ahead.ms = 40 * 60_000;
        expect(await posted(table.url, "/api/resign", {})).toEqual({ status: 200, text: JSON.stringify({ resigned: true }) });
        expect(endOf(loadGame(gameFolder(home))!.game)).toMatchObject({ result: "0-1" });
        expect(JSON.stringify(endOf(loadGame(gameFolder(home))!.game))).not.toContain("time");
    }, 30_000);

    it("charges the AI none of the time of a turn the player stopped, and holds its clock from the player's move", async () => {
        const { table, home, chat, ahead } = await stalledGame();
        const before = loadGame(gameFolder(home))!.clock!;
        ahead.ms = 3 * 60_000;
        await posted(table.url, "/api/table/stop", {});
        await until(async () => (await shown(table.url)).table?.stopped === true);
        // Held from the turn's start, a moment after the player's move: the three minutes since are not the AI's.
        const held = ((await raw(table.url)).game as { clock: { held?: string; }; }).clock.held;
        expect(Date.parse(held!) - Date.parse(before.since)).toBeGreaterThanOrEqual(0);
        expect(Date.parse(held!) - Date.parse(before.since)).toBeLessThan(10_000);

        ahead.ms = 5 * 60_000;
        chat.turns.push(async (client) => void chat.answers.push(await call(client, "ai_move", { move: "e5", plan: "Hold the centre." })));
        await posted(table.url, "/api/message", { text: "Your move?" });
        await until(() => chat.answers.length === 1 && chat.idle());
        expect(chat.answers[0]!.isError).toBe(false);
        // Its time and the increment: the three minutes before the Stop, and the two after, are not the AI's.
        expect(loadGame(gameFolder(home))!.clock!.left.black).toBeGreaterThan(before.left.black + 4_000);
    }, 30_000);

    it("ends a stall when the host begins a turn by itself, and when the chat leaves, giving the AI's clock its time back", async () => {
        const { table, home, chat, ahead } = await stalledGame();
        await posted(table.url, "/api/table/stop", {});
        await until(async () => (await shown(table.url)).table?.stopped === true);

        // While the host's own turn runs, the chat is no longer stopped.
        const own = gate();
        const owned = chat.ownTurn(async () => await own.passed);
        await until(async () => (await shown(table.url)).table?.stopped !== true);
        own.open();
        await owned;

        // Stalled once more, and gone: the time it stood stalled is given back.
        chat.turns.push(() => new Promise<void>(() => undefined));
        await posted(table.url, "/api/message", { text: "Hello?" });
        await until(() => !chat.idle());
        await posted(table.url, "/api/table/stop", {});
        await until(async () => (await shown(table.url)).table?.stopped === true);
        const since = loadGame(gameFolder(home))!.clock!.since;
        ahead.ms = 60_000;
        chat.emit({ type: "ended", why: "the host's program ended (exit code 1)" });
        await until(async () => (await shown(table.url)).table?.chat === false);
        expect(Date.parse(loadGame(gameFolder(home))!.clock!.since)).toBeGreaterThan(Date.parse(since));
    }, 30_000);

    it("asks a failed turn for no move again, and shows none of what it wrote", async () => {
        const { table, home, chat } = await stalledGame();
        await posted(table.url, "/api/table/stop", {});
        await until(async () => (await shown(table.url)).table?.stopped === true);

        chat.turns.push(async () => {
            chat.emit({ type: "text", block: 0, text: "I will answer e5, then bring the knight to f6." });
            return "failed";
        });
        await posted(table.url, "/api/message", { text: "Your move?" });
        await until(async () => (await shown(table.url)).table?.noMove === true);
        await pause(200);
        expect(chat.sent).toHaveLength(4);
        expect(loadGame(gameFolder(home))!.talk.filter((line) => line.who === "ai")).toEqual([]);
    }, 30_000);

    it("never shows what the AI wrote while its move waits: a turn with no move, one stopped, a move refused", async () => {
        const { table, home, chat } = await stalledGame();
        const aiLines = (): unknown[] => loadGame(gameFolder(home))!.talk.filter((line) => line.who === "ai");

        // Stopped: its plans stay its own.
        chat.emit({ type: "text", block: 0, text: "I will answer e5, then bring the knight to f6." });
        await posted(table.url, "/api/table/stop", {});
        await until(async () => (await shown(table.url)).table?.stopped === true);
        expect(aiLines()).toEqual([]);

        // A move refused, then no move: neither turn's words are shown, and the table's second asking says why.
        chat.turns.push(
            async (client) => {
                chat.emit({ type: "text", block: 0, text: "Kd7 keeps it all closed." });
                chat.answers.push(await call(client, "ai_move", { move: "Kd7", plan: "Walk." }));
            },
            async () => void chat.emit({ type: "text", block: 0, text: "Then Nf6 and d5." }),
        );
        await posted(table.url, "/api/message", { text: "Your move?" });
        await until(async () => (await shown(table.url)).table?.noMove === true);
        expect(chat.answers[0]!.isError).toBe(true);
        expect(chat.sent[4]).toContain("What you wrote outside your tools was not shown to the player: speak to them in ai_move's comment.");
        expect(aiLines()).toEqual([]);
    }, 30_000);

    it("shows the words of a turn between games, written before a line of the player's it never received, which the next turn gives it", async () => {
        const { table, ai } = await drivenTable();
        await opened(table.url);
        await until(() => ai.chats.length === 1 && ai.chats[0]!.idle());
        const chat = ai.chats[0]!;

        const thinking = gate();
        chat.turns.push(async () => {
            await thinking.passed;
            chat.emit({ type: "text", block: 0, text: "Hello! Shall we play?" });
        });
        await posted(table.url, "/api/message", { text: "Hi." });
        await until(() => chat.sent.length === 2 && !chat.idle());
        await posted(table.url, "/api/message", { text: "Can you play the Sicilian?" });
        thinking.open();
        await until(() => chat.sent.length === 3 && chat.idle());
        expect(chat.sent[2]).toContain("Can you play the Sicilian?");
        const page = await raw(table.url) as { talk?: { text: string; heard?: string; }[]; };
        expect(page.talk?.map((line) => line.text)).toEqual(["Hi.", "Hello! Shall we play?", "Can you play the Sicilian?"]);
        expect(page.talk?.at(-1)?.heard).not.toBe("answered");

        // A turn the player stopped shows nothing of what it wrote, whoever's move it is.
        chat.turns.push(async () => {
            chat.emit({ type: "text", block: 0, text: "Thinking aloud about openings." });
            await new Promise<void>(() => undefined);
        });
        await posted(table.url, "/api/message", { text: "Well?" });
        await until(() => chat.sent.length === 4 && !chat.idle());
        await posted(table.url, "/api/table/stop", {});
        await until(() => chat.idle());
        await pause(100);
        expect(((await raw(table.url)) as { talk?: { text: string; }[]; }).talk?.map((line) => line.text)).not.toContain("Thinking aloud about openings.");
    }, 30_000);

    it("keeps the AI's move made as the player stops the turn, and holds no clock for it: the player's next move wakes the chat", async () => {
        const home = temporary();
        const { context, ahead } = movingContext(home);
        const { table, ai } = await drivenTable(home, fakeDriver(), context, true, { idle: 3_600_000, every: 10 });
        await opened(table.url);
        await until(() => ai.chats.length === 1 && ai.chats[0]!.idle());
        const chat = ai.chats[0]!;
        await posted(table.url, "/api/new", { ai_colour: "black", clock: "10+5" });
        await until(() => chat.sent.length === 2 && chat.idle());
        await posted(table.url, "/api/start", {});

        chat.turns.push(async (client) => {
            chat.emit({ type: "tool", id: "read", name: "Read", kind: "read", state: "started" });
            chat.answers.push(await call(client, "ai_move", { move: "e5", plan: "Hold the centre." }));
            await new Promise<void>(() => undefined);
        });
        await posted(table.url, "/api/move", { move: "e4" });
        await until(() => chat.answers.length === 1);
        await posted(table.url, "/api/table/stop", {});
        await until(() => chat.idle());
        expect(sans(home)).toEqual(["e4", "e5"]);
        expect(((await raw(table.url)).game as { clock: { held?: string; }; }).clock).not.toHaveProperty("held");
        ahead.ms = 60_000;
        expect(endOf(loadGame(gameFolder(home))!.game)).toBeUndefined();

        chat.turns.push(async (client) => void chat.answers.push(await call(client, "ai_move", { move: "Nc6", plan: "Develop." })));
        await posted(table.url, "/api/move", { move: "Nf3" });
        await until(() => chat.answers.length === 2 && chat.idle());
        expect(chat.answers[1]!.isError).toBe(false);
        expect(sans(home)).toEqual(["e4", "e5", "Nf3", "Nc6"]);
        expect((await shown(table.url)).table).not.toHaveProperty("stopped");
    }, 30_000);

    it("ends the turn after the move only once every tool of the AI's has its answer", async () => {
        const { table, home, ai } = await drivenTable();
        await opened(table.url);
        await until(() => ai.chats.length === 1 && ai.chats[0]!.idle());
        const chat = ai.chats[0]!;
        await posted(table.url, "/api/new", { ai_colour: "black" });
        await until(() => chat.sent.length === 2 && chat.idle());

        const other = gate();
        chat.turns.push(async (client) => {
            chat.emit({ type: "tool", id: "said", name: "ai_say", kind: "chesspal", state: "started" });
            chat.answers.push(await call(client, "ai_move", { move: "e5", plan: "Hold the centre." }));
            await other.passed;
            chat.emit({ type: "tool", id: "said", name: "ai_say", kind: "chesspal", state: "done" });
            await new Promise<void>(() => undefined);
        });
        await posted(table.url, "/api/move", { move: "e4" });
        await until(() => chat.answers.length === 1);
        await pause(200);
        expect(chat.idle()).toBe(false);
        other.open();
        await until(() => chat.idle());
        expect(chat.ends.at(-1)).toBe("interrupted");
        expect(sans(home)).toEqual(["e4", "e5"]);
        expect((await shown(table.url)).table).not.toHaveProperty("stopped");
    }, 30_000);

    it("tells the pages when a turn ends", async () => {
        const { table, ai } = await drivenTable();
        await opened(table.url);
        await until(() => ai.chats.length === 1 && ai.chats[0]!.idle());
        const chat = ai.chats[0]!;
        const page = await watchedEvents(table.url);

        try {
            const thinking = gate();
            chat.turns.push(async () => await thinking.passed);
            await posted(table.url, "/api/message", { text: "Hi." });
            await until(() => !chat.idle());
            await until(() => page.count() > 0);
            await pause(100);
            const before = page.count();
            thinking.open();
            await until(() => chat.idle());
            await until(() => page.count() > before);
        } finally {
            page.destroy();
        }
    }, 30_000);

    it("keeps the table in use with no browser while a turn of its chat is at work, for thirty minutes at most", async () => {
        const home = temporary();
        const { context, ahead } = movingContext(home);
        const { table, ai } = await drivenTable(home, fakeDriver(), context, true, { idle: 60_000, every: 10 });
        await opened(table.url);
        await until(() => ai.chats.length === 1 && ai.chats[0]!.idle());
        let closed = false;
        void table.closed.then(() => (closed = true));

        ai.chats[0]!.turns.push(() => new Promise<void>(() => undefined));
        await posted(table.url, "/api/message", { text: "A long review, please." });
        await until(() => !ai.chats[0]!.idle());
        ahead.ms = 20 * 60_000;
        await pause(200);
        expect(closed).toBe(false);
        ahead.ms = 32 * 60_000;
        await until(() => closed, 5_000);
    }, 30_000);

    it("speaks to the chat of the page in front of the player, and never sends it there", async () => {
        const { table, ai } = await drivenTable();
        await opened(table.url);
        await until(() => ai.chats.length === 1 && ai.chats[0]!.idle());
        const chat = ai.chats[0]!;

        chat.turns.push(async (client) => {
            chat.answers.push(await call(client, "status"));
            chat.answers.push(await call(client, "new_game"));
        });
        await posted(table.url, "/api/message", { text: "A game?" });
        await until(() => chat.answers.length === 2 && chat.idle());
        expect(chat.answers[0]!.text).toContain("it opens the New game window on the page the player has in front of them");
        expect(chat.answers[1]!.text).toContain("the New game button of the page in front of them");
        // Where the player wrote stays said; where they go, never.
        expect(chat.answers[1]!.text).not.toContain("board page");
        expect(chat.answers[0]!.text.split("Next:")[1]).not.toContain("board page");
    }, 30_000);

    it("refuses the AI's words on its move with the game for the chat the table drives alone: another chat gets the one line", async () => {
        const home = temporary();
        const context = { ...homeContext(home), pageOpen: () => true };
        startNewGame(newGame.input.parse({ ai_colour: "white", replace: true }), context, "page");

        const refusal = async (asked: Context): Promise<unknown> => {
            try {
                await aiSay.run(aiSay.input.parse({ text: "Hello!" }), asked);
                return undefined;
            } catch (error) {
                return error;
            }
        };

        const other = await refusal(context);
        expect(other).not.toBeInstanceOf(PositionChanged);
        expect((other as Error).message).toBe("It is your move: speak in ai_move's comment. Nothing changed.");
        expect(await refusal({ ...context, drivenByTable: true })).toBeInstanceOf(PositionChanged);
    });
});

/** A browser that has the page open, counting the events the table sends it. */
async function watchedEvents(url: string): Promise<{ count(): number; destroy(): void; }>
{
    const { get } = await import("node:http");
    let events = 0;
    return new Promise((done) => {
        const asked = get(new URL("/api/events", url), { agent: false }, (response) => {
            response.setEncoding("utf8");
            response.on("data", (chunk: string) => (events += chunk.split("data:").length - 1));
            done({ count: () => events, destroy: () => asked.destroy() });
        });
    });
}

/** A chat of the fake driver: what it was opened with, the words it was sent and the tools its AI called, how its turns ended; it plays through its place. */
interface FakeChat
{
    readonly options: ChatOptions;
    readonly session: string;
    readonly sent: string[];
    readonly calls: string[];
    readonly answers: { text: string; isError: boolean; }[];
    readonly ends: string[];
    /** What the AI does at its next turns woken by the bell, in order; none does nothing. One that gives "failed" fails as the host's API would. */
    readonly turns: ((client: Client) => Promise<void | "failed">)[];
    closed: boolean;
    idle(): boolean;
    emit(event: HostEvent): void;
    /** A turn the host begins by itself, with no words of the table's, which ends once `play` has. */
    ownTurn(play: () => Promise<void>): Promise<void>;
}

/**
 * A driver of Claude Code whose chat plays the AI for real: on each turn, a client of the MCP SDK at its place, through the door. Its program `missing`,
 * the driver `loading` until a promise settles, the first turns it plays, and the turns the next chat it opens plays.
 */
interface FakeDriver
{
    driver: HostDriver;
    chats: FakeChat[];
    failFirst: boolean;
    missing: boolean;
    loading?: Promise<void>;
    first?: (client: Client) => Promise<void>;
    queued: ((client: Client) => Promise<void>)[];
}

function fakeDriver(): FakeDriver
{
    const chats: FakeChat[] = [];
    const driver: HostDriver = {
        open: (options) => {
            const fake = fakeChat(options, `session-${chats.length + 1}`, made);
            fake.chat.turns.push(...made.queued.splice(0));
            chats.push(fake.chat);
            return fake.host;
        },
        missing: () => undefined,
        program: () => (made.missing ? undefined : { command: "claude", args: [] }),
        environment: (environment) => ({ ...environment }),
        models: () => Promise.resolve([]),
        model: "opus",
        efforts: ["low", "medium", "high"],
    };
    const made: FakeDriver = { driver, chats, failFirst: false, missing: false, queued: [] };
    return made;
}

function fakeChat(options: ChatOptions, ownSession: string, ai: FakeDriver): { chat: FakeChat; host: HostChat; }
{
    let listener: ((event: HostEvent) => void) | undefined;
    const waiting: HostEvent[] = [];
    const failFirst = ai.failFirst;
    let busy = false;
    let told = false;
    let client: Promise<Client> | undefined;
    let stopTurn: (() => void) | undefined;
    const session = options.session ?? ownSession;

    const emit = (event: HostEvent): void => {
        if (chat.closed) {
            return;
        }

        if (listener === undefined) {
            waiting.push(event);
        } else {
            listener(event);
        }
    };

    const ownTurn = async (play: () => Promise<void>): Promise<void> => {
        busy = true;
        emit({ type: "turnStart", by: "host" });
        await play();
        busy = false;
        emit({ type: "turnEnd", reason: "done" });
    };

    const chat: FakeChat = { options, session, sent: [], calls: [], answers: [], ends: [], turns: [], closed: false, idle: () => !busy, emit, ownTurn };

    const turn = async (text: string): Promise<void> => {
        // A host that cannot sign in fails its first turn before it says which chat it is.
        if (failFirst) {
            busy = false;
            emit({ type: "turnEnd", reason: "failed", why: "Not logged in · Please run /login" });
            return;
        }

        // As a host's process does, it says which chat it is a moment after it was sent its first words.
        await new Promise((done) => setImmediate(done));

        if (!told) {
            told = true;
            emit({ type: "session", session, model: `claude-${options.model}`, ...(options.effort === undefined ? {} : { effort: options.effort }) });
        }

        client ??= sitAt(options.server!.environment, (made) => void clients.push(made));
        const sitting = await client;
        const traced = tracing(sitting, chat);
        const stopped = new Promise<"interrupted">((done) => (stopTurn = () => done("interrupted")));
        // A clean chat's first words are the table's start message.
        const starting = options.session === undefined && chat.sent.length === 1 && text === chat.sent[0];
        const play = starting ? (ai.first ?? startTurn)(traced) : (chat.turns.shift() ?? (() => Promise.resolve()))(traced);
        const reason = await Promise.race([play.then((ended) => ended ?? "done"), stopped]);
        stopTurn = undefined;
        chat.ends.push(reason);
        busy = false;
        emit(reason === "failed" ? { type: "turnEnd", reason, why: "API Error: 500 Internal server error" } : { type: "turnEnd", reason });
    };

    const host: HostChat = {
        send: (text) => {
            if (busy || chat.closed) {
                return false;
            }

            busy = true;
            chat.sent.push(text);
            void turn(text);
            return true;
        },
        onEvent: (heard) => {
            listener = heard;
            waiting.splice(0).forEach(heard);
        },
        interrupt: () => stopTurn?.(),
        close: () => {
            chat.closed = true;
            void client?.then((sitting) => sitting.close()).catch(() => undefined);
        },
    };
    return { chat, host };
}

/** What a chat's AI does at its first turn: the instructions, then status. */
async function startTurn(client: Client): Promise<void>
{
    await call(client, "instructions");
    await call(client, "status");
}

/** The client, its tools' names noted in the chat as they are called, and told to the table as Claude Code tells them, once their answer is in. */
function tracing(client: Client, chat: FakeChat): Client
{
    return new Proxy(client, {
        get: (target, name) => {
            if (name === "callTool") {
                return async (asked: { name: string; }) => {
                    const id = `tool-${chat.calls.length}`;
                    chat.calls.push(asked.name);
                    chat.emit({ type: "tool", id, name: asked.name, kind: "chesspal", state: "started" });
                    const result = await target.callTool(asked as never);
                    chat.emit({ type: "tool", id, name: asked.name, kind: "chesspal", state: result.isError === true ? "failed" : "done" });
                    return result;
                };
            }

            return Reflect.get(target, name) as unknown;
        },
    });
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}): Promise<{ text: string; isError: boolean; }>
{
    const result = await client.callTool({ name, arguments: args });
    return { text: (result.content as { text: string; }[])[0]?.text ?? "", isError: result.isError === true };
}

/** The terminal's chats, which open nothing: the hosts it was asked to open. */
function terminalChats(): { chats: TableChats; opened: string[]; }
{
    const opened: string[] = [];
    const hosts = ["claude", "codex"].map((name) => ({ name, installed: true, models: [], efforts: [], command: `chesspal play ${name}` }));
    const chats: TableChats = { hosts: () => hosts, open: (host) => Promise.resolve(opened.push(host) < 0), held: () => undefined, relaunch: () => false };
    return { chats, opened };
}

/** The table's places, the roles of those withdrawn noted in `withdrawn`. */
function watchedPlaces(context: Context, withdrawn: string[]): TablePlaces
{
    const places = tablePlaces(context, { leaveWait: 500 });
    return {
        offer: async (role, folder, chat) => {
            const place = await places.offer(role, folder, chat);
            return {
                ...place,
                withdraw: () => {
                    withdrawn.push(place.role);
                    place.withdraw();
                },
            };
        },
        close: () => places.close(),
    };
}

/**
 * A table on a data folder, a new one unless given, whose chats are driven over a terminal's that opens nothing, with the switch on unless `switched` is
 * false: its fake driver's chats, given to share them with a table started again.
 */
async function drivenTable(
    home?: string,
    ai = fakeDriver(),
    given?: Context,
    switched = true,
    times: TableTimes = { idle: 60_000, every: 10 },
): Promise<{ table: Table; home: string; ai: FakeDriver; terminal: ReturnType<typeof terminalChats>; context: Context; chats: TableChats; withdrawn: string[]; }>
{
    const start = async (folder: string) => {
        const context = given ?? homeContext(folder);
        saveProfileSettings(folder, activeProfile(context.home()).id, { [chatInPage]: switched });
        const terminal = terminalChats();
        const withdrawn: string[] = [];

        const driver = async (): Promise<HostDriver> => {
            await ai.loading;
            return ai.driver;
        };

        const chats = drivenChats(context, { terminal: terminal.chats, places: () => watchedPlaces(context, withdrawn), driver, chesspal: ["node", "cli.js"], environment: {} });
        const table = await startTable(context, times, chats);

        if (table === undefined) {
            throw new Error("The table did not start: another one holds its ports.");
        }

        tables.push(table);
        return { table, home: folder, ai, terminal, context, chats, withdrawn };
    };

    return home === undefined ? onFreePorts(() => start(temporary())) : start(home);
}

/** The moves of the game going on, in SAN. */
function sans(home: string): string[]
{
    return loadGame(gameFolder(home))!.game.record.moves.map((move) => move.san);
}

function homeContext(home: string): Context
{
    return { ...testContext(home), now: () => new Date() };
}

/** A context whose clock the test moves forward. */
function movingContext(home: string): { context: Context; ahead: { ms: number; }; }
{
    const ahead = { ms: 0 };
    return { context: { ...testContext(home), now: () => new Date(Date.now() + ahead.ms) }, ahead };
}

function temporary(): string
{
    const folder = mkdtempSync(join(tmpdir(), "chesspal-driven-"));
    folders.push(folder);
    return folder;
}

const pause = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

/** A gate a fake turn waits at. */
function gate(): { open: () => void; passed: Promise<void>; }
{
    let open = (): void => undefined;
    const passed = new Promise<void>((done) => (open = done));
    return { open, passed };
}

/** A request of the table's own page, with its origin: the answer's status and text. */
function posted(url: string, path: string, body: object): Promise<{ status: number; text: string; }>
{
    return sent(new URL(path, url), { method: "POST", headers: { "Content-Type": "application/json", Origin: new URL(url).origin }, body: JSON.stringify(body) });
}

function opened(url: string, host = "claude"): Promise<{ status: number; text: string; }>
{
    return posted(url, "/api/table/chat", { host });
}

interface Shown
{
    game?: { talk?: { text: string; heard?: unknown; }[]; };
    thinking?: string;
    aiModel?: { model: string; effort?: string; };
    table?: { chat: boolean; started?: { model?: string; }; failed?: unknown; opening?: string; atWork?: true; stopped?: true; noMove?: true; };
}

async function shown(url: string): Promise<Shown>
{
    return JSON.parse((await sent(new URL("/api/game", url))).text) as Shown;
}

async function raw(url: string): Promise<Record<string, unknown>>
{
    return JSON.parse((await sent(new URL("/api/game", url))).text) as Record<string, unknown>;
}

/** A browser that has the page open, listening to its events. */
async function eventsOf(url: string): Promise<{ destroy(): void; }>
{
    const { get } = await import("node:http");
    return new Promise((done) => {
        const events = get(new URL("/api/events", url), { agent: false }, () => done(events));
    });
}

/** A chat of a terminal attached to the table over HTTP, which stays while its request does. */
async function terminalAttached(url: string, folder: string): Promise<{ token: string; leave(): void; }>
{
    const { request } = await import("node:http");
    return new Promise((done, failed) => {
        const asked = request(new URL("/api/chat", url), { method: "POST", headers: { "Content-Type": "application/json" }, agent: false }, (response) => {
            response.setEncoding("utf8");
            response.once("data", (line: string) => {
                const said = JSON.parse(line.split("\n")[0]!) as { token?: string; error?: string; };

                if (said.token === undefined) {
                    failed(new Error(said.error));
                } else {
                    done({ token: said.token, leave: () => asked.destroy() });
                }
            });
        });
        asked.on("error", () => undefined);
        asked.end(JSON.stringify({ version, session: "terminal-session", folder, host: "claude-code", outdated: false }));
    });
}

/** A hook that waits at the bell over HTTP: what it hears. */
async function hookWaiting(url: string): Promise<{ heard: Promise<string>; }>
{
    const { get } = await import("node:http");
    let said = (text: string): void => void text;
    const heard = new Promise<string>((done) => (said = done));
    await new Promise<void>((started) => {
        const asked = get(new URL("/api/bell?session=terminal-session", url), { agent: false }, (response) => {
            let text = "";
            response.setEncoding("utf8");
            response.on("data", (chunk: string) => (text += chunk));
            response.on("end", () => said(text));
        });
        asked.on("error", () => said("error"));
        setTimeout(started, 150);
    });
    return { heard };
}

async function until(condition: () => boolean | Promise<boolean>, wait = 10_000): Promise<void>
{
    const end = Date.now() + wait;

    while (!(await condition())) {
        if (Date.now() > end) {
            throw new Error("What the test waited for did not come.");
        }

        await new Promise((done) => setTimeout(done, 20));
    }
}
