import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { recordChatStart } from "../src/cli/chat-hook.ts";
import type { Context } from "../src/commands/context.ts";
import { endGame } from "../src/commands/end-game.ts";
import { newGame } from "../src/commands/new-game.ts";
import { positionIn } from "../src/commands/play-move.ts";
import { status } from "../src/commands/status.ts";
import { createProfile, gameFolder } from "../src/profiles/index.ts";
import { testContext } from "./commands.ts";

const folders: string[] = [];
// Twenty plies: a game long enough to ask for a clean chat before the next (D-57).
const longGame = "1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d3 d6 6. O-O O-O 7. a4 a6 8. Re1 Ba7 9. h3 h6 10. Nbd2 Re8 *";
const before = new Date(2026, 10, 2, 15, 0, 0);
const after = new Date(2026, 10, 2, 15, 45, 0);

afterEach(() => {
    for (const folder of folders.splice(0)) {
        rmSync(folder, { recursive: true, force: true });
    }
});

describe("a new game after one played in the chat (D-57)", () => {
    it("waits for the chat to be cleared, when Claude Code notes how chats start", async () => {
        const context = chatWith(longGame);
        await chatStarted(context, "startup", before);
        expect(() => startAgain(context)).toThrow(/write \/clear here.*Nothing changed\./);

        await chatStarted(context, "resume", after);
        expect(() => startAgain(context)).toThrow(/\/clear/);

        await chatStarted(context, "clear", after);
        expect(() => startAgain(context)).not.toThrow();
    });

    it("waits for it in Codex too, whose hook notes how chats start (T-104)", async () => {
        const codex = chatWith(longGame, "codex-mcp-client");
        await chatStarted(codex, "compact", after);
        expect(() => startAgain(codex)).toThrow(/\/clear/);

        await chatStarted(codex, "startup", after);
        expect(() => startAgain(codex)).not.toThrow();
    });

    it("starts at once after a game left after a few moves, from another host, or where no hook notes the chat", async () => {
        const short = chatWith("1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d3 d6 6. O-O O-O 7. a4 a6 8. Re1 Ba7 9. h3 h6 10. Nbd2 *");
        await chatStarted(short, "startup", before);
        expect(() => startAgain(short)).not.toThrow();

        const other = chatWith(longGame, "gemini-cli-mcp-client");
        await chatStarted(other, "startup", before);
        expect(() => startAgain(other)).not.toThrow();

        expect(() => startAgain(chatWith(longGame))).not.toThrow();
    });

    it("starts at once after a game another chat played, which this one was never shown (D-71)", async () => {
        const played = chatWith(longGame);
        endGame.run(endGame.input.parse({ result: "player_resigns" }), played);
        await chatStarted(played, "startup", before);
        const idle: Context = { ...played, positionSeen: null };

        expect(() => newGame.run(newGame.input.parse({ ai_colour: "black" }), played)).toThrow(/\/clear/);
        expect(() => newGame.run(newGame.input.parse({ ai_colour: "black" }), idle)).not.toThrow();
    });

    it("waits for the chat to be cleared even when another profile starts the next game (D-66)", async () => {
        const context = chatWith(longGame);
        await chatStarted(context, "startup", before);
        createProfile(context.folder, { name: "Anna" });
        createProfile(context.folder, { name: "Marco" });

        expect(() => startAgain(context)).toThrow(/\/clear/);
    });

    it("notes how the chat started from the hook's input, its session and its transcript", async () => {
        const context = chatWith(longGame);
        await recordChatStart(Readable.from([JSON.stringify({ source: "clear", session_id: "abc", transcript_path: "abc.jsonl", cwd: context.folder })]), context.folder, after);
        expect(JSON.parse(readFileSync(join(context.folder, "chat.json"), "utf8"))).toEqual({ source: "clear", at: after.toISOString(), session: "abc", transcript: "abc.jsonl" });
    });
});

describe("a new game chosen on the board page", () => {
    it("opens the page's New game window without choices, or gives its address while it is closed, and asks in the chat without a page", async () => {
        const context = chatWith("1. e4 *");
        let asked = 0;
        const ask = (open: boolean): Context => ({ ...context, page: "http://127.0.0.1:5876", askNewGame: () => (asked++, open) });

        expect(newGame.format(await newGame.run({ replace: false }, ask(true)))).toMatch(/The New game window is open on the board page/);
        expect(asked).toBe(1);
        expect(newGame.format(await newGame.run({ replace: false }, ask(false)))).toMatch(/give the player its address, http:\/\/127\.0\.0\.1:5876/);
        expect(() => newGame.run({ replace: false }, context)).toThrow(/There is no board page here: ask the player/);
        expect(() => newGame.run({ replace: false, clock: "5+0" }, context)).toThrow(/ai_colour: say the colour you play/);
    });

    it("refuses to open the window in a chat still holding the game before (D-57)", async () => {
        const context = chatWith(longGame);
        await chatStarted(context, "startup", before);
        expect(() => newGame.run({ replace: false }, { ...context, askNewGame: () => true })).toThrow(/\/clear/);
    });
});

describe("a game from before the chat", () => {
    it("is told once, at the chat's first status, when the game began before a clean chat", async () => {
        const context: Context = { ...chatWith("1. e4 *"), told: new Set() };
        await chatStarted(context, "clear", after);

        expect(status.format(await status.run({}, context))).toMatch(/A game from before this chat is going on: ask the player whether to go on with it/);
        expect(status.format(await status.run({}, context))).not.toMatch(/from before this chat/);
    });

    it("is not told for the game a summarized chat holds, nor on the command line", async () => {
        const compacted: Context = { ...chatWith("1. e4 *"), told: new Set() };
        await chatStarted(compacted, "compact", after);
        expect(status.format(await status.run({}, compacted))).not.toMatch(/from before this chat/);

        const line = chatWith("1. e4 *");
        await chatStarted(line, "clear", after);
        expect(status.format(await status.run({}, line))).not.toMatch(/from before this chat/);
    });
});

/** A player's folder with a game played in a chat of the host named. */
function chatWith(pgn: string, host = "claude-code"): Context
{
    const folder = mkdtempSync(join(tmpdir(), "chesspal-"));
    folders.push(folder);
    const context: Context = { ...testContext(folder, 0, new Date(2026, 10, 2, 15, 30, 12)), host: () => host };
    newGame.run(newGame.input.parse({ ai_colour: "black", from: pgn }), context);
    // The chat was shown the game, as the MCP server notes it (D-71).
    context.positionSeen = positionIn(gameFolder(context.home()));
    return context;
}

async function chatStarted(context: Context, source: string, at: Date): Promise<void>
{
    await recordChatStart(Readable.from([JSON.stringify({ source })]), context.folder, at);
}

function startAgain(context: Context): void
{
    newGame.run(newGame.input.parse({ ai_colour: "black", replace: true }), { ...context, now: () => new Date(2026, 10, 2, 16, 0, 0) });
}
