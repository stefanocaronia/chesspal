import { Chess } from "chess.js";
import { commands } from "chesspal";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Context } from "../src/commands/registry/context.ts";
import { aiLevels, bookMoves, indexBook, layersOf, levelForPlayer, levelOf, sees, suggestedLevel } from "../src/core/index.ts";
import { levels as playerLevels } from "../src/profiles/index.ts";
import { testContext } from "./commands.ts";

const folders: string[] = [];

afterEach(() => {
    for (const folder of folders.splice(0)) {
        rmSync(folder, { recursive: true, force: true });
    }
});

describe("the AI's levels (D-60)", () => {
    it("are layers of facts, each level seeing the one below it and one more", () => {
        expect(aiLevels.map((level) => layersOf(level).join(" "))).toEqual(["board", "board tactics", "board tactics strategy", "board tactics strategy theory"]);
        expect(sees("club", "tactics")).toBe(true);
        expect(sees("club", "strategy")).toBe(false);
        expect(levelOf({ tags: {}, moves: [] })).toBe("strong");
        expect(levelOf({ tags: { AILevel: "beginner" }, moves: [] })).toBe("beginner");
        expect(levelOf({ tags: { AILevel: "grandmaster" }, moves: [] })).toBe("strong");
    });

    it("suit every way a player says they play", () => {
        expect(Object.keys(levelForPlayer)).toEqual([...playerLevels]);
        expect(Object.values(levelForPlayer)).toEqual(["beginner", "beginner", "club", "master"]);
        expect(suggestedLevel(undefined, "regular")).toBe("club");
        expect(suggestedLevel(undefined, undefined)).toBe("strong");
        expect(suggestedLevel(undefined, "constructor")).toBe("strong");
        expect(suggestedLevel({ tags: { AILevel: "master" }, moves: [] }, "learning")).toBe("master");
    });

    it("know the book's moves from each position on its lines, transpositions too", () => {
        const book = indexBook(
            "eco\tname\tpgn\nB01\tScandinavian Defense\t1. e4 d5\nB20\tSicilian Defense\t1. e4 c5\nC20\tKing's Pawn Game\t1. e4 e5\nB27\tSicilian Defense: Hyperaccelerated Dragon\t1. e4 c5 2. Nf3 g6\n"
                + "A00\tAmar Opening\t1. Nh3\n",
        );
        const afterE4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

        // The move most lines go through comes first; the others keep the files' order.
        expect(bookMoves(afterE4, book)).toEqual(["c5", "d5", "e5"]);
        expect(bookMoves(afterE4.replace(" 0 1", " 4 9"), book)).toEqual(["c5", "d5", "e5"]);
        expect(bookMoves("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", book)).toEqual(["e4", "Nh3"]);
        expect(bookMoves("rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2", book)).toEqual(["Nf3"]);
        expect(bookMoves("rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1", book)).toEqual([]);
    });

    it("name the trap of the moves only named traps play, and leave out those under one line in fifty", () => {
        const book = indexBook(
            ["eco\tname\tpgn", "A00\tAmar Opening\t1. Nh3", "A00\tAmar Opening: Gambit, Some Trap\t1. Nh3 d5 2. g3", ...Array(50).fill("C20\tKing's Pawn Game\t1. e4 e5"), "B00\tOdd\t1. e4 a6"].join("\n"),
        );
        const afterNh3 = new Chess();
        afterNh3.move("Nh3");
        afterNh3.move("d5");
        const afterE4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

        expect(bookMoves(new Chess().fen(), book)).toEqual(["e4", "Nh3"]);
        expect(bookMoves(afterNh3.fen(), book)).toEqual(["g3 (Some Trap)"]);
        expect(bookMoves(afterE4, book)).toEqual(["e5"]);
    });

    it("name a trap of the real book, on the move that falls into it and on the one that punishes it", async () => {
        const context = playerFolder();
        await run(context, "new_game", { ai_colour: "white", level: "master", from: "1. e4 e5 2. Nf3 Nc6 3. Bb5 Nf6 4. d3 Ne7" });
        expect(await run(context, "status")).toContain("\nBook moves, most named lines first: Nxe5 (Mortimer Trap)\n");

        await run(context, "new_game", { ai_colour: "black", level: "master", from: "1. e4 e5 2. Nf3 Nc6 3. Bb5 Nf6 4. d3 Ne7 5. Nxe5", replace: true });
        expect(await run(context, "status")).toContain("\nBook moves, most named lines first: c6 (Mortimer Trap)\n");
    });

    it("give the beginner the board and the legal moves: no tactical facts, no look, no position", async () => {
        const context = playerFolder();

        expect(await run(context, "new_game", { ai_colour: "black", level: "beginner" })).toMatch(
            /^New game: you play Black, the player White, at the beginner level \(board and legal moves: no tactical facts, no position\)\.\n/,
        );
        const played = await run(context, "player_move", { move: "e4" });

        expect(played).toContain("\nFEN: ");
        expect(played).toContain("\nLegal by piece (20): ");
        expect(played).not.toContain("Attacked pieces");
        expect(played).not.toContain("At risk");
        expect(played).not.toContain("Book moves");
        await expect(run(context, "look")).rejects.toThrow('look without only: "board" is not yours in this game: you play at the beginner level');
        await expect(run(context, "position")).rejects.toThrow("position is not yours in this game: you play at the beginner level");
        expect(await run(context, "look", { only: "board" })).toContain("ⓐ ⓑ ⓒ ⓓ ⓔ ⓕ ⓖ ⓗ");
    });

    it("give every layer of a game over to its analysis, whatever the level it was played at (D-81)", async () => {
        const context = playerFolder();
        await run(context, "new_game", { ai_colour: "black", level: "beginner" });
        await run(context, "player_move", { move: "e4" });
        await run(context, "end_game", { result: "player_resigns" });

        expect(await run(context, "look")).toContain("Legal by piece");
        expect(await run(context, "position")).toContain("Phase: opening");
    });

    it("give the club the tactical facts but not position, and the master the book's moves", async () => {
        const context = playerFolder();

        await run(context, "new_game", { ai_colour: "black", level: "club" });
        expect(await run(context, "player_move", { move: "e4" })).toContain("Legal by piece");
        await expect(run(context, "position")).rejects.toThrow("position is not yours in this game: you play at the club level");

        await run(context, "new_game", { ai_colour: "black", level: "master", replace: true });
        const played = await run(context, "player_move", { move: "e4" });

        expect(played).toMatch(/\nBook moves, most named lines first: (?:[^,\n]+, )*c5, /);
        expect(await run(context, "position")).toContain("Phase: opening");
        expect(await run(context, "status")).toContain("Game: you play Black, the player White, at the master level (board, tactical and positional facts, opening book).");
    });

    it("start from the player's level, then keep the game before's", async () => {
        const context = playerFolder();

        await run(context, "new_profile", { name: "Anna", level: "learning" });
        expect(await run(context, "new_game", { ai_colour: "black" })).toContain("at the beginner level");
        expect(await run(context, "new_game", { ai_colour: "white", level: "club", replace: true })).toContain("at the club level");
        expect(await run(context, "new_game", { ai_colour: "white", replace: true })).toContain("at the club level");
    });
});

function playerFolder(): Context
{
    const folder = mkdtempSync(join(tmpdir(), "chesspal-"));
    folders.push(folder);
    return testContext(folder);
}

async function run(context: Context, name: string, input: Record<string, unknown> = {}): Promise<string>
{
    const command = commands.find((each) => each.name === name);

    if (command === undefined) {
        throw new Error(`No command ${name}.`);
    }

    return command.format(await command.run(command.input.parse(input), context));
}
