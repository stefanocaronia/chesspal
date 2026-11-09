import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { aiMove } from "../src/commands/ai-move.ts";
import { analyseGame } from "../src/commands/analyse-game.ts";
import { annotateGame } from "../src/commands/annotate-game.ts";
import type { Context } from "../src/commands/context.ts";
import { deleteGame } from "../src/commands/delete-game.ts";
import { deleteReview } from "../src/commands/delete-review.ts";
import { endGame } from "../src/commands/end-game.ts";
import { commands } from "../src/commands/index.ts";
import { newGame } from "../src/commands/new-game.ts";
import { playerMove } from "../src/commands/player-move.ts";
import { annotatorOf, isReviewed, leadOf, readPgn, unreviewed } from "../src/core/index.ts";
import { archivedGames, gameInAnalysis, keepJudgment, keptGames, loadGame, playerPgn, rewriteGame } from "../src/games/index.ts";
import { gameFolder } from "../src/profiles/index.ts";
import { testContext } from "./commands.ts";

const folders: string[] = [];

afterEach(() => {
    for (const folder of folders.splice(0)) {
        rmSync(folder, { recursive: true, force: true });
    }
});

const pgn = `[White "Ann"]
[Black "Bob"]
[Result "1-0"]

1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0`;

const kept = "study/2026-11-02-153012.pgn";

describe("a review taken off a record (D-92)", () => {
    it("loses the badges with their NAGs, the notes, drawings and leads, the word on the game and its signature, and keeps the rest", () => {
        const [record] = readPgn(`[White "Ann"]
[Black "Bob"]
[Annotator "claude-opus-5-5"]
[AnnotatorEffort "high"]

{[%review A short game.] [%closing Well won.] Played at the club.} 1. e4 $1 {[%clk 0:04:30] [%badge great] [%review the centre] [%cal Ge2e4] [%lead +0.3]} 1... e5 $2 {a slip} *`);
        const plain = unreviewed(record!);

        expect(plain.tags).toEqual({ White: "Ann", Black: "Bob", Result: "*" });
        expect(plain.comment).toBe("Played at the club.");
        expect(plain.moves).toEqual([{ san: "e4", comment: "[%clk 0:04:30]" }, { san: "e5", nags: [2], comment: "a slip" }]);
        expect(isReviewed(plain)).toBe(false);
        expect(annotatorOf(plain)).toBeUndefined();
        expect(leadOf(plain.moves[0]!.comment)).toBeUndefined();
    });

    it("keeps the Annotator of a game from elsewhere the AI never reviewed", () => {
        const [record] = readPgn(`[White "Ann"]
[Black "Bob"]
[Annotator "https://lichess.org/@/LesFrondes"]

1. e4 {[%clk 0:04:30]} e5 *`);

        expect(unreviewed(record!).tags).toMatchObject({ Annotator: "https://lichess.org/@/LesFrondes" });
    });
});

describe("delete_review and delete_game (D-92)", () => {
    it("are the command line's alone: the AI never deletes the player's games", () => {
        for (const command of [deleteGame, deleteReview]) {
            expect(commands).toContain(command);
            expect(command).toMatchObject({ cliOnly: true, destructive: true });
        }
    });

    it("delete a game's review and leave the game, to analyse again", async () => {
        const context = playerFolder();
        await analyseGame.run(analyseGame.input.parse({ pgn }), context);
        const folder = gameFolder(context.folder);
        await annotateGame.run(annotateGame.input.parse({ notes: [{ move: "3...", badge: "blunder", note: "leaves f7" }], ahead: { "3...": 5 }, summary: "Quick." }), context);
        const before = gameInAnalysis(folder)!.at;
        expect(readFileSync(join(folder, kept), "utf8")).toMatch(/%badge[\s\S]*%lead/);

        expect(deleteReview.format(await deleteReview.run({ game: "2026-11-02-153012" }, laterOf(context)))).toBe(`${kept}: review deleted. analyse_game goes over it again.`);
        const text = readFileSync(join(folder, kept), "utf8");
        expect(text).not.toMatch(/%badge|%review|%lead|Annotator/);
        expect(text).toContain("4. Qxf7# 1-0");
        // The page showing the game hears of it.
        expect(gameInAnalysis(folder)).toMatchObject({ game: kept });
        expect(gameInAnalysis(folder)!.at).not.toBe(before);
        expect(deleteReview.format(await deleteReview.run({ game: kept }, context))).toContain("it had no review");
        expect(() => deleteReview.run({ game: "study/2026-11-03-101010.pgn" }, context)).toThrow(/^There is no study\/2026-11-03-101010.pgn among the games kept to study/);
    });

    it("delete a game kept to study, and end its analysis", async () => {
        const context = playerFolder();
        await analyseGame.run(analyseGame.input.parse({ pgn }), context);
        const folder = gameFolder(context.folder);

        expect(deleteGame.format(await deleteGame.run({ game: kept }, context))).toBe(`${kept} deleted, with its review.`);
        expect(keptGames(folder)).toEqual([]);
        expect(gameInAnalysis(folder)).toBeUndefined();
        expect(() => deleteGame.run({ game: kept }, context)).toThrow(`There is no ${kept} to delete: give a game's name as past_games or study_games writes it.`);
        // An analyst still at work cannot write it back.
        expect(() => rewriteGame(folder, kept, readPgn(pgn)[0]!)).toThrow(`There is no ${kept} to write again`);
        expect(existsSync(join(folder, kept))).toBe(false);
    });

    it("delete a game whole whatever game.json holds: another game over stays, one Chesspal cannot read is no reason to stop halfway", async () => {
        const context = playerFolder();
        await newGame.run(newGame.input.parse({ ai_colour: "black", level: "beginner" }), context);
        const folder = gameFolder(context.folder);
        await playerMove.run(playerMove.input.parse({ move: "e4" }), context);
        await endGame.run(endGame.input.parse({ result: "player_resigns" }), context);
        await analyseGame.run(analyseGame.input.parse({ pgn }), laterOf(context));
        const study = keptGames(folder)[0]!;

        await deleteGame.run({ game: study }, context);
        expect(loadGame(folder)).toBeDefined();

        await analyseGame.run(analyseGame.input.parse({ pgn }), laterOf(laterOf(context)));
        writeFileSync(join(folder, "game.json"), "{");
        await deleteGame.run({ game: keptGames(folder)[0]! }, context);
        expect(keptGames(folder)).toEqual([]);
    });

    it("forget the coach's judgments on the game just over with its review: they would go back into it", async () => {
        const context = playerFolder();
        await newGame.run(newGame.input.parse({ ai_colour: "black", level: "beginner" }), context);
        const folder = gameFolder(context.folder);
        await playerMove.run(playerMove.input.parse({ move: "e4" }), context);
        await aiMove.run(aiMove.input.parse({ move: "d5", plan: "open the centre" }), context);
        await endGame.run(endGame.input.parse({ result: "player_resigns" }), context);
        keepJudgment(folder, loadGame(folder)!, { ply: 1, badge: "great", note: "the centre" });
        expect(playerPgn(folder, loadGame(folder)!)).toContain("[%badge great]");

        await deleteReview.run({ game: "2026-11-02-153012" }, context);
        expect(playerPgn(folder, loadGame(folder)!)).not.toContain("%badge");
    });

    it("delete the game just over from the table too, which the next game would otherwise archive again", async () => {
        const context = playerFolder();
        await newGame.run(newGame.input.parse({ ai_colour: "black", level: "beginner" }), context);
        const folder = gameFolder(context.folder);
        await playerMove.run(playerMove.input.parse({ move: "e4" }), context);
        await aiMove.run(aiMove.input.parse({ move: "d5", plan: "open the centre" }), context);
        await endGame.run(endGame.input.parse({ result: "player_resigns" }), context);
        expect(archivedGames(folder)).toEqual(["games/2026-11-02-153012.pgn"]);

        await deleteGame.run({ game: "2026-11-02-153012" }, context);
        expect(loadGame(folder)).toBeUndefined();
        expect(existsSync(join(folder, "game.json"))).toBe(false);

        await newGame.run(newGame.input.parse({ ai_colour: "black", level: "beginner" }), laterOf(context));
        expect(archivedGames(folder)).toEqual([]);
    });
});

function playerFolder(): Context
{
    const folder = mkdtempSync(join(tmpdir(), "chesspal-"));
    folders.push(folder);
    return testContext(folder);
}

/** The same folder a minute later. */
function laterOf(context: Context): Context
{
    const later = new Date(context.now().getTime() + 60_000);
    return { ...context, now: () => later };
}
