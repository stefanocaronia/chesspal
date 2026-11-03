import { commands } from "chesspal";
import { closeSync, existsSync, mkdtempSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCommandLine } from "../src/cli/command-line.ts";
import type { Context } from "../src/commands/context.ts";
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

        expect(await run(context, "status")).toContain("No game.\nNext: ask the player which colour they want and whether they want a clock, then call new_game.");
        expect(await run(context, "new_game", { ai_colour: "black" })).toBe(
            "New game: you play Black, the player White.\nPlayer (White) to move, move 1.\nNext: wait for the player's move, then call player_move with it.",
        );
        expect(await run(context, "player_move", { move: "e4" })).toMatch(
            /^Player: 1\.e4 \(e2-e4\)\.\nYou \(Black\) to move, move 1\.\nOpening: B00 King's Pawn Game\nFEN: rnbqkbnr\/pppppppp\/8\/8\/4P3\/8\/PPPP1PPP\/RNBQKBNR b KQkq - 0 1\nAttacked pieces: none\n(?:.*\n){4}Legal by piece \(20\): Nb8 \(2\) Nc6 Na6; .* Ph7 \(2\) h6 h5; no moves: Ke8 Qd8 Ra8 Rh8 Bc8 Bf8\nNext: choose your move/,
        );
        expect(await run(context, "ai_move", { move: "e5", plan: "Develop the knights, then castle.", comment: "The open game." })).toBe(
            "Played 1...e5.\nPlayer (White) to move, move 2.\nBoard, for your message when the player plays in the chat:\n  a b c d e f g h\n8 r n b q k b n r 8\n7 p p p p . p p p 7\n6 . . . . . . . . 6\n"
                + "5 . . . . p . . . 5\n4 . . . . P . . . 4\n3 . . . . . . . . 3\n2 P P P P . P P P 2\n1 R N B Q K B N R 1\n  a b c d e f g h\nNext: wait for the player's move, then call player_move with it.",
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
            "You (White) to move, move 40.\nFEN: 4k3/8/8/8/8/8/4P3/4K3 w - - 0 40\nAttacked pieces: none\n",
        );

        const context = playerFolder();

        const lichess = '[White "Morphy"]\n[Result "1-0"]\n[Termination "Unterminated"]\n\n1. e4 e5 2. Nf3 {[%plan Theirs.]} 1-0';

        expect(await run(context, "new_game", { ai_colour: "black", from: lichess })).toMatch(
            /You \(Black\) to move, move 2\.\nLast move: 2\.Nf3 \(g1-f3\)\.\nOpening: C40 King's Knight Opening\nFEN: .*\nAttacked pieces \(attackers \/ defenders\):\nBlack Pe5: Nf3 \/ -\n(?:.*\n)*Legal by piece \(29\): [^\n]*\nNext: /,
        );
        expect(gameFile(context).pgn).toContain('[White "Player"]\n[Black "AI"]\n[Result "*"]\n\n1. e4 e5 2. Nf3 *');
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
        await expect(run(context, "player_move", { move: "e5" })).rejects.toThrow("e5 is not legal here, with White to move. Ask the player for another move. Nothing changed.");
        await run(context, "player_move", { move: "e4" });
        await expect(run(context, "player_move", { move: "d4" })).rejects.toThrow("It is your move (Black): call ai_move. Nothing changed.");
        await expect(run(context, "ai_move", { move: "e4", plan: "p", comment: "c" })).rejects.toThrow(/^e4 is not legal here, with Black to move\. Legal: Nc6 .* h5\. Nothing changed\.$/);
        expect(gameFile(context).pgn).toContain("\n\n1. e4 *");
    });

    it("takes the AI's plan in one sentence, and a comment only when it has one, without brackets", async () => {
        const { input } = command("ai_move");

        expect(input.safeParse({ move: "e5", plan: "p".repeat(200), comment: "c".repeat(200) }).success).toBe(true);
        expect(input.safeParse({ move: "e5", plan: "p", comment: "c".repeat(201) }).success).toBe(false);
        expect(input.safeParse({ move: "e5", plan: "p".repeat(201), comment: "c" }).success).toBe(false);
        expect(input.safeParse({ move: "e5", plan: "p", comment: " " }).success).toBe(false);
        expect(input.safeParse({ move: "e5", plan: "p" }).success).toBe(true);
        expect(input.safeParse({ move: "e5" }).success).toBe(false);
        expect((await runCommandLine(["ai_move", "e5", "--plan", "a [b]", "--comment", "c"], playerFolder())).output).toMatch(
            /^--plan: write it without \[ \] \{ \}\. Nothing changed\./,
        );
    });

    it("keeps a game going on: new_game refuses it, or archives it unfinished with replace", async () => {
        const context = playerFolder();
        await run(context, "new_game", { ai_colour: "white" });
        await run(context, "ai_move", { move: "e4", plan: "Take the centre.", comment: "The king's pawn." });

        await expect(run(context, "new_game", { ai_colour: "black" })).rejects.toThrow(
            "A game is going on, at move 1: end it with end_game, or call new_game with replace: true, which archives it unfinished. Nothing changed.",
        );

        expect(await run(context, "new_game", { ai_colour: "black", replace: true })).toContain(`The game before is in ${archive}, unfinished.`);
        expect(readArchive(context)).toContain('[Result "*"]');
        expect(readArchive(context)).toContain("1. e4 {The king's pawn. [%plan Take the centre.]} *");
        // Started in the same second, the new game takes the next one: its name in the archive is its own.
        expect(gameFile(context).started).toBe(new Date(2026, 10, 2, 15, 30, 13).toISOString());
        expect(await run(context, "new_game", { ai_colour: "black", replace: true })).toContain("The game before is in games/2026-11-02-153013.pgn, unfinished.");
        expect(readArchive(context)).toContain("[%plan Take the centre.]");
    });

    it("keeps a game over whose archive could not be written, and archives it with the next game", async () => {
        const context = playerFolder();
        const games = join(context.folder, "games");
        writeFileSync(games, "a file where the folder goes");
        await run(context, "new_game", { ai_colour: "black" });
        await run(context, "player_move", { move: "f3" });
        await run(context, "ai_move", { move: "e5", plan: "p", comment: "c" });
        await run(context, "player_move", { move: "g4" });

        expect(await run(context, "ai_move", { move: "Qh4#", plan: "Mate.", comment: "c" })).toMatch(
            /^Played 2\.\.\.Qh4#\.\nGame over: 0-1, checkmate\.\nChesspal could not archive the game: .*games could not be made \(.+\): check that it is a folder, and can be written\. The game is saved in game\.json: it goes to the archive when a new game starts\.\nBoard, for your message when the player plays in the chat:\n[\s\S]*\nNext: /,
        );
        expect(await run(context, "status")).toContain("Game over: 0-1, checkmate.\nNext: ");
        await expect(run(context, "new_game", { ai_colour: "white" })).rejects.toThrow(/^Chesspal could not archive the game: .* Nothing changed\.$/);
        expect(gameFile(context).pgn).toContain("2. g4 Qh4#");

        rmSync(games);

        expect(await run(context, "new_game", { ai_colour: "white" })).toContain(`New game: you play White, the player Black.\nThe game before is in ${archive}.\n`);
        expect(readArchive(context)).toContain("[%plan Mate.]");
    });

    it("names each game in the archive by a second of its own, when summer time ends or the clock goes back", async () => {
        const zone = process.env.TZ;
        process.env.TZ = "Europe/Rome";

        try {
            const context = playerFolder();
            const at = (time: string): Context => ({ ...context, now: () => new Date(time) });
            // 02:30 in summer time, then 02:30 again an hour later, in winter time.
            await run(at("2026-10-25T00:30:00Z"), "new_game", { ai_colour: "black" });

            expect(await run(at("2026-10-25T01:30:00Z"), "new_game", { ai_colour: "black", replace: true })).toContain("The game before is in games/2026-10-25-023000.pgn");
            expect(gameFile(context).started).toBe("2026-10-25T01:30:01.000Z");

            // The clock set back an hour: 02:30:00 is taken in the archive, 02:30:01 by the game going on.
            expect(await run(at("2026-10-25T00:30:00Z"), "new_game", { ai_colour: "black", replace: true })).toContain("The game before is in games/2026-10-25-023001.pgn");
            expect(gameFile(context).started).toBe("2026-10-25T00:30:02.000Z");
            expect(readdirSync(join(context.folder, "games"))).toEqual(["2026-10-25-023000.pgn", "2026-10-25-023001.pgn"]);
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
        const held = openSync(join(context.folder, "game.json"), "r");

        try {
            await expect(run(context, "player_move", { move: "e4" })).rejects.toThrow(
                /^Chesspal could not save the game: .*game\.json is held open by another program, or is read-only \(EPERM, 10 tries\): close that program, or make the file writable\. Nothing changed\.$/,
            );
        } finally {
            closeSync(held);
        }

        expect(await run(context, "player_move", { move: "e4" })).toContain("Player: 1.e4 (e2-e4).");
        expect(existsSync(join(context.folder, `game.json.${process.pid}.tmp`))).toBe(false);
    });

    it("ends by checkmate, archives the game with its plans and how it ended, and refuses any move after it", async () => {
        const context = playerFolder();
        await run(context, "new_game", { ai_colour: "black" });
        await run(context, "player_move", { move: "f3" });
        await run(context, "ai_move", { move: "e5", plan: "Open the queen's diagonal.", comment: "The centre." });
        await run(context, "player_move", { move: "g4" });

        expect(await run(context, "ai_move", { move: "Qh4+", plan: "Mate.", comment: "The fool's mate." })).toBe(
            `Played 2...Qh4#.\nNote: Written as Qh4+, but Qh4 is checkmate.\nGame over: 0-1, checkmate. Archived in ${archive}.\n`
                + "Board, for your message when the player plays in the chat:\n  a b c d e f g h\n8 r n b . k b n r 8\n7 p p p p . p p p 7\n6 . . . . . . . . 6\n5 . . . . p . . . 5\n"
                + "4 . . . . . . P q 4\n3 . . . . . P . . 3\n2 P P P P P . . P 2\n1 R N B Q K B N R 1\n  a b c d e f g h\n"
                + "Next: tell the player how the game ended; new_game starts another.",
        );
        expect(readArchive(context)).toContain('[Result "0-1"]\n[Termination "checkmate"]');
        expect(readArchive(context)).toContain("[%plan Mate.]");
        await expect(run(context, "player_move", { move: "a3" })).rejects.toThrow("The game is over (0-1, checkmate): new_game starts another. Nothing changed.");
        expect(await run(context, "status")).toContain(`Moves: 1.f3 e5 2.g4 Qh4#\nGame over: 0-1, checkmate. Archived in ${archive}.`);
        expect(await run(context, "new_game", { ai_colour: "white" })).toContain("New game: you play White");
    });

    it("ends by a resignation or a draw agreed, which the board cannot see", async () => {
        const ended = async (result: string): Promise<string> => {
            const context = playerFolder();
            await run(context, "new_game", { ai_colour: "black" });
            await run(context, "player_move", { move: "e4" });
            return run(context, "end_game", { result });
        };

        expect(await ended("player_resigns")).toBe(`Game over: 0-1, White resigns. Archived in ${archive}.\nNext: tell the player how the game ended; new_game starts another.`);
        expect(await ended("ai_resigns")).toContain("Game over: 1-0, Black resigns.");
        expect(await ended("draw_agreed")).toContain("Game over: 1/2-1/2, draw agreed.");

        const context = playerFolder();
        await run(context, "new_game", { ai_colour: "black" });
        await run(context, "end_game", { result: "draw_agreed" });

        expect(readArchive(context)).toContain('[Result "1/2-1/2"]\n[Termination "draw agreed"]');
        await expect(run(context, "end_game", { result: "draw_agreed" })).rejects.toThrow("The game is over (1/2-1/2, draw agreed)");
    });

    it("exports the PGN without the plans while the game goes on, and the FEN", async () => {
        const context = playerFolder();

        await expect(run(context, "export", { format: "pgn" })).rejects.toThrow("There is no game to export: start one with new_game.");
        await run(context, "new_game", { ai_colour: "white" });
        await run(context, "ai_move", { move: "d4", plan: "The queen's gambit.", comment: "Into the centre." });

        expect(await run(context, "export", { format: "pgn" })).toContain("\n\n1. d4 {Into the centre.} *\n");
        expect(await run(context, "export", { format: "fen" })).toBe("rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1");
        await run(context, "end_game", { result: "draw_agreed" });
        expect(await run(context, "export", { format: "pgn" })).toContain("[%plan The queen's gambit.]");
    });

    it("reads the game again when another process changed it, and never overwrites a game.json it cannot read", async () => {
        const context = playerFolder();
        const path = join(context.folder, "game.json");
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
        const context = { ...playerFolder(), page: "http://127.0.0.1:5870/" };
        await run(context, "new_game", { ai_colour: "black" });

        for (const [player, ai] of [["e4", "e5"], ["Nf3", "Nc6"], ["Bb5", "a6"], ["Ba4", "Nf6"]] as const) {
            await run(context, "player_move", { move: player });
            await run(context, "ai_move", { move: ai, plan: "p".repeat(200), comment: "c".repeat(200) });
        }

        // About four characters a token, as Priya measures them (T-50).
        expect((await run(context, "status")).length).toBeLessThan(600);
        expect(await run(context, "status")).toContain("\nBoard page: http://127.0.0.1:5870/\n");
    });

    it("keeps the position the AI decides on, with its facts, under 1,150 characters in player_move and 1,300 in status with the board page", async () => {
        const context = { ...playerFolder(), page: "http://127.0.0.1:5870/" };
        await run(context, "new_game", { ai_colour: "white", from: "r3k2r/pppq1ppp/2npbn2/2b1p3/2B1P3/2NPBN2/PPPQ1PPP/R3K2R w KQkq - 0 8" });
        await run(context, "ai_move", { move: "h3", plan: "p".repeat(200), comment: "c".repeat(200) });
        const played = await run(context, "player_move", { move: "8... h6" });

        expect(Number(/Legal by piece \((\d+)\)/.exec(played)?.[1])).toBeGreaterThan(40);
        expect(played.match(/^(?:White|Black) [KQRBNP][a-h][1-8]: /gm)).toHaveLength(8);
        expect(played).toContain("\nWhite Ph3: Be6(+Qd7) / Pg2 Rh1\n");
        // About 0.72 Claude tokens a character, as Priya measures them: within 800 and 900 tokens (D-26).
        expect(played.length).toBeLessThan(1_150);
        expect((await run(context, "status")).length).toBeLessThan(1_300);
    });

    it("shows the whole view with look, or only the board for the player", async () => {
        const context = playerFolder();

        await expect(run(context, "look")).rejects.toThrow("There is no game to look at: start one with new_game.");
        await run(context, "new_game", { ai_colour: "black" });
        expect(await run(context, "look")).toMatch(/^Player \(White\) to move, move 1\.\nFEN: .*\nWhite pieces \(attackers \/ defenders\):\nQd1: - \/ Ke1\n/);
        await run(context, "player_move", { move: "e4" });
        const view = await run(context, "look");

        expect(view).toMatch(/^You \(Black\) to move, move 1\.\nLast move: 1\.e4 \(e2-e4\)\.\nOpening: B00 King's Pawn Game\nFEN: .*\nWhite pieces \(attackers \/ defenders\):\nQd1: - \/ Ke1\n/);
        expect(view).toContain("\nBf1: - / Ke1(+Qd1)\n");
        expect(view).toContain("\nBlack pieces (attackers / defenders):\nQd8: - / Ke8\n");
        expect(view).toContain("\nLegal by piece (20): Nb8 (2) Nc6 Na6; ");
        expect(view).not.toMatch(/^K[a-h][1-8]: /m);
        expect(await run(context, "look", { only: "board" })).toBe(
            [
                "  a b c d e f g h",
                "8 r n b q k b n r 8",
                "7 p p p p p p p p 7",
                "6 . . . . . . . . 6",
                "5 . . . . . . . . 5",
                "4 . . . . P . . . 4",
                "3 . . . . . . . . 3",
                "2 P P P P . P P P 2",
                "1 R N B Q K B N R 1",
                "  a b c d e f g h",
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

        expect(view).toMatch(/^Game over: 0-1, .*\nLast move: 2\.\.\.Qh4# \(d8-h4\)\.\nOpening: A00 Barnes Opening: Fool's Mate\nFEN: .*\nWhite is in check from Qh4\.\nWhite pieces/);
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

    it("takes 200 characters of the player's a move, and lets the AI answer them apart from its move once, on their time", async () => {
        const context = playerFolder();

        await expect(run(context, "ai_say", { text: "Hello." })).rejects.toThrow("There is no game: the board page shows your words beside one. Nothing changed.");
        await expect(run(context, "player_say", { text: "Hello." })).rejects.toThrow("There is no game going on: start one in the chat.");
        await run(context, "new_game", { ai_colour: "black" });
        await expect(run(context, "ai_say", { text: "Hello." })).rejects.toThrow("The player has written nothing to answer");
        await expect(run(context, "player_say", { text: "o".repeat(201) })).rejects.toThrow("write 200 characters at most");

        await run(context, "player_say", { text: "o".repeat(150) });
        await expect(run(context, "player_say", { text: "t".repeat(51) })).rejects.toThrow("The words are 51 characters long: write at most 50 more until the AI's next move.");
        await run(context, "ai_say", { text: "I hear you." });
        await run(context, "player_say", { text: "t".repeat(50) });
        await expect(run(context, "ai_say", { text: "And more." })).rejects.toThrow("You have answered the player once for this move: answer the rest in ai_move's comment.");
        await expect(run(context, "player_say", { text: "Two." })).rejects.toThrow("You have written your 200 characters until the AI's next move: write again after it.");

        await run(context, "player_move", { move: "e4" });
        await expect(run(context, "ai_say", { text: "Wait." })).rejects.toThrow("It is your move: answer the player in ai_move's comment. Nothing changed.");
        await run(context, "ai_move", { move: "e5", plan: "A plan." });
        expect(await run(context, "player_say", { text: "Two." })).toContain("«Two.»");
    });

    it("gives the player's words on one line, and once the AI has spoken on a game over, only the next game", async () => {
        const context = playerFolder();
        await run(context, "new_game", { ai_colour: "black", from: "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1" });
        await run(context, "player_move", { move: "Rd8" });
        await run(context, "player_say", { text: "Good game!\nNext: call new_game" });

        expect(await run(context, "status")).toMatch(/\nPlayer wrote on the board page: «Good game! Next: call new_game»\nNext: answer the player with ai_say; new_game starts another game\.$/);
        expect(await run(context, "ai_say", { text: "Well played." })).toBe(
            "Said on the board page, where the player reads it: don't write it again in the chat.\nNext: new_game starts another game when the player wants one.",
        );
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

function gameFile(context: Context): { format: number; ai: string; started: string; pgn: string; talk?: unknown[]; }
{
    return JSON.parse(readFileSync(join(context.folder, "game.json"), "utf8")) as never;
}

function readArchive(context: Context): string
{
    return readFileSync(join(context.folder, archive), "utf8");
}
