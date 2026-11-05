import { commands } from "chesspal";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Context } from "../src/commands/context.ts";
import { canMate, clockStarted, clockTag, clockText, timeControlOf, timeControlTag } from "../src/core/index.ts";
import { loadGame, saveGame } from "../src/games/index.ts";
import { testContext } from "./commands.ts";

const folders: string[] = [];
const start = new Date(2026, 10, 3, 18, 0, 0);

afterEach(() => {
    for (const folder of folders.splice(0)) {
        rmSync(folder, { recursive: true, force: true });
    }
});

describe("the clock's core (D-13)", () => {
    it("reads a time control as Lichess and chess.com write it, and refuses what is not one", () => {
        expect(timeControlOf("10+5")).toEqual({ base: 600_000, increment: 5000 });
        expect(timeControlOf(" 0.5 + 0 ")).toEqual({ base: 30_000, increment: 0 });
        expect(timeControlTag(timeControlOf("3+2"))).toBe("180+2");

        expect(timeControlOf("4.1+0")).toEqual({ base: 246_000, increment: 0 });

        for (const wrong of ["10", "0+5", "10+x", "200+0", "0.001+0"]) {
            expect(() => timeControlOf(wrong)).toThrow(/write minutes, in whole seconds, and seconds added/);
        }
    });

    it("writes a time as a clock shows it, and as PGN's [%clk]", () => {
        expect(clockText(272_900)).toBe("4:32");
        expect(clockText(3_723_000)).toBe("1:02:03");
        expect(clockTag(272_900)).toBe("[%clk 0:04:32]");
        expect(clockTag(3_723_000)).toBe("[%clk 1:02:03]");
    });

    it("knows when a side could still mate, as a fallen flag asks (FIDE 6.9)", () => {
        expect(canMate("8/8/8/4k3/8/8/8/4K3 w - - 0 1", "white")).toBe(false);
        expect(canMate("8/8/8/4k3/8/8/8/3NK3 w - - 0 1", "white")).toBe(false);
        expect(canMate("8/8/8/4k3/4r3/8/8/3NK3 w - - 0 1", "white")).toBe(true);
        expect(canMate("8/8/8/4k3/8/8/4P3/4K3 w - - 0 1", "white")).toBe(true);
        expect(canMate("8/8/8/4k3/8/8/8/2BNK3 w - - 0 1", "white")).toBe(true);
        // Anatolij's cases, by Lichess's rule: a knight cannot mate against queens alone, bishops of one colour cannot against a rook.
        expect(canMate("q7/8/8/4k3/8/8/8/3NK3 b - - 0 1", "white")).toBe(false);
        expect(canMate("q7/8/8/4k3/8/8/7p/3NK3 b - - 0 1", "white")).toBe(true);
        expect(canMate("8/8/8/4k3/8/8/7r/3BK3 b - - 0 1", "white")).toBe(false);
        expect(canMate("8/8/8/4k3/8/5B2/7r/3BK3 b - - 0 1", "white")).toBe(false);
        expect(canMate("8/8/8/2b1k3/8/8/7r/3BK3 b - - 0 1", "white")).toBe(true);
        expect(canMate("8/8/8/4k3/8/8/7p/3BK3 b - - 0 1", "white")).toBe(true);
    });
});

describe("a game with a clock (D-13)", () => {
    it("spends each side's time, the player's in the chat less 10 s that were the AI's, adds the increment, and tells the AI both", async () => {
        const game = clockGame("1+2");
        expect(await run(game.at(0), "status")).toMatch(/Clock: you 1:00, player 1:00 \(1\+2\)/);

        await run(game.at(25), "player_move", { move: "e4" });
        expect(await run(game.at(40), "status")).toMatch(/Clock: you 0:45, player 0:47 \(1\+2\)/);

        await run(game.at(45), "ai_move", { move: "e5", plan: "Hold the centre." });
        expect(gameFile(game.context).clock).toMatchObject({ white: 47_000, black: 42_000 });
        expect(gameFile(game.context).pgn).toMatch(/1\. e4 \{ ?\[%clk 0:00:47\] ?\} 1\.\.\. e5 \{ ?\[%plan Hold the centre\.\] \[%clk 0:00:42\] ?\}/);
    });

    it("lets a move in the chat in within the allowance, past the player's time (D-36)", async () => {
        const game = clockGame("1+0");
        await run(game.at(65), "player_move", { move: "e4" });
        expect(gameFile(game.context).clock).toMatchObject({ white: 5_000 });
        await expect(run(game.at(200), "ai_move", { move: "e5", plan: "Late." })).rejects.toThrow(/Black lost on time/);
    });

    it("ends the game when the side to move runs out of time, at the first command that reads it, and archives it", async () => {
        const game = clockGame("1+0");
        await run(game.at(5), "player_move", { move: "e4" });
        expect(await run(game.at(70), "status")).toMatch(/Game over: 1-0, Black lost on time\. Archived in games\//);
        await expect(run(game.at(71), "ai_move", { move: "e5", plan: "Too late." })).rejects.toThrow(/The game is over \(1-0, Black lost on time\)/);
        expect(readdirSync(join(game.context.folder, "games"))).toHaveLength(1);
    });

    it("is a draw on time when the other side could not mate", async () => {
        const game = clockGame("1+0", "8/8/8/4k3/r7/8/8/4K3 b - - 0 1", "white");
        expect(await run(game.at(61), "status")).toMatch(/Game over: 1\/2-1\/2, Black ran out of time and White cannot mate/);
    });

    it("keeps a clock of a fraction of a minute readable from disk, in another process", async () => {
        const game = clockGame("4.1+0");
        await run(game.at(3), "player_move", { move: "e4" });
        expect(gameFile(game.context).clock).toMatchObject({ base: 246_000, white: 246_000 });
        // game.json keeps whole milliseconds, as its schema asks.
        expect(Object.values(gameFile(game.context).clock!).filter((value) => typeof value === "number").every(Number.isInteger)).toBe(true);
    });

    it("ends the game on time for every command that reads it: export gives the result", async () => {
        const game = clockGame("1+0");
        await run(game.at(5), "player_move", { move: "e4" });
        expect(await run(game.at(70), "export", { format: "pgn" })).toMatch(/\[Result "1-0"\]/);
    });

    it("waits for the player to start the clocks with the page open: the AI as White does not move, the player's first move starts them", async () => {
        const game = clockGame("1+2", undefined, "white", true);
        const status = await run(game.at(100), "status");
        expect(status).toMatch(/Clock: you 1:00, player 1:00 \(1\+2\)\. The clocks wait: they start with the player's first move, or with Start on the board page/);
        expect(status).toMatch(/Next: don't move yet: the player starts the game with Start/);
        await expect(run(game.at(120), "ai_move", { move: "e4", plan: "The centre." })).rejects.toThrow(/The clocks wait for the player/);
        expect(gameFile(game.context).clock).toMatchObject({ white: 60_000, black: 60_000, waiting: true });

        const black = clockGame("1+2", undefined, "black", true);
        await run(black.at(500), "player_move", { move: "e4" });
        expect(gameFile(black.context).clock).toMatchObject({ white: 60_000, black: 60_000 });
        expect(gameFile(black.context).clock).not.toHaveProperty("waiting");
        const started = await run(black.at(530), "status");
        expect(started).toMatch(/Clock: you 0:30, player 1:00 \(1\+2\)\./);
        expect(started).not.toMatch(/The clocks wait/);
    });

    it("starts the clocks at once without a page open", () => {
        const game = clockGame("1+2", undefined, "white", true, false);
        expect(gameFile(game.context).clock).not.toHaveProperty("waiting");
    });

    it("stops the clock when the game ends by a resignation", async () => {
        const game = clockGame("5+0");
        await run(game.at(30), "player_move", { move: "e4" });
        await run(game.at(130), "end_game", { result: "ai_resigns" });
        expect(gameFile(game.context).clock).toMatchObject({ white: 280_000, black: 200_000 });
    });

    it("keeps no clock in a game without one", async () => {
        const game = clockGame(undefined);
        await run(game.at(600), "player_move", { move: "e4" });
        expect(await run(game.at(6000), "status")).not.toMatch(/Clock/);
        expect(existsSync(join(game.context.folder, "game.json")) && gameFile(game.context).clock).toBeUndefined();
    });
});

/**
 * A new game in a folder of its own, the AI Black unless said, with the clock given, started by the player as the game starts unless it `waits` for them
 * on the board page, open unless said; `at` is the context some seconds after it started.
 */
function clockGame(clock: string | undefined, from?: string, ai = "black", waits = false, pageOpen = true): { context: Context; at: (seconds: number) => Context; }
{
    const folder = mkdtempSync(join(tmpdir(), "chesspal-"));
    folders.push(folder);
    const context: Context = { ...testContext(folder, 0, start), ...(waits ? { pageOpen: () => pageOpen } : {}) };
    const at = (seconds: number): Context => ({ ...context, now: () => new Date(start.getTime() + seconds * 1000) });
    const input = { ai_colour: ai, ...(clock === undefined ? {} : { clock }), ...(from === undefined ? {} : { from }) };
    const newGame = command("new_game");
    newGame.run(newGame.input.parse(input), context);
    const current = loadGame(folder);

    if (!waits && current?.clock !== undefined) {
        saveGame(folder, { ...current, clock: clockStarted(current.clock, start) });
    }

    return { context, at };
}

async function run(context: Context, name: string, input: Record<string, unknown> = {}): Promise<string>
{
    const { input: schema, run: runCommand, format } = command(name);
    return format(await runCommand(schema.parse(input), context));
}

function command(name: string): (typeof commands)[number]
{
    return commands.find((candidate) => candidate.name === name)!;
}

function gameFile(context: Context): { pgn: string; clock?: Record<string, unknown>; }
{
    return JSON.parse(readFileSync(join(context.folder, "game.json"), "utf8")) as never;
}
