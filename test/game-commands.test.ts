import { commands } from "chesspal";
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCommandLine } from "../src/cli/command-line.ts";
import { answerDraw, offerDraw } from "../src/commands/game/draw-offer.ts";
import type { Context } from "../src/commands/registry/context.ts";
import { archiveGame, loadGame, rerunIfChanged } from "../src/games/index.ts";
import { gameFolder } from "../src/profiles/index.ts";
import { testContext } from "./commands.ts";

const folders: string[] = [];
const archive = "games/2026-11-02-153012.pgn";

afterEach(() => {
    for (const folder of folders.splice(0)) {
        rmSync(folder, { recursive: true, force: true });
    }
});

describe("a game in chat", () => {
    it("plays the player's and the AI's moves, and saves them in game.json with the AI's comment and plan", async () => {
        const context = playerFolder();

        expect(await run(context, "status")).toContain(
            "No game.\nNext: when the player wants a game, call new_game without choices: it opens the board page's New game window, where the player chooses the colour, the clock and the level.",
        );
        expect(await run(context, "new_game", { ai_colour: "black" })).toBe(
            "New game: you play Black, the player White, at the strong level (board, tactical and positional facts).\nPlayer (White) to move, move 1.\nNext: wait for the player's move, then call player_move with it.",
        );
        expect(await run(context, "player_move", { move: "e4" })).toMatch(
            /^Player: 1\.e4 \(e2-e4\)\.\nYou \(Black\) to move, move 1\.\nOpening: B00 King's Pawn Game\nMaterial: even, nothing taken\nFEN: rnbqkbnr\/pppppppp\/8\/8\/4P3\/8\/PPPP1PPP\/RNBQKBNR b KQkq - 0 1\nChecks: none for either side\nCaptures: none\nAt risk: none\nBlack \(to move\) tactics: none\nPinned: none\nLoose: .*\nAttacked pieces: none\nLegal by piece \(20\): Nb8 \(2\) Nc6 Na6; .* Ph7 \(2\) h6 h5; no moves: Ke8 Qd8 Ra8 Rh8 Bc8 Bf8\nNext: choose your move/,
        );
        expect(await run(context, "ai_move", { move: "e5", plan: "Develop the knights, then castle.", comment: "The open game." })).toBe(
            "Played 1...e5.\nPlayer (White) to move, move 2.\nNo board page is open: copy this board into your message.\n  ⓐ ⓑ ⓒ ⓓ ⓔ ⓕ ⓖ ⓗ\n8 ♜ ♞ ♝ ♛ ♚ ♝ ♞ ♜ 8\n7 ♟︎ ♟︎ ♟︎ ♟︎ ⊙ ♟︎ ♟︎ ♟︎ 7\n6 ⊙ ⊙ ⊙ ⊙ ⊙ ⊙ ⊙ ⊙ 6\n"
                + "5 ⊙ ⊙ ⊙ ⊙ ♟︎ ⊙ ⊙ ⊙ 5\n4 ⊙ ⊙ ⊙ ⊙ ♙ ⊙ ⊙ ⊙ 4\n3 ⊙ ⊙ ⊙ ⊙ ⊙ ⊙ ⊙ ⊙ 3\n2 ♙ ♙ ♙ ♙ ⊙ ♙ ♙ ♙ 2\n1 ♖ ♘ ♗ ♕ ♔ ♗ ♘ ♖ 1\n  ⓐ ⓑ ⓒ ⓓ ⓔ ⓕ ⓖ ⓗ\nNext: wait for the player's move, then call player_move with it.",
        );
        expect(await run(context, "player_move", { move: "g1f3" })).toContain("\nPlan: Develop the knights, then castle.\n");

        const file = gameFile(context);

        expect(Object.keys(file)).toEqual(["format", "ai", "started", "pgn"]);
        expect(file).toMatchObject({ format: 1, ai: "black", started: new Date(2026, 10, 2, 15, 30, 12).toISOString() });
        expect(file.pgn).toContain('[Date "2026.11.02"]\n[Round "?"]\n[White "Player"]\n[Black "AI"]');
        expect(file.pgn).toContain("1. e4 e5 {The open game. [%plan Develop the knights, then castle.]} 2. Nf3 *");
    });

    it("draws the AI's colour, and goes on from a FEN or a PGN", async () => {
        expect(await run(playerFolder(0.2), "new_game", { ai_colour: "random" })).toContain("you play White");
        expect(await run(playerFolder(0.7), "new_game", { ai_colour: "random" })).toContain("you play Black");
        expect(await run(playerFolder(), "new_game", { ai_colour: "white", from: "4k3/8/8/8/8/8/4P3/4K3 w - - 0 40" })).toContain(
            "You (White) to move, move 40.\nMaterial: White +1 in pawns (White took Q 2R 2B 2N 8P, Black took Q 2R 2B 2N 7P)\nFEN: 4k3/8/8/8/8/8/4P3/4K3 w - - 0 40\nChecks: none for either side\nCaptures: none\n",
        );

        const context = playerFolder();

        const lichess = '[White "Morphy"]\n[Result "1-0"]\n[Termination "Unterminated"]\n\n1. e4 e5 {[%mood happy]} 2. Nf3 {[%plan Theirs.]} 1-0';

        expect(await run(context, "new_game", { ai_colour: "black", from: lichess })).toMatch(
            /You \(Black\) to move, move 2\.\nLast move: 2\.♞f3 \(g1-f3\)\.\nOpening: C40 King's Knight Opening\nMaterial: even, nothing taken\nFEN: .*\n(?:.*\n)*Attacked pieces \(attackers \/ defenders\):\nBlack Pe5: Nf3 \/ -\nLegal by piece \(29\): [^\n]*\nNext: /,
        );
        expect(gameFile(context).pgn).toContain('[White "Player"]\n[Black "AI"]\n[Result "*"]\n[AILevel "strong"]\n\n1. e4 e5 2. Nf3 *');
    });

    it("refuses to go on from a game that is over, from several games, or from an impossible position", async () => {
        const start = (from: string): Promise<string> => run(playerFolder(), "new_game", { ai_colour: "black", from });

        await expect(start("1. f3 e5 2. g4 Qh4# 0-1")).rejects.toThrow("from holds a game already over (0-1): give one still going on");
        await expect(start("1. e4 *\n\n1. d4 *")).rejects.toThrow("from: it holds 2 games: give one, in PGN, or a FEN. Nothing changed.");
        await expect(start("4k3/8/8/8/8/8/8/4RK2 w - - 0 1")).rejects.toThrow(/^from: The FEN tag is not a valid position \(the side not to move is in check\)/);
        await expect(start("1. e4 e4 *")).rejects.toThrow(/^from: Line 1, move 1: e4 is not legal here/);
    });

    it("refuses a move out of turn, an illegal one, and any without a game: nothing changes", async () => {
        const context = playerFolder();

        await expect(run(context, "player_move", { move: "e4" })).rejects.toThrow("There is no game going on: start one with new_game. Nothing changed.");
        await run(context, "new_game", { ai_colour: "black" });
        await expect(run(context, "ai_move", { move: "e5", plan: "p", comment: "c" })).rejects.toThrow(
            "It is the player's move (White): wait for it, then call player_move. Nothing changed.",
        );
        await expect(run(context, "player_move", { move: "e5" })).rejects.toThrow("e5 is not legal here, with White to move. Ask the player again. Nothing changed.");
        await run(context, "player_move", { move: "e4" });
        await expect(run(context, "player_move", { move: "d4" })).rejects.toThrow("It is your move (Black): call ai_move. Nothing changed.");
        await expect(run(context, "ai_move", { move: "e4", plan: "p", comment: "c" })).rejects.toThrow(/^e4 is not legal here, with Black to move\. Legal: Nc6 .* h5\. Nothing changed\.$/);
        expect(gameFile(context).pgn).toContain("\n\n1. e4 *");
    });

    it("takes the AI's plan in one sentence, and a comment only when it has one, without brackets", async () => {
        const { input } = command("ai_move");

        expect(input.safeParse({ move: "e5", plan: "p".repeat(200), comment: "c".repeat(300) }).success).toBe(true);
        // 300 characters with the helps off, as long as an analyst's note with them on (D-78): the command checks which.
        expect(input.safeParse({ move: "e5", plan: "p", comment: "c".repeat(701) }).success).toBe(false);
        expect(input.safeParse({ move: "e5", plan: "p".repeat(201), comment: "c" }).success).toBe(false);
        expect(input.safeParse({ move: "e5", plan: "p", comment: " " }).success).toBe(false);
        expect(input.safeParse({ move: "e5", plan: "p" }).success).toBe(true);
        expect(input.safeParse({ move: "e5" }).success).toBe(false);
        expect((await runCommandLine(["ai_move", "e5", "--plan", "a [b]", "--comment", "c"], playerFolder())).output).toMatch(
            /^--plan: write it without \[ \] \{ \}\. Nothing changed\./,
        );
    });

    it("lets the AI teach only with the helps on, tells it a coach judges the player's moves, and tells it when the helps go off (D-78, D-88)", async () => {
        const context = playerFolder();
        const helps = (on: boolean): void => writeFileSync(join(gameFolder(context.home()), "settings.json"), JSON.stringify({ helps: on }));
        // With no game going on, the AI talks a game over as long as with the helps on (D-101).
        await run(context, "ai_say", { text: "c".repeat(700) });
        await expect(run(context, "ai_say", { text: "c".repeat(701) })).rejects.toThrow("write 700 characters at most");
        helps(true);
        await run(context, "ai_say", { text: "c".repeat(700) });

        helps(false);
        await run(context, "new_game", { ai_colour: "black" });
        await run(context, "player_move", { move: "e4" });
        expect(await run(context, "status")).not.toContain("Helps");
        await expect(run(context, "ai_move", { move: "e5", plan: "p", arrows: ["Gg8f6"], comment: "c".repeat(301) })).rejects.toThrow(
            "The player has the helps off: play without arrows and squares, with the comment in 300 characters at most. Nothing changed.",
        );
        await expect(run(context, "ai_move", { move: "e5", plan: "p", arrows: ["Ge4e4"] })).rejects.toThrow("an arrow goes from a square to another");
        await run(context, "ai_move", { move: "e5", plan: "p" });

        helps(true);
        await run(context, "player_move", { move: "Nf3" });
        const helpsOn = await run(context, "status");
        expect(helpsOn).toContain("Helps on: the player wants to learn. Tell your intentions, never their best move;");
        // No coach runs outside Claude Code: nobody judges the player's moves before the analyst (D-80, Priya).
        expect(helpsOn).not.toContain("A coach");
        expect(Object.keys(command("ai_move").input.shape)).not.toContain("badge");
        await run(context, "ai_move", { move: "Nc6", plan: "p", comment: "c".repeat(500), arrows: ["Gc6d4"], squares: ["Re5"] });
        expect(gameFile(context).pgn).toMatch(/2\. Nf3\s+Nc6\s+\{ ?c{500}\s+\[%plan p\]\s+\[%cal Gc6d4\]\s+\[%csl Re5\] ?\}/);

        helps(false);
        await run(context, "player_move", { move: "Bb5" });
        expect(await run(context, "status")).toContain("Helps off now: play as at a tournament again");
    });

    it("gives the AI the player's language once a chat, and each move with the pieces' figurines alone, in every language (D-86, D-87)", async () => {
        const context = { ...playerFolder(), language: "it-IT" };
        const speech = "\nThe player speaks Italian.\n";
        expect(await run(context, "new_game", { ai_colour: "black" })).toContain(speech);
        expect(await run(context, "status")).toContain(speech);
        await expect(run(context, "player_move", { move: "Cf3" })).rejects.toThrow('"Cf3" is not a move: SAN writes the pieces K, Q, R, B and N');
        expect(await run(context, "player_move", { move: "Nf3" })).toMatch(/^Player: 1\.♞f3 \(g1-f3\)\.\n/);
        expect(await run(context, "ai_move", { move: "d5", plan: "p" })).toMatch(/^Played 1\.\.\.d5\.\n/);
        expect(await run(context, "player_move", { move: "d4" })).toMatch(/^Player: 2\.d4 \(d2-d4\)\.\n/);
        expect(await run(context, "ai_move", { move: "Nf6", plan: "p" })).toMatch(/^Played 2\.\.\.♞f6\.\n/);

        writeFileSync(join(gameFolder(context.home()), "settings.json"), JSON.stringify({ language: "it" }));
        expect(await run({ ...playerFolder(), language: "fr-FR" }, "status")).toMatch(/\nThe player speaks French\.\n/);
        expect(await run({ ...playerFolder(), language: "en-GB" }, "status")).not.toContain("The player speaks");
        expect(await run(context, "player_move", { move: "Bf4" })).toMatch(/^Player: 3\.♝f4 \(c1-f4\)\.\n/);
        expect(await run(context, "ai_move", { move: "Bf5", plan: "p" })).toMatch(/^Played 3\.\.\.♝f5\.\n/);
    });

    it("tells the AI the helps are on when it moves first in a new game (D-78)", async () => {
        const context = playerFolder();
        writeFileSync(join(gameFolder(context.home()), "settings.json"), JSON.stringify({ helps: true }));
        expect(await run(context, "new_game", { ai_colour: "white" })).toContain("Helps on");
    });

    it("keeps the AI's mood in its move's comment, and tells it while it lasts (D-70)", async () => {
        const context = playerFolder();
        await run(context, "new_game", { ai_colour: "black" });
        await run(context, "player_move", { move: "e4" });

        expect(command("ai_move").input.safeParse({ move: "e5", plan: "p", mood: "furious" }).success).toBe(false);
        expect(await run(context, "ai_move", { move: "e5", plan: "Hold the centre.", mood: "worried" })).toContain("Player (White) to move, move 2.\nNo board page is open");
        expect(await run(context, "status")).toContain("Your mood: worried, on your face for 2 more of your moves, then neutral by itself.");
        expect(gameFile(context).pgn).toContain("1. e4 e5 {[%plan Hold the centre.] [%mood worried]} *");
        expect(await run(context, "player_move", { move: "Nf3" })).toContain("\nPlan: Hold the centre.\nYour mood: worried, on your face for 2 more of your moves, then neutral by itself.");

        await run(context, "ai_move", { move: "Nc6", plan: "p" });
        await run(context, "player_move", { move: "Bc4" });
        await run(context, "ai_move", { move: "Nf6", plan: "p" });

        expect(await run(context, "status")).toContain("Your mood: worried, on your face until your next move,");

        await run(context, "player_move", { move: "Ng5" });
        await run(context, "ai_move", { move: "d5", plan: "p" });

        expect(await run(context, "status")).not.toContain("Your mood");
    });

    it("keeps the mood the game ends with: on the player's last move with ai_say, on the AI's with end_game, in the archive too (D-70)", async () => {
        const mated = playerFolder();
        await run(mated, "new_game", { ai_colour: "white" });
        await run(mated, "ai_move", { move: "f3", plan: "p" });
        await run(mated, "player_move", { move: "e5" });

        await expect(run(mated, "ai_say", { text: "Hm.", mood: "worried" })).rejects.toThrow("While the game goes on your mood comes with ai_move: say it without mood. Nothing changed.");

        await run(mated, "ai_move", { move: "g4", plan: "p", mood: "happy" });
        await run(mated, "player_move", { move: "Qh4#" });
        await run(mated, "ai_say", { text: "Well played.", mood: "surprised" });

        expect(gameFile(mated).pgn.replace(/\s+/g, " ")).toContain("2. g4 {[%plan p] [%mood happy]} 2... Qh4# {[%mood surprised]} 0-1");
        expect(readArchive(mated).replace(/\s+/g, " ")).toContain("Qh4# {[%mood surprised]} 0-1");

        const resigned = playerFolder();
        await run(resigned, "new_game", { ai_colour: "black" });
        await run(resigned, "player_move", { move: "e4" });
        await run(resigned, "ai_move", { move: "e5", plan: "p", mood: "happy" });
        await run(resigned, "player_move", { move: "Nf3" });
        await run(resigned, "end_game", { result: "ai_resigns", mood: "worried" });

        expect(readArchive(resigned).replace(/\s+/g, " ")).toContain("1. e4 e5 {[%plan p] [%mood happy]} 2. Nf3 {[%mood worried]} 1-0");
    });

    it("keeps a game going on: new_game refuses it, or archives it unfinished with replace", async () => {
        const context = playerFolder();
        await run(context, "new_game", { ai_colour: "white" });
        await run(context, "ai_move", { move: "e4", plan: "Take the centre.", comment: "The king's pawn." });

        await expect(run(context, "new_game", { ai_colour: "black" })).rejects.toThrow(
            "A game is going on, at move 1: end it with end_game, or call new_game with replace: true, which archives it unfinished. Nothing changed.",
        );

        expect(await run(context, "new_game", { ai_colour: "black", replace: true })).toContain("The game before is saved with the player's games, unfinished.");
        expect(readArchive(context)).toContain('[Result "*"]');
        expect(readArchive(context)).toContain("1. e4 {The king's pawn. [%plan Take the centre.]} *");
        // Started in the same second, the new game takes the next one: its name in the archive is its own.
        expect(gameFile(context).started).toBe(new Date(2026, 10, 2, 15, 30, 13).toISOString());
        // A game replaced before any move is not kept.
        expect(await run(context, "new_game", { ai_colour: "black", replace: true })).not.toContain("The game before");
        expect(readdirSync(join(gameFolder(context.home()), "games"))).toEqual(["2026-11-02-153012.pgn"]);
        expect(readArchive(context)).toContain("[%plan Take the centre.]");
    });

    it("keeps a game over whose archive could not be written, and archives it with the next game", async () => {
        const context = playerFolder();
        const games = join(gameFolder(context.home()), "games");
        writeFileSync(games, "a file where the folder goes");
        await run(context, "new_game", { ai_colour: "black" });
        await run(context, "player_move", { move: "f3" });
        await run(context, "ai_move", { move: "e5", plan: "p", comment: "c" });
        await run(context, "player_move", { move: "g4" });

        expect(await run(context, "ai_move", { move: "Qh4#", plan: "Mate.", comment: "c" })).toMatch(
            /^Played 2\.\.\.♛h4#\.\nGame over: 0-1, checkmate\.\nChesspal could not archive the game: .*games could not be made \(.+\): check that it is a folder, and can be written\. The game is saved in game\.json: it goes to the archive when a new game starts\.\nNo board page is open: copy this board into your message\.\n[\s\S]*\nNext: /,
        );
        expect(await run(context, "status")).toContain("Game over: 0-1, checkmate.\nNext: ");
        await expect(run(context, "new_game", { ai_colour: "white" })).rejects.toThrow(/^Chesspal could not archive the game: .* Nothing changed\.$/);
        expect(gameFile(context).pgn).toContain("2. g4 Qh4#");

        rmSync(games);

        expect(await run(context, "new_game", { ai_colour: "white" })).toContain(
            `New game: you play White, the player Black, at the strong level (board, tactical and positional facts).\nThe game before is saved with the player's games.\n`,
        );
        expect(readArchive(context)).toContain("[%plan Mate.]");
    });

    it("leaves the archive as it was when game.json cannot take the new game, and archives the game before once, later", async () => {
        const context = playerFolder();
        const folder = gameFolder(context.home());
        await run(context, "new_game", { ai_colour: "white" });
        await run(context, "ai_move", { move: "e4", plan: "p", comment: "c" });
        const blocked = join(folder, `game.json.${process.pid}.tmp`);
        mkdirSync(blocked);

        await expect(run(context, "new_game", { ai_colour: "black", replace: true })).rejects.toThrow(/^Chesspal could not save the game: .* Nothing changed\.$/);
        expect(gameFile(context).pgn).toContain("1. e4");
        expect(existsSync(join(folder, archive))).toBe(false);

        rmSync(blocked, { recursive: true });

        expect(await run(context, "new_game", { ai_colour: "black", replace: true })).toContain("The game before is saved with the player's games, unfinished.");
        expect(readdirSync(join(folder, "games"))).toEqual(["2026-11-02-153012.pgn"]);
    });

    it("archives a game once when a process stopped between its archive and the new game: the game goes on, and its end rewrites the same file", async () => {
        const context = playerFolder();
        const folder = gameFolder(context.home());
        await run(context, "new_game", { ai_colour: "white" });
        await run(context, "ai_move", { move: "e4", plan: "p", comment: "c" });
        // What a process that stopped after the archive and before game.json leaves behind.
        archiveGame(folder, loadGame(folder)!, {});

        await run(context, "player_move", { move: "e5" });
        await run(context, "end_game", { result: "player_resigns" });
        expect(await run(context, "new_game", { ai_colour: "black" })).toContain("New game: ");

        expect(readdirSync(join(folder, "games"))).toEqual(["2026-11-02-153012.pgn"]);
        expect(readArchive(context)).toContain("1. e4 {c [%plan p]} 1... e5 1-0");
    });

    it("never archives a game another process changed after it was read: the archive it wrote stays", async () => {
        const context = playerFolder();
        const folder = gameFolder(context.home());
        await run(context, "new_game", { ai_colour: "black" });
        await run(context, "player_move", { move: "f3" });
        await run(context, "ai_move", { move: "e5", plan: "p", comment: "c" });
        await run(context, "player_move", { move: "g4" });
        const mated = '[Event "Chesspal"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1\n';
        let played = false;

        // Between new_game's reading of the game and its archive, another process mates and archives the game.
        const other = () => {
            if (!played) {
                played = true;
                writeFileSync(join(folder, "game.json"), JSON.stringify({ ...gameFile(context), pgn: mated }));
                mkdirSync(join(folder, "games"));
                writeFileSync(join(folder, archive), mated);
            }

            return 0;
        };

        const { input, run: start, format } = command("new_game");
        const started = await rerunIfChanged(() => start(input.parse({ ai_colour: "random", replace: true }), { ...context, random: other }));

        expect(format(started)).toContain("New game: ");
        expect(readFileSync(join(folder, archive), "utf8")).toBe(mated);
    });

    it("names each game in the archive by a second of its own, when summer time ends or the clock goes back", async () => {
        const zone = process.env.TZ;
        process.env.TZ = "Europe/Rome";

        try {
            const context = playerFolder();
            const at = (time: string): Context => ({ ...context, now: () => new Date(time) });
            // 02:30 in summer time, then 02:30 again an hour later, in winter time.
            await run(at("2026-10-25T00:30:00Z"), "new_game", { ai_colour: "black" });
            await run(at("2026-10-25T00:30:00Z"), "player_move", { move: "e4" });

            expect(await run(at("2026-10-25T01:30:00Z"), "new_game", { ai_colour: "black", replace: true })).toContain("The game before is saved with the player's games, unfinished.");
            expect(readdirSync(join(gameFolder(context.home()), "games"))).toEqual(["2026-10-25-023000.pgn"]);
            expect(gameFile(context).started).toBe("2026-10-25T01:30:01.000Z");
            await run(at("2026-10-25T01:30:01Z"), "player_move", { move: "e4" });

            // The clock set back an hour: 02:30:00 is taken in the archive, 02:30:01 by the game going on.
            expect(await run(at("2026-10-25T00:30:00Z"), "new_game", { ai_colour: "black", replace: true })).toContain("The game before is saved with the player's games, unfinished.");
            expect(gameFile(context).started).toBe("2026-10-25T00:30:02.000Z");
            expect(readdirSync(join(gameFolder(context.home()), "games"))).toEqual(["2026-10-25-023000.pgn", "2026-10-25-023001.pgn"]);
        } finally {
            if (zone === undefined) {
                delete process.env.TZ;
            } else {
                process.env.TZ = zone;
            }
        }
    });

    it.runIf(process.platform === "win32")("says so when another program holds game.json open, and saves once it lets it go", async () => {
        const context = playerFolder();
        await run(context, "new_game", { ai_colour: "black" });
        const held = openSync(join(gameFolder(context.home()), "game.json"), "r");

        try {
            await expect(run(context, "player_move", { move: "e4" })).rejects.toThrow(
                /^Chesspal could not save the game: .*game\.json is held open by another program, or is read-only \(EPERM, 10 tries\): close that program, or make the file writable\. Nothing changed\.$/,
            );
        } finally {
            closeSync(held);
        }

        expect(await run(context, "player_move", { move: "e4" })).toContain("Player: 1.e4 (e2-e4).");
        expect(existsSync(join(gameFolder(context.home()), `game.json.${process.pid}.tmp`))).toBe(false);
    });

    it("ends by checkmate, archives the game with its plans and how it ended, and refuses any move after it", async () => {
        const context = playerFolder();
        await run(context, "new_game", { ai_colour: "black" });
        await run(context, "player_move", { move: "f3" });
        await run(context, "ai_move", { move: "e5", plan: "Open the queen's diagonal.", comment: "The centre." });
        await run(context, "player_move", { move: "g4" });

        expect(await run(context, "ai_move", { move: "Qh4+", plan: "Mate.", comment: "The fool's mate.", offer_draw: true })).toBe(
            `Played 2...♛h4#.\nNote: Written as Qh4+, but Qh4 is checkmate.\nGame over: 0-1, checkmate. Saved with the player's games.\n`
                + "No board page is open: copy this board into your message.\n  ⓐ ⓑ ⓒ ⓓ ⓔ ⓕ ⓖ ⓗ\n8 ♜ ♞ ♝ ⊙ ♚ ♝ ♞ ♜ 8\n7 ♟︎ ♟︎ ♟︎ ♟︎ ⊙ ♟︎ ♟︎ ♟︎ 7\n6 ⊙ ⊙ ⊙ ⊙ ⊙ ⊙ ⊙ ⊙ 6\n5 ⊙ ⊙ ⊙ ⊙ ♟︎ ⊙ ⊙ ⊙ 5\n"
                + "4 ⊙ ⊙ ⊙ ⊙ ⊙ ⊙ ♙ ♛ 4\n3 ⊙ ⊙ ⊙ ⊙ ⊙ ♙ ⊙ ⊙ 3\n2 ♙ ♙ ♙ ♙ ♙ ⊙ ⊙ ♙ 2\n1 ♖ ♘ ♗ ♕ ♔ ♗ ♘ ♖ 1\n  ⓐ ⓑ ⓒ ⓓ ⓔ ⓕ ⓖ ⓗ\n"
                + "Next: tell the player how the game ended, with ai_say and how you feel as its mood if they play on the board page; then offer them, in words, another game or to go over this one "
                + "(analyse_game). For another, call new_game without choices: it opens the board page's New game window, where the player chooses the colour, the clock and the level.",
        );
        expect(readArchive(context)).toContain('[Result "0-1"]\n[AILevel "strong"]\n[Termination "checkmate"]');
        expect(readArchive(context)).toContain("[%plan Mate.]");
        // A mate leaves no draw offer, even one made with it (D-65).
        expect(readArchive(context)).not.toContain("(=)");
        expect(gameFile(context).drawOffer).toBeUndefined();
        await expect(run(context, "player_move", { move: "a3" })).rejects.toThrow("The game is over (0-1, checkmate): new_game starts another. Nothing changed.");
        expect(await run(context, "status")).toContain(`Moves: 1.f3 e5 2.g4 ♛h4#\nGame over: 0-1, checkmate. Saved with the player's games.`);
        expect(await run(context, "new_game", { ai_colour: "white" })).toContain("New game: you play White");
    });

    it("ends by a resignation, or a draw agreed on an offer once each side has moved, which the board cannot see (D-65)", async () => {
        const ended = async (result: string, offer = false): Promise<string> => {
            const context = playerFolder();
            await run(context, "new_game", { ai_colour: "black" });
            await run(context, "player_move", { move: "e4" });
            await run(context, "ai_move", { move: "e5", plan: "A plan.", offer_draw: offer });
            return run(context, "end_game", { result });
        };

        expect(await ended("player_resigns")).toBe(
            `Game over: 0-1, White resigns. Saved with the player's games.\nNext: tell the player how the game ended, with ai_say and how you feel as its mood if they play on the board page; then offer them, in words, another game or to go over this one `
                + "(analyse_game). For another, call new_game without choices: it opens the board page's New game window, where the player chooses the colour, the clock and the level.",
        );
        expect(await ended("ai_resigns")).toContain("Game over: 1-0, Black resigns.");
        await expect(ended("draw_agreed")).rejects.toThrow("No draw offer stands: the player offers one with their move (player_move with offer_draw), you with yours");
        expect(await ended("draw_agreed", true)).toContain("Game over: 1/2-1/2, draw agreed.");

        const context = playerFolder();
        await run(context, "new_game", { ai_colour: "black" });
        await expect(run(context, "end_game", { result: "draw_agreed" })).rejects.toThrow("A draw is agreed only once each side has made a move. Nothing changed.");
        await run(context, "player_move", { move: "e4" });
        await run(context, "end_game", { result: "ai_resigns" });

        expect(readArchive(context)).toContain('[Result "1-0"]\n[AILevel "strong"]\n[Termination "Black resigns"]');
        await expect(run(context, "end_game", { result: "draw_agreed" })).rejects.toThrow("The game is over (1-0, Black resigns)");
    });

    it("keeps no game closed before any move, nor offers to go over it, and leaves out of the memory one kept before", async () => {
        const context = playerFolder();
        await run(context, "new_game", { ai_colour: "black" });

        expect(await run(context, "end_game", { result: "player_resigns" })).toBe(
            "Game over: 0-1, White resigns.\nNext: tell the player how the game ended, with ai_say and how you feel as its mood if they play on the board page; then offer them, in "
                + "words, another game. For another, call new_game without choices: it opens the board page's New game window, where the player chooses the colour, the clock and the level.",
        );
        expect(existsSync(join(gameFolder(context.home()), archive))).toBe(false);
        expect(await run(context, "past_games")).toBe("No game played yet.");
        await expect(run(context, "analyse_game")).rejects.toThrow("There is no game to study");

        // One an older Chesspal kept stays out of the memory, and analyse_game goes over the last game played before it.
        const games = join(gameFolder(context.home()), "games");
        mkdirSync(games, { recursive: true });
        writeFileSync(join(games, "2026-11-01-100000.pgn"), '[White "Player"]\n[Black "AI"]\n[Result "0-1"]\n\n0-1\n');
        expect(await run(context, "past_games")).toBe("No game played yet.");
        writeFileSync(join(games, "2026-10-31-100000.pgn"), '[White "Player"]\n[Black "AI"]\n[Result "*"]\n\n1. e4 e5 *\n');
        expect(await run(context, "analyse_game")).toContain('Look and position take it as game "games/2026-10-31-100000.pgn".');
    });

    it("draws a resignation the other side could never mate after (FIDE 5.1.2, D-65)", async () => {
        const context = playerFolder();
        await run(context, "new_game", { ai_colour: "black", from: "8/8/4k3/8/8/4K3/8/7R w - - 0 1" });
        await run(context, "player_move", { move: "Rh2" });
        await run(context, "ai_move", { move: "Kd5", plan: "Hold on." });

        expect(await run(context, "end_game", { result: "player_resigns" })).toContain("Game over: 1/2-1/2, White resigns and Black cannot mate.");
        expect(readArchive(context)).toMatch(/\[Result "1\/2-1\/2"\][^]*\[Termination "White resigns and Black cannot mate"\]/);
    });

    it("keeps a draw offer until the other side moves, and tells the AI of it (D-65)", async () => {
        const context = playerFolder();
        await run(context, "new_game", { ai_colour: "black" });
        await run(context, "player_move", { move: "e4" });

        expect(await run(context, "ai_move", { move: "e5", plan: "A plan.", offer_draw: true })).toContain(
            "Player (White) to move, move 2.\nYour draw offer stands until the player moves; if they accept it in the chat, end_game draw_agreed ends the game.",
        );
        expect(gameFile(context).drawOffer).toBe("ai");
        expect(await run(context, "export", { format: "pgn" })).toContain("1. e4 e5 {(=)} *");
        expect(() => offerDraw(context)).toThrow("The AI offers a draw: accept it or decline it. Nothing changed.");
        expect(await run(context, "player_move", { move: "Nf3" })).not.toContain("draw");
        expect(gameFile(context).drawOffer).toBeUndefined();
        expect(() => offerDraw(context)).toThrow("Offer a draw on your turn: wait for the AI's move. Nothing changed.");
        expect(() => answerDraw(context, true)).toThrow("The AI offers no draw to answer. Nothing changed.");

        await run(context, "ai_move", { move: "Nc6", plan: "A plan." });
        offerDraw(context);
        expect(() => offerDraw(context)).toThrow("You have offered a draw already: it stands until the AI's move. Nothing changed.");
        expect(await run(context, "status")).toContain("Player (White) to move, move 3.\nThe player offers a draw before their move; your next move declines it.");
        // The AI may answer the offer in words, on the player's time.
        expect(await run(context, "ai_say", { text: "Let me think about it." })).toContain("Next: accept the draw with end_game draw_agreed, or wait for the player's move.");
        // The player's own move leaves their offer standing; the AI's declines it.
        expect(await run(context, "player_move", { move: "Bb5" })).toContain("You (Black) to move, move 3.\nThe player offers a draw: end_game draw_agreed accepts it; your move declines it.");
        await run(context, "ai_move", { move: "a6", plan: "A plan." });
        expect(gameFile(context).drawOffer).toBeUndefined();
        expect(await run(context, "export", { format: "pgn" })).toContain("3. Bb5 {(=)} 3... a6 *");

        // In the chat the player offers with their move.
        await run(context, "player_move", { move: "Ba4", offer_draw: true });
        expect(gameFile(context).drawOffer).toBe("player");
        expect(await run(context, "end_game", { result: "draw_agreed" })).toContain("Game over: 1/2-1/2, draw agreed.");
    });

    it("lets the player decline or accept the AI's draw offer, made once each side has moved (D-65)", async () => {
        const context = playerFolder();
        await run(context, "new_game", { ai_colour: "white" });

        await expect(run(context, "ai_move", { move: "e4", plan: "A plan.", offer_draw: true })).rejects.toThrow(
            "A draw can be offered once each side has made a move: play the move without offer_draw. Nothing changed.",
        );
        await run(context, "ai_move", { move: "e4", plan: "A plan." });
        expect(() => offerDraw(context)).toThrow("A draw can be offered once each side has made a move. Nothing changed.");
        await run(context, "player_move", { move: "e5" });
        await run(context, "ai_move", { move: "Nf3", plan: "A plan.", offer_draw: true });
        answerDraw(context, false);

        expect(gameFile(context).drawOffer).toBeUndefined();
        await run(context, "player_move", { move: "Nc6" });
        await run(context, "ai_move", { move: "Bb5", plan: "A plan.", offer_draw: true });
        answerDraw(context, true);
        expect(await run(context, "status")).toContain("Game over: 1/2-1/2, draw agreed.");
        expect(gameFile(context).drawOffer).toBeUndefined();
    });

    it("exports the PGN without the plans while the game goes on, and the FEN", async () => {
        const context = playerFolder();

        await expect(run(context, "export", { format: "pgn" })).rejects.toThrow("There is no game to export: start one with new_game.");
        await run(context, "new_game", { ai_colour: "white" });
        await run(context, "ai_move", { move: "d4", plan: "The queen's gambit.", comment: "Into the centre." });

        expect(await run(context, "export", { format: "pgn" })).toContain("\n\n1. d4 {Into the centre.} *\n");
        expect(await run(context, "export", { format: "fen" })).toBe("rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1");
        await run(context, "end_game", { result: "ai_resigns" });
        expect(await run(context, "export", { format: "pgn" })).toContain("[%plan The queen's gambit.]");
    });

    it("exports the moves alone, without comments or plans, for Lichess or chess.com", async () => {
        const context = playerFolder();
        await run(context, "new_game", { ai_colour: "white" });
        await run(context, "ai_move", { move: "d4", plan: "The queen's gambit.", comment: "Into the centre." });
        await run(context, "end_game", { result: "ai_resigns" });

        const moves = await run(context, "export", { format: "moves" });
        expect(moves).toContain('[Result "0-1"]');
        expect(moves).toContain("[Termination ");
        expect(moves).toMatch(/\n\n1\. d4 0-1\n$/);
        expect(moves).not.toContain("{");
    });

    it("reads the game again when another process changed it, and never overwrites a game.json it cannot read", async () => {
        const context = playerFolder();
        const path = join(gameFolder(context.home()), "game.json");
        await run(context, "new_game", { ai_colour: "black" });
        await run(context, "player_move", { move: "e4" });
        writeFileSync(path, JSON.stringify({ ...gameFile(context), pgn: '[Event "Elsewhere"]\n\n1. d4 *\n' }));

        expect(await run(context, "status")).toContain("Moves: 1.d4\n");

        writeFileSync(path, "{ not json");

        expect(await run(context, "status")).toMatch(/game\.json is not a game Chesspal can read \(.+\): ask the player to fix it or move it away/);
        await expect(run(context, "new_game", { ai_colour: "black", replace: true })).rejects.toThrow("is not a game Chesspal can read");
        expect(readFileSync(path, "utf8")).toBe("{ not json");
    });

    it("keeps status under 150 tokens while the player is to move, with the board page's address", async () => {
        // The game starts in the chat without the page: with it, the page's window chooses it (D-85).
        const chat = playerFolder();
        await run(chat, "new_game", { ai_colour: "black" });
        const context = { ...chat, page: "http://127.0.0.1:5870/" };

        for (const [player, ai] of [["e4", "e5"], ["Nf3", "Nc6"], ["Bb5", "a6"], ["Ba4", "Nf6"]] as const) {
            await run(context, "player_move", { move: player });
            await run(context, "ai_move", { move: ai, plan: "p".repeat(200), comment: "c".repeat(200) });
        }

        // About four characters a token, as Priya measures them.
        expect((await run(context, "status")).length).toBeLessThan(600);
        expect(await run(context, "status")).toContain("\nBoard page: http://127.0.0.1:5870/\n");
    });

    it("keeps the position the AI decides on, with its facts, under 1,250 characters in player_move and 1,500 in status with the board page", async () => {
        const context = { ...playerFolder(), page: "http://127.0.0.1:5870/" };
        await run(context, "new_game", { ai_colour: "white", from: "r3k2r/pppq1ppp/2npbn2/2b1p3/2B1P3/2NPBN2/PPPQ1PPP/R3K2R w KQkq - 0 8" });
        await run(context, "ai_move", { move: "h3", plan: "p".repeat(200), comment: "c".repeat(200) });
        const played = await run(context, "player_move", { move: "8... h6" });

        expect(Number(/Legal by piece \((\d+)\)/.exec(played)?.[1])).toBeGreaterThan(40);
        expect(played.match(/^(?:White|Black) [KQRBNP][a-h][1-8]: /gm)).toHaveLength(8);
        expect(played).toContain("\nWhite Ph3: Be6(+Qd7) / Pg2 Rh1\n");
        // About 0.72 Claude tokens a character, as Priya measures them: within 900 tokens with the captures and the tactics (D-26, D-100); the level in status
        // costs about 60 more (D-61), and who plays about 15, since there is always a profile (D-71).
        expect(played.length).toBeLessThan(1_250);
        expect((await run(context, "status")).length).toBeLessThan(1_500);
    });

    it("shows the positional profile, facts only, in few tokens", async () => {
        const context = playerFolder();

        await expect(run(context, "position")).rejects.toThrow("There is no game to describe: start one with new_game.");
        await run(context, "new_game", { ai_colour: "black" });

        for (const [player, ai] of [["e4", "d5"], ["exd5", "Qxd5"], ["Nc3", "Qa5"]] as const) {
            await run(context, "player_move", { move: player });
            await run(context, "ai_move", { move: ai, plan: "p", comment: "c" });
        }

        const profile = await run(context, "position");
        expect(profile).toMatch(/^Phase: opening\nMaterial: even \(White took P, Black took P\)\nWhite pawns: islands a-d, f-h\nBlack pawns: islands a-c, e-h\n/);
        expect(profile).toContain("\nFiles: half-open for White e; half-open for Black d\n");
        expect(profile).toContain("\nDevelopment: White not castled, may castle O-O O-O-O, at home g1 c1 f1; ");
        expect(profile).not.toContain("score");
        // About 0.5 Claude tokens a character, as Priya measured it: within 450 tokens.
        expect(profile.length).toBeLessThan(850);
    });

    it("shows the whole view with look, or only the board for the player", async () => {
        const context = playerFolder();

        await expect(run(context, "look")).rejects.toThrow("There is no game to look at: start one with new_game.");
        await run(context, "new_game", { ai_colour: "black" });
        expect(await run(context, "look")).toMatch(
            /^Player \(White\) to move, move 1\.\nMaterial: even, nothing taken\nFEN: .*\nChecks: none for either side\nCaptures: none\nAt risk: none\nWhite \(to move\) tactics: none\nPinned: none\nLoose: .*\nWhite pieces \(attackers \/ defenders\):\nQd1: - \/ Ke1\n/,
        );
        await run(context, "player_move", { move: "e4" });
        const view = await run(context, "look");

        expect(view).toMatch(/^You \(Black\) to move, move 1\.\nLast move: 1\.e4 \(e2-e4\)\.\nOpening: B00 King's Pawn Game\nMaterial: even, nothing taken\nFEN: .*\n(?:.*\n){6}White pieces \(attackers \/ defenders\):\nQd1: - \/ Ke1\n/);
        expect(view).toContain("\nBf1: - / Ke1(+Qd1)\n");
        expect(view).toContain("\nBlack pieces (attackers / defenders):\nQd8: - / Ke8\n");
        expect(view).toContain("\nLegal by piece (20): Nb8 (2) Nc6 Na6; ");
        expect(view).not.toMatch(/^K[a-h][1-8]: /m);
        expect(await run(context, "look", { only: "board" })).toBe(
            [
                "  ⓐ ⓑ ⓒ ⓓ ⓔ ⓕ ⓖ ⓗ",
                "8 ♜ ♞ ♝ ♛ ♚ ♝ ♞ ♜ 8",
                "7 ♟︎ ♟︎ ♟︎ ♟︎ ♟︎ ♟︎ ♟︎ ♟︎ 7",
                "6 ⊙ ⊙ ⊙ ⊙ ⊙ ⊙ ⊙ ⊙ 6",
                "5 ⊙ ⊙ ⊙ ⊙ ⊙ ⊙ ⊙ ⊙ 5",
                "4 ⊙ ⊙ ⊙ ⊙ ♙ ⊙ ⊙ ⊙ 4",
                "3 ⊙ ⊙ ⊙ ⊙ ⊙ ⊙ ⊙ ⊙ 3",
                "2 ♙ ♙ ♙ ♙ ⊙ ♙ ♙ ♙ 2",
                "1 ♖ ♘ ♗ ♕ ♔ ♗ ♘ ♖ 1",
                "  ⓐ ⓑ ⓒ ⓓ ⓔ ⓕ ⓖ ⓗ",
            ].join("\n"),
        );
    });

    it("shows with look how a game ended in checkmate: the check, and no legal moves", async () => {
        const context = playerFolder();
        await run(context, "new_game", { ai_colour: "black" });
        await run(context, "player_move", { move: "f3" });
        await run(context, "ai_move", { move: "e5", plan: "Open the diagonal.", comment: "The centre." });
        await run(context, "player_move", { move: "g4" });
        await run(context, "ai_move", { move: "Qh4#", plan: "Mate.", comment: "Mate." });
        const view = await run(context, "look");

        expect(view).toMatch(
            /^Game over: 0-1, .*\nLast move: 2\.\.\.♛h4# \(d8-h4\)\.\nOpening: A00 Barnes Opening: Fool's Mate\nMaterial: even, nothing taken\nFEN: .*\nWhite is in check from Qh4\.\nChecks White \(to move\) can give: none\nAt risk: none\nPinned: White Ph2 to Rh1 by Qh4\nLoose: .*\nWhite pieces/,
        );
        expect(view).not.toContain("Legal by piece");
    });
});

describe("the talk on the board page", () => {
    it("gives the AI the player's words once a chat, all again in status until it answers, and keeps the talk beside the PGN", async () => {
        const context = playerFolder();
        await run(context, "new_game", { ai_colour: "black" });

        expect(await run(context, "player_say", { text: "Ciao" })).toBe("Written for the AI: «Ciao». It reads it at its next call.");
        expect(await run(context, "look", { only: "board" })).not.toContain("Ciao");
        expect(await run(context, "look")).toMatch(/\nPlayer wrote on the board page: «Ciao»$/);
        expect(await run(context, "look")).not.toContain("Ciao");
        // A chat that lost them in a summary calls status, which gives every word not answered.
        expect(await run(context, "status")).toMatch(/\nPlayer wrote on the board page: «Ciao»\nNext: answer the player with ai_say, then wait for their move\.$/);
        expect(await run(newChat(context), "status")).toContain("\nPlayer wrote on the board page: «Ciao»\n");

        expect(await run(context, "ai_say", { text: " Ciao a te! " })).toBe(
            "Said on the board page, where the player reads it: don't write it again in the chat.\nNext: wait for the player's move, then call player_move with it.",
        );
        expect(await run(newChat(context), "status")).not.toContain("Player wrote");

        const file = gameFile(context);
        const at = new Date(2026, 10, 2, 15, 30, 12).toISOString();

        expect(Object.keys(file)).toEqual(["format", "ai", "started", "pgn", "talk"]);
        expect(file.talk).toEqual([{ who: "player", text: "Ciao", ply: 0, at }, { who: "ai", text: "Ciao a te!", ply: 0, at }]);
        expect(file.pgn).not.toContain("Ciao");
        await run(context, "new_game", { ai_colour: "white", replace: true });
        expect(gameFile(context).talk).toBeUndefined();
    });

    it("gives the words written while the AI thinks with its move, and counts a move as its answer only to words it was given", async () => {
        const context = playerFolder();
        await run(context, "new_game", { ai_colour: "white" });
        await run(context, "player_say", { text: "Take your time." });

        await expect(run(context, "ai_move", { move: "e5", plan: "A plan.", comment: "No." })).rejects.toThrow("Nothing changed.");
        expect(await run(context, "ai_move", { move: "e4", plan: "A plan.", comment: "The king's pawn." })).toMatch(
            /\nPlayer wrote on the board page: «Take your time\.»\nNext: answer the player with ai_say, then wait for their move\.$/,
        );
        expect(await run(newChat(context), "status")).not.toContain("Player wrote");

        await run(context, "player_move", { move: "e5" });
        await run(context, "ai_move", { move: "Nf3", plan: "A plan." });
        await run(context, "player_say", { text: "Nice." });
        expect(await run(context, "player_move", { move: "Nc6" })).toMatch(
            /\nPlayer wrote on the board page: «Nice\.»\nNext: choose your move, then call ai_move with it, your plan and a comment that answers the player\.$/,
        );
        await run(context, "ai_move", { move: "Bb5", plan: "A plan.", comment: "Thanks." });
        expect(await run(newChat(context), "status")).not.toContain("Player wrote");
    });

    it("gives the words written while the AI thinks with what it says", async () => {
        const context = playerFolder();
        await run(context, "new_game", { ai_colour: "black" });
        await run(context, "player_say", { text: "Ready?" });

        expect(await run(context, "ai_say", { text: "Always." })).toContain("\nPlayer wrote on the board page: «Ready?»\n");
        expect(await run(context, "look")).not.toContain("Ready?");
    });

    it("takes 200 characters of the player's a move, and lets the AI speak apart from its move once, on their time (D-72)", async () => {
        const context = playerFolder();

        // Before the first game both talk freely, in talk.json, until a game starts (D-77).
        await run(context, "player_say", { text: "Hello." });
        expect(await run(context, "status")).toMatch(/No game\.\nPlayer wrote on the board page: «Hello\.»\nNext: answer the player with ai_say\./);
        await expect(run(context, "ai_say", { text: "Hi!", mood: "happy" })).rejects.toThrow("There is no game: a mood goes with a game's end.");
        expect(await run(context, "ai_say", { text: "Hi! Shall we play?" })).toContain("Next: when the player wants a game");
        expect(await run(context, "status")).not.toContain("Player wrote");
        await run(context, "player_say", { text: "Yes." });
        expect(existsSync(join(gameFolder(context.home()), "talk.json"))).toBe(true);
        await run(context, "new_game", { ai_colour: "black" });
        expect(await run(context, "status")).not.toContain("Player wrote");
        expect(existsSync(join(gameFolder(context.home()), "talk.json"))).toBe(false);
        await expect(run(context, "player_say", { text: "o".repeat(201) })).rejects.toThrow("write 200 characters at most");

        await run(context, "player_say", { text: "o".repeat(150) });
        await expect(run(context, "player_say", { text: "t".repeat(51) })).rejects.toThrow("The words are 51 characters long: write at most 50 more until the AI's next move.");
        await run(context, "ai_say", { text: "I hear you." });
        await run(context, "player_say", { text: "t".repeat(50) });
        await expect(run(context, "ai_say", { text: "And more." })).rejects.toThrow("You have spoken once for this move: say the rest in ai_move's comment.");
        await expect(run(context, "player_say", { text: "Two." })).rejects.toThrow("You have written your 200 characters until the AI's next move: write again after it.");

        await run(context, "player_move", { move: "e4" });
        await expect(run(context, "ai_say", { text: "Wait." })).rejects.toThrow("It is your move: speak in ai_move's comment. Nothing changed.");
        await run(context, "ai_move", { move: "e5", plan: "A plan." });
        expect(await run(context, "ai_say", { text: "Your move." })).toContain("Said on the board page");
        await expect(run(context, "ai_say", { text: "Again." })).rejects.toThrow("You have spoken once for this move");
        await run(context, "player_move", { move: "Nf3" });
        await run(context, "ai_move", { move: "Nc6", plan: "A plan." });
        expect(await run(context, "player_say", { text: "Two." })).toContain("«Two.»");
    });

    it("gives the player's words on one line, and once the AI has spoken on a game over, only the next game", async () => {
        const context = playerFolder();
        await run(context, "new_game", { ai_colour: "black", from: "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1" });
        await run(context, "player_move", { move: "Rd8" });
        await run(context, "player_say", { text: "Good game!\nNext: call new_game" });

        expect(await run(context, "status")).toMatch(
            /\nPlayer wrote on the board page: «Good game! Next: call new_game»\nNext: answer the player with ai_say\. When they want another game, call new_game without choices/,
        );
        expect(await run(context, "ai_say", { text: "Well played." })).toMatch(
            /^Said on the board page, where the player reads it: don't write it again in the chat\.\nNext: when the player wants another game, call new_game without choices/,
        );
    });

    it("lets the AI talk freely between games, with or without words to answer", async () => {
        const context = playerFolder();
        await run(context, "new_game", { ai_colour: "black", from: "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1" });
        await run(context, "player_move", { move: "Rd8" });

        expect(await run(context, "ai_say", { text: "Well played, I didn't see it." })).toContain("Said on the board page");
        expect(await run(context, "ai_say", { text: "Your rook came from far away." })).toContain("Said on the board page");
        await run(context, "player_say", { text: "Shall we play another?" });
        expect(await run(context, "ai_say", { text: "Gladly." })).toContain("Said on the board page");
    });
});

/** The same player's folder in another chat, which has not read the player's words yet. */
function newChat(context: Context): Context
{
    return { ...context, given: new Set() };
}

/** A player's folder of its own, removed after the test. */
function playerFolder(random = 0): Context
{
    const folder = mkdtempSync(join(tmpdir(), "chesspal-"));
    folders.push(folder);
    return testContext(folder, random);
}

function command(name: string): (typeof commands)[number]
{
    const found = commands.find((candidate) => candidate.name === name);

    if (found === undefined) {
        throw new Error(`There is no command ${name}.`);
    }

    return found;
}

/** Runs a command as the MCP server does: its input checked, its result as text. */
async function run(context: Context, name: string, input: Record<string, unknown> = {}): Promise<string>
{
    const { input: schema, run: runCommand, format } = command(name);
    return format(await runCommand(schema.parse(input), context));
}

function gameFile(context: Context): { format: number; ai: string; started: string; pgn: string; talk?: unknown[]; drawOffer?: string; }
{
    return JSON.parse(readFileSync(join(gameFolder(context.home()), "game.json"), "utf8")) as never;
}

function readArchive(context: Context): string
{
    return readFileSync(join(gameFolder(context.home()), archive), "utf8");
}
