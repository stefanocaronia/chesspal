import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { recordChatStart } from "../src/cli/chat-hook.ts";
import type { Context } from "../src/commands/context.ts";
import { newGame } from "../src/commands/new-game.ts";
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

    it("starts at once after a game left after a few moves, from another host, or where no hook notes the chat", async () => {
        const short = chatWith("1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d3 d6 6. O-O O-O 7. a4 a6 8. Re1 Ba7 9. h3 h6 10. Nbd2 *");
        await chatStarted(short, "startup", before);
        expect(() => startAgain(short)).not.toThrow();

        const codex = chatWith(longGame, "codex-mcp-client");
        await chatStarted(codex, "startup", before);
        expect(() => startAgain(codex)).not.toThrow();

        expect(() => startAgain(chatWith(longGame))).not.toThrow();
    });

    it("notes how the chat started from the hook's input, and its session", async () => {
        const context = chatWith(longGame);
        await recordChatStart(Readable.from([JSON.stringify({ source: "clear", session_id: "abc", cwd: context.folder })]), context.folder, after);
        expect(JSON.parse(readFileSync(join(context.folder, "chat.json"), "utf8"))).toEqual({ source: "clear", at: after.toISOString(), session: "abc" });
    });
});

/** A player's folder with a game played in a chat of the host named. */
function chatWith(pgn: string, host = "claude-code"): Context
{
    const folder = mkdtempSync(join(tmpdir(), "chesspal-"));
    folders.push(folder);
    const context: Context = { ...testContext(folder, 0, new Date(2026, 10, 2, 15, 30, 12)), host: () => host };
    newGame.run(newGame.input.parse({ ai_colour: "black", from: pgn }), context);
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
