import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { endGame } from "../src/commands/game/end.ts";
import { newGame } from "../src/commands/game/new.ts";
import { pastGames } from "../src/commands/profiles/past-games.ts";
import type { Context } from "../src/commands/registry/context.ts";
import { testContext } from "./commands.ts";

const folders: string[] = [];

afterEach(() => {
    for (const folder of folders.splice(0)) {
        rmSync(folder, { recursive: true, force: true });
    }
});

describe("the games played (D-57)", async () => {
    it("are recalled by new_game, the latest first, and listed or read whole by past_games", async () => {
        const context = playerFolder();
        expect(newGame.format(await newGame.run(newGame.input.parse({ ai_colour: "black", from: "1. e4 c5 2. Nf3 d6 *" }), context))).not.toContain("Last games");
        await endGame.run(endGame.input.parse({ result: "player_resigns" }), context);

        const started = newGame.format(await newGame.run(newGame.input.parse({ ai_colour: "white" }), { ...context, now: () => new Date(2026, 10, 2, 16, 0, 0) }));
        const line = "2026-11-02 15:30, you (AI) played Black and won 0-1 (White resigns), B50 Sicilian Defense: Modern Variations, 2 moves. games/2026-11-02-153012.pgn";
        expect(started).toContain(`Last games with this player (past_games gives more, and their moves):\n${line}`);

        expect(pastGames.format(await pastGames.run(pastGames.input.parse({}), context))).toBe(line);
        expect(pastGames.format(await pastGames.run(pastGames.input.parse({ game: "games/2026-11-02-153012.pgn" }), context))).toMatch(/\[Result "0-1"\][\s\S]*1\. e4 c5 2\. Nf3 d6 0-1/);
    });

    it("say there are none yet, and refuse a name the archive does not have", async () => {
        const context = playerFolder();
        expect(pastGames.format(await pastGames.run(pastGames.input.parse({}), context))).toBe("No game played yet.");
        await expect(async () => pastGames.run(pastGames.input.parse({ game: "../game.json" }), context)).rejects.toThrow(/no game of the archive/);
        await expect(async () => pastGames.run(pastGames.input.parse({ game: "games/2026-01-01-000000.pgn" }), context)).rejects.toThrow(/There is no/);
    });
});

function playerFolder(): Context
{
    const folder = mkdtempSync(join(tmpdir(), "chesspal-"));
    folders.push(folder);
    return testContext(folder);
}
