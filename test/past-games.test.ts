import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { endGame } from "../src/commands/game/end.ts";
import { newGame } from "../src/commands/game/new.ts";
import { pastGames } from "../src/commands/profiles/past-games.ts";
import type { Context } from "../src/commands/registry/context.ts";
import { gameFolder } from "../src/profiles/index.ts";
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
        expect(pastGames.format(await pastGames.run(pastGames.input.parse({ search: "sicilian  WON" }), context))).toBe(line);
        expect(pastGames.format(await pastGames.run(pastGames.input.parse({ search: "Sicilian lost" }), context))).toBe("No game played holds all those words.");
        // White is the player's colour here, named only in how the game ended.
        expect(pastGames.format(await pastGames.run(pastGames.input.parse({ search: "white" }), context))).toBe("No game played holds all those words.");
        expect(pastGames.format(await pastGames.run(pastGames.input.parse({ game: "games/2026-11-02-153012.pgn" }), context))).toMatch(/\[Result "0-1"\][\s\S]*1\. e4 c5 2\. Nf3 d6 0-1/);
    });

    it("say there are none yet, and refuse a name the archive does not have", async () => {
        const context = playerFolder();
        expect(pastGames.format(await pastGames.run(pastGames.input.parse({}), context))).toBe("No game played yet.");
        await expect(async () => pastGames.run(pastGames.input.parse({ game: "../game.json" }), context)).rejects.toThrow(/no game of the archive/);
        await expect(async () => pastGames.run(pastGames.input.parse({ game: "games/2026-01-01-000000.pgn" }), context)).rejects.toThrow(/There is no/);
    });
});

describe("the archive's tags (ECO, Opening, PlyCount)", () => {
    it("list the games as reading them whole does, and a game without them is read whole", async () => {
        const context = await playedGames();
        const games = join(gameFolder(context.home()), "games");
        const files = readdirSync(games);
        expect(files.map((file) => readFileSync(join(games, file), "utf8")).filter((text) => text.includes("[PlyCount ")).length).toBe(4);
        const withTags = await listings(context);
        expect(withTags[0]!.split("\n").length).toBe(4);

        for (const file of files) {
            writeFileSync(join(games, file), readFileSync(join(games, file), "utf8").replace(/^\[(?:ECO|Opening|PlyCount) .*\]\n/gm, ""));
        }

        expect(await listings(context)).toEqual(withTags);
    });

    it("give a game's line without playing its moves, and the opening a game from elsewhere names is not the archive's", async () => {
        const context = await playedGames();
        const games = join(gameFolder(context.home()), "games");
        const sicilian = join(games, "2026-11-02-153012.pgn");
        const text = readFileSync(sicilian, "utf8");
        expect(text).toContain('[ECO "B50"]\n[Opening "Sicilian Defense: Modern Variations"]\n[PlyCount "4"]');
        // A game from another position carries no opening, whatever the PGN it came from said.
        expect(readFileSync(join(games, "2026-11-02-170000.pgn"), "utf8")).not.toMatch(/\[ECO |\[Opening /);

        writeFileSync(sicilian, text.replace("1. e4 c5", "1. e5 c5"));
        expect((await listings(context))[0]).toContain("games/2026-11-02-153012.pgn");
        writeFileSync(sicilian, text.replace("1. e4 c5", "1. e5 c5").replace(/^\[PlyCount .*\]\n/m, ""));
        expect((await listings(context))[0]).not.toContain("games/2026-11-02-153012.pgn");
    });
});

/** The archive of a player with four games: a Sicilian lost by the player, a Queen's Gambit the AI lost, one from another position, one left unfinished. */
async function playedGames(): Promise<Context>
{
    const context = playerFolder();
    const at = (hour: number): Context => ({ ...context, now: () => new Date(2026, 10, 2, hour, hour === 15 ? 30 : 0, hour === 15 ? 12 : 0) });
    await newGame.run(newGame.input.parse({ ai_colour: "black", from: "1. e4 c5 2. Nf3 d6 *" }), at(15));
    await endGame.run(endGame.input.parse({ result: "player_resigns" }), at(15));
    await newGame.run(newGame.input.parse({ ai_colour: "white", from: "1. d4 d5 2. c4 *" }), at(16));
    await endGame.run(endGame.input.parse({ result: "ai_resigns" }), at(16));
    const fromElsewhere = '[ECO "A00"]\n[Opening "Polish Opening"]\n[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]\n\n1. e3 Kd7 *';
    await newGame.run(newGame.input.parse({ ai_colour: "black", from: fromElsewhere }), at(17));
    await endGame.run(endGame.input.parse({ result: "player_resigns" }), at(17));
    await newGame.run(newGame.input.parse({ ai_colour: "black", from: "1. e4 e5 2. Nf3 Nc6 3. Bb5 *" }), at(18));
    await newGame.run(newGame.input.parse({ ai_colour: "white", replace: true }), at(19));
    return context;
}

/** What past_games lists: every game, and those a search finds. */
async function listings(context: Context): Promise<string[]>
{
    const list = async (search?: string): Promise<string> => pastGames.format(await pastGames.run(pastGames.input.parse(search === undefined ? {} : { search }), context));
    return [await list(), await list("won"), await list("lost"), await list("unfinished")];
}

function playerFolder(): Context
{
    const folder = mkdtempSync(join(tmpdir(), "chesspal-"));
    folders.push(folder);
    return testContext(folder);
}
