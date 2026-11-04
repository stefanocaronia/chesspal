import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { aiMove } from "../src/commands/ai-move.ts";
import { analyseGame } from "../src/commands/analyse-game.ts";
import { annotateGame } from "../src/commands/annotate-game.ts";
import type { Context } from "../src/commands/context.ts";
import { endGame } from "../src/commands/end-game.ts";
import { newGame } from "../src/commands/new-game.ts";
import { playerMove } from "../src/commands/player-move.ts";
import { status } from "../src/commands/status.ts";
import { closingOf, gameReviewOf, readPgn, reviewed, reviewOf, withGameReview, writePgn } from "../src/core/index.ts";
import { gameInAnalysis, startAnalysis } from "../src/games/index.ts";
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

describe("the AI's review of a move (D-69)", () => {
    it("rides in the move's comment, beside what it held, with the NAG of its badge in place of the one before", () => {
        const [played] = readPgn("1. e4 Nf6? $18 {[%clk 0:04:30]} *");
        const move = reviewed(played!.moves[1]!, { badge: "blunder", note: "  leaves f7 [to] the queen\n" });

        expect(move).toEqual({ san: "Nf6", nags: [4, 18], comment: "[%clk 0:04:30] [%badge blunder] [%review leaves f7 to the queen]" });
        expect(reviewOf(move.comment)).toEqual({ badge: "blunder", note: "leaves f7 to the queen" });

        const again = reviewed(move, { badge: "best" });
        expect(again).toEqual({ san: "Nf6", nags: [18], comment: "[%clk 0:04:30] [%badge best]" });
        expect(reviewOf(again.comment)).toEqual({ badge: "best" });
        expect(reviewOf("[%badge superb]")).toBeUndefined();
        expect(reviewOf(undefined)).toBeUndefined();
    });

    it("keeps the word on the whole game in the comment before the first move, and reads it back from the PGN", () => {
        const [record] = readPgn(pgn);
        const summary = withGameReview(withGameReview(record!, { summary: "A first word.", closing: "Well won." }), { summary: "White {won} fast." });
        const [read] = readPgn(writePgn({ ...summary, moves: [reviewed(summary.moves[0]!, { badge: "book" }), ...summary.moves.slice(1)] }));

        expect(summary.comment).toBe("[%review White won fast.] [%closing Well won.]");
        expect(gameReviewOf(read!)).toBe("White won fast.");
        expect(closingOf(read!)).toBe("Well won.");
        expect(reviewOf(read!.moves[0]!.comment)).toEqual({ badge: "book" });
        expect(withGameReview(record!, { summary: " " })).toEqual({ tags: record!.tags, moves: record!.moves });
        expect(gameReviewOf(withGameReview(record!, { summary: "Two points:\n- the queen\n* the king" }))).toBe("Two points: • the queen • the king");
    });
});

describe("annotate_game (D-69)", () => {
    it("marks the moves of the game in analysis and keeps a word on the whole game, which analyse_game then gives back", async () => {
        const context = playerFolder();
        await analyse(context, { pgn });
        expect(gameInAnalysis(gameFolder(context.folder))?.game).toBe(kept);

        // The book's moves without a note of the AI's are named, for the AI to give each a word in the player's language.
        const book = (moves: string): string => `\nThe book's moves ${moves} have no note of yours: the page shows the book's English name there. A short note on each, in the player's words, takes its place.`;
        const notes = [{ move: "3...", badge: "blunder", note: "leaves f7 to the queen" }, { move: "4.Qxf7#", badge: "best" }];
        expect(await annotate(context, { notes, summary: "A short game: Black missed the threat on f7." }))
            .toBe(`Kept in ${kept}: 2 moves marked and your word on the game. The board page shows them.${book("1. 1... 2. 2... 3.")}`);
        expect(await annotate(context, { notes: [{ move: "3...Nf6", badge: "mistake" }] })).toBe(`Kept in ${kept}: 1 move marked. The board page shows them.${book("1. 1... 2. 2... 3.")}`);
        expect(await annotate(context, { summary: "Black missed the threat on f7." })).toBe(`Kept in ${kept}: your word on the game. The board page shows them.${book("1. 1... 2. 2... 3.")}`);
        expect(await annotate(context, { notes: [{ move: "1.", badge: "book" }], summary: "Black missed the threat on f7.", closing: "A quick win." }))
            .toBe(`Kept in ${kept}: 1 move marked, your word on the game and your last word. The board page shows them.${book("1. 1... 2. 2... 3.")}`);

        expect(await annotate(context, { notes: [{ move: "2.", note: "the bishop eyes f7" }] })).toBe(`Kept in ${kept}: 1 move marked. The board page shows them.${book("1. 1... 2... 3.")}`);
        await expect(async () => annotate(context, { notes: [{ move: "2." }] })).rejects.toThrow("Give 2. a badge, a note, or both: arrows and squares go with them. Nothing changed.");

        const analysis = await analyse(context, { game: kept });
        // A note alone on a move of the book keeps its book badge.
        expect(analysis).toContain('\n2.Bc4: you marked book: "the bishop eyes f7"\n');
        expect(analysis).toContain("\nYour review: Black missed the threat on f7. A quick win.\n");
        expect(analysis).toMatch(/\n3\.\.\.Nf6: .*; you marked mistake\n/);
        expect(analysis).toMatch(/\n4\.Qxf7#: .*; you marked best\n?$/);
        expect(readFileSync(join(context.folder, kept), "utf8").replace(/\s+/g, " ")).toContain(
            "{[%review Black missed the threat on f7.] [%closing A quick win.]} 1. e4 {[%badge book]} 1... e5 {[%badge book]} 2. Bc4 {[%badge book] [%review the bishop eyes f7]} 2... Nc6 {[%badge book]} 3. Qh5 {[%badge book]} 3... Nf6? {[%badge mistake]}",
        );
    });

    it("keeps the arrows and squares a note draws as PGN's %cal and %csl, which a new review of the move replaces", async () => {
        const context = playerFolder();
        await analyse(context, { pgn });

        await annotate(context, { notes: [{ move: "3...", badge: "blunder", note: "f7 falls", arrows: ["Rh5f7", "Gf6h5"], squares: ["Rf7"] }] });
        const [read] = readPgn(readFileSync(join(context.folder, kept), "utf8"));
        expect(read!.moves[5]!.comment).toBe("[%badge blunder] [%review f7 falls] [%cal Rh5f7,Gf6h5] [%csl Rf7]");
        expect(reviewOf(read!.moves[5]!.comment)).toEqual({
            badge: "blunder",
            note: "f7 falls",
            arrows: [{ colour: "red", from: "h5", to: "f7" }, { colour: "green", from: "f6", to: "h5" }],
            squares: [{ colour: "red", square: "f7" }],
        });

        await annotate(context, { notes: [{ move: "3...", badge: "mistake" }] });
        expect(reviewOf(readPgn(readFileSync(join(context.folder, kept), "utf8"))[0]!.moves[5]!.comment)).toEqual({ badge: "mistake" });
        await expect(async () => annotate(context, { notes: [{ move: "3...", note: "x", arrows: ["Xh5f7"] }] })).rejects.toThrow();
        await expect(async () => annotate(context, { notes: [{ move: "3...", arrows: ["Rh5f7"] }] })).rejects.toThrow("Give 3... a badge, a note, or both");
    });

    it("keeps the review when the same game is brought again as a PGN", async () => {
        const context = playerFolder();
        await analyse(context, { pgn });
        await annotate(context, { notes: [{ move: "3...", badge: "blunder" }], summary: "Black missed the threat on f7." });
        const before = readFileSync(join(context.folder, kept), "utf8");

        const again = await analyse(context, { pgn });
        expect(readFileSync(join(context.folder, kept), "utf8")).toBe(before);
        expect(again).toContain("\nYour review: Black missed the threat on f7.\n");
        expect(again).toMatch(/\n3\.\.\.Nf6: .*; you marked blunder\n/);
    });

    it("changes nothing when a move is not in the game, and refuses without a game in analysis or while a game goes on", async () => {
        const context = playerFolder();
        await expect(async () => annotate(context, { summary: "Fine." })).rejects.toThrow(/^No game is in analysis: call analyse_game first/);

        await analyse(context, { pgn });
        const before = readFileSync(join(context.folder, kept), "utf8");
        await expect(async () => annotate(context, { notes: [{ move: "1.", badge: "book" }, { move: "9.", badge: "best" }] })).rejects.toThrow("There is no 9. in this game");
        await expect(async () => annotate(context, {})).rejects.toThrow(/^Give notes on the moves that matter/);
        await expect(async () => annotate(context, { notes: [{ move: "1.", badge: "superb" }] })).rejects.toThrow();
        expect(readFileSync(join(context.folder, kept), "utf8")).toBe(before);

        await newGame.run(newGame.input.parse({ ai_colour: "black", level: "beginner" }), context);
        expect(gameInAnalysis(gameFolder(context.folder))).toBeUndefined();
        await expect(async () => annotate(context, { game: kept, summary: "Fine." })).rejects.toThrow(/^A game is going on/);
    });

    it("marks the game played here once it is over, in the archive", async () => {
        const context = playerFolder();
        await newGame.run(newGame.input.parse({ ai_colour: "black", level: "beginner" }), context);
        await playerMove.run(playerMove.input.parse({ move: "e4" }), context);
        await aiMove.run(aiMove.input.parse({ move: "d5", plan: "open the centre" }), context);
        await endGame.run(endGame.input.parse({ result: "player_resigns" }), context);

        expect(await annotate(context, { game: "2026-11-02-153012", notes: [{ move: "1...", badge: "book" }] }))
            .toBe(
                "Kept in games/2026-11-02-153012.pgn: 1 move marked. The board page shows them.\nThe book's move 1... has no note of yours: the page shows the book's English name "
                    + "there. A short note on each, in the player's words, takes its place.",
            );
        expect(gameInAnalysis(gameFolder(context.folder))?.game).toBe("games/2026-11-02-153012.pgn");
        expect(await analyse(context, {})).toMatch(/in the book to the end: those moves have the book badge[^\n]*\n[\s\S]*\n1\.\.\.d5: at risk: undefended White Pe4; your plan: open the centre$/);
        expect(existsSync(join(context.folder, kept))).toBe(false);
    });

    it("gives one next step in status when the player brings a game on the board page just after one is over", async () => {
        const context = playerFolder();
        await newGame.run(newGame.input.parse({ ai_colour: "black", level: "beginner" }), context);
        await endGame.run(endGame.input.parse({ result: "player_resigns" }), context);
        await analyse(context, { pgn });
        startAnalysis(gameFolder(context.folder), kept, context.now(), true);

        const lines = status.format(await status.run({}, context));
        expect(lines.match(/Next:/g)).toHaveLength(1);
        expect(lines).toContain(`Next: call analyse_game {"game": "${kept}"}, then keep your review on that page with annotate_game`);
    });
});

async function analyse(context: Context, input: object): Promise<string>
{
    return analyseGame.format(await analyseGame.run(analyseGame.input.parse(input), context));
}

async function annotate(context: Context, input: object): Promise<string>
{
    return annotateGame.format(await annotateGame.run(annotateGame.input.parse(input), context));
}

function playerFolder(): Context
{
    const folder = mkdtempSync(join(tmpdir(), "chesspal-"));
    folders.push(folder);
    return testContext(folder);
}
