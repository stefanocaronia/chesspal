import { commands } from "chesspal";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Context } from "../src/commands/context.ts";
import { coachShown, coachWords, loadGame } from "../src/games/index.ts";
import { setUpHosts } from "../src/host-files/host-files.ts";
import { gameFolder } from "../src/profiles/index.ts";
import { testContext } from "./commands.ts";

const folders: string[] = [];

afterEach(() => {
    for (const folder of folders.splice(0)) {
        rmSync(folder, { recursive: true, force: true });
    }
});

describe("the coach, with the helps on (D-80, D-88)", () => {
    it("is started with the agent that thinks, in one line, only with the helps on in Claude Code, and alone for the move that ends the game", async () => {
        const context = { ...playerFolder(), host: () => "claude-code" };
        setUpHosts(context.folder, "linux");
        await run(context, "new_game", { ai_colour: "black" });
        await run(context, "player_move", { move: "f3" });

        expect(await run(context, "ai_move", { move: "e5", plan: "Centre." })).not.toContain("chesspal-coach");

        helps(context, true);
        // The opponent knows a coach judges the player's moves where one runs (Priya, review of T-112).
        expect(await run(context, "player_move", { move: "g4" })).toContain("A coach, not you, judges their moves and gives them hints on the board page;");
        const mate = await run(context, "ai_move", { move: "Qh4", plan: "Mate." });
        expect(mate).toContain(
            '\nCoach the player: start the chesspal-coach agent in the background with the prompt "Coach."; start it even when an agent of the move before has just '
                + "ended, and write nothing about it in the chat, now or when it ends.\n",
        );
        expect(mate).not.toContain("chesspal-ponder");

        const going = { ...playerFolder(), host: () => "claude-code" };
        setUpHosts(going.folder, "linux");
        helps(going, true);
        await run(going, "new_game", { ai_colour: "black" });
        await run(going, "player_move", { move: "e4" });

        expect(await run(going, "ai_move", { move: "e5", plan: "Centre." })).toContain(
            '\nThink on the player\'s time and coach them: in one message, start two agents in the background, chesspal-ponder with the prompt "Ponder." and '
                + 'chesspal-coach with the prompt "Coach."; start them even when an agent of the move before has just ended, and write nothing about them in the chat, '
                + "now or when they end.\n",
        );
    });

    it("gives the player's move to judge in the position they played it in, what it left, and the position now for the hint, in few enough words", async () => {
        const context = { ...playerFolder(), language: "it-IT" };
        helps(context, true);
        await run(context, "new_game", { ai_colour: "black" });

        for (const [player, ai] of [["e4", "e5"], ["Nf3", "Nc6"], ["Bc4", "Bc5"], ["c3", "Nf6"], ["d4", "exd4"], ["cxd4", "Bb4+"], ["Nc3", "Nxe4"], ["O-O", "Bxc3"], ["d5", "Bf6"]]) {
            await run(context, "player_move", { move: player });
            await run(context, "ai_move", { move: ai, plan: "p", comment: "Ecco." });
        }

        const start = await run(context, "coach");
        const game = keyOf(start);
        expect(start).toMatch(/^Game "\w+", position 18: the player \(White\) to move, move 10; the opponent plays Black at the strong level\.\nThe player speaks Italian\.\n/);
        expect(start).toContain("\nTheir move to judge: 9.d5. The position they played it in:\nFEN: ");
        expect(start).toContain("\nMaterial: Black +4 (White took P, Black took N 2P)\n");
        expect(start).toMatch(/\nAfter their move: at risk .*; the opponent's checks: .*\.\nThe opponent answered 9\.\.\.Bf6 and said: «Ecco\.»\nNow, for your hint:\nFEN: /);
        expect(start).toMatch(new RegExp(`\\nKeep your words: coach \\{game: "${game}", position: 18, badge, note, hint, arrows, squares\\}, .*; then coach \\{game: "${game}", position: 18, done: true\\}\\.$`));
        // The opponent's plan is never the coach's (D-80).
        expect(start).not.toContain("[%plan");
        expect(start).not.toMatch(/plan: p\b/);
        // Two positions with their facts, well within Priya's budget (review of T-112).
        expect(start.length).toBeLessThan(3_000);
    });

    it("keeps its judgment and hint out of the game the opponent reads, never lets a hint give the player's move, and holds a note that names one", async () => {
        const context = playerFolder();
        helps(context, true);
        await run(context, "new_game", { ai_colour: "black" });
        await run(context, "player_move", { move: "e4" });
        await run(context, "ai_move", { move: "e5", plan: "Centre." });
        const game = keyOf(await run(context, "coach"));
        const at = { game, position: 2 };

        await expect(run(context, "coach", { ...at, hint: "Play Nf3, which attacks e5." })).rejects.toThrow("Your hint gives the player a move they may play now (Nf3)");
        await expect(run(context, "coach", { ...at, hint: "Il ♘️f3 attacca e5." })).rejects.toThrow("(Nf3)");
        await expect(run(context, "coach", { ...at, hint: "Look at e5.", arrows: ["Gg1f3"] })).rejects.toThrow("(Nf3)");
        await expect(run(context, "coach", { ...at, arrows: ["Re5e4"] })).rejects.toThrow("Arrows and squares show your hint");
        await expect(run(context, "coach", { position: 2, badge: "good" })).rejects.toThrow("Give the game's key and the position's number");
        await expect(run(context, "coach", { game, position: 0, badge: "good" })).rejects.toThrow("There is no move of the player's to judge here");

        expect(await run(context, "coach", { ...at, badge: "best", note: "Nf3 next attacks e5.", hint: "The e5 pawn has one defender.", squares: ["Re5"] })).toBe(
            `Kept, on the board page. Now call coach {game: "${game}", position: 2, done: true} alone.`,
        );

        const folder = gameFolder(context.home());
        const current = loadGame(folder)!;
        const words = coachWords(folder, current);
        expect(words).toEqual({
            judgments: [{ ply: 1, badge: "best", note: "Nf3 next attacks e5.", held: ["Nf3"] }],
            hint: { position: 2, text: "The e5 pawn has one defender.", squares: [{ colour: "red", square: "e5" }] },
        });
        expect(readFileSync(join(folder, "game.json"), "utf8")).not.toMatch(/%badge|%review|one defender/);
        expect(await run(context, "export", { format: "pgn" })).not.toMatch(/%badge|%review/);
        // The note names a move the player may play: the page shows it once that move is no longer legal on their turn; the hint only in its own position.
        expect(coachShown(words, current)).toEqual({ judgments: [], hint: words.hint });

        expect(await run(context, "status")).not.toMatch(/Nf3 next|one defender/);
        expect(await run(context, "player_move", { move: "Nf3" })).not.toMatch(/Nf3 next|one defender/);
        expect(await run(context, "coach", { ...at, done: true })).toBe("Stop now: the player has moved, or the game is over. End with one word.");
        expect(await run(context, "coach", { ...at, note: "Late, still kept.", hint: "Late." })).toBe(
            "Your judgment is kept; the player has moved, so no hint is kept. Stop now: end with one word.",
        );
        expect(coachWords(folder, loadGame(folder)!).judgments).toEqual([{ ply: 1, note: "Late, still kept." }]);
        expect(coachShown(coachWords(folder, loadGame(folder)!), loadGame(folder)!).judgments).toEqual([{ ply: 1, note: "Late, still kept." }]);
    });

    it("lets a hint name the opponent's pieces and moves, which are no move of the player's (Priya and Anatolij, review of T-112)", async () => {
        const context = playerFolder();
        helps(context, true);
        await run(context, "new_game", { ai_colour: "black" });

        for (const [player, ai] of [["e4", "Nc6"], ["Nf3", "Nd4"]]) {
            await run(context, "player_move", { move: player });
            await run(context, "ai_move", { move: ai, plan: "p" });
        }

        const at = { game: keyOf(await run(context, "coach")), position: 4 };
        expect(await run(context, "coach", { ...at, hint: "Il ♞d4 nero è forte al centro: chi lo attacca?" })).toMatch(/^Kept/);
        expect(await run(context, "coach", { ...at, hint: "Il Nero minaccia ...♞xf3+ e 3...♞xc2." })).toMatch(/^Kept/);
        await expect(run(context, "coach", { ...at, hint: "Con ♘xd4 lo prendi." })).rejects.toThrow("(Nxd4)");
    });

    it("waits for the player's move, and stops once the helps go off", async () => {
        let time = new Date(2026, 10, 8, 15, 30, 12).getTime();
        const context: Context = { ...playerFolder(), now: () => new Date(time) };
        helps(context, true);
        await run(context, "new_game", { ai_colour: "black" });
        await run(context, "player_move", { move: "e4" });
        await run(context, "ai_move", { move: "e5", plan: "Centre." });
        const game = keyOf(await run(context, "coach"));

        context.pause = (milliseconds) => {
            time += milliseconds;
            return Promise.resolve();
        };

        expect(await run(context, "coach", { game, position: 2, done: true })).toBe(`Still the player's move: call coach {game: "${game}", position: 2, done: true} again.`);

        helps(context, false);
        expect(await run(context, "coach")).toBe("Stop now: the player has turned the helps off. End with one word.");
    });

    it("never writes into a new game what it thought on the last one (Federico, review of T-112)", async () => {
        const context = playerFolder();
        helps(context, true);
        await run(context, "new_game", { ai_colour: "black" });
        await run(context, "player_move", { move: "e4" });
        await run(context, "ai_move", { move: "e5", plan: "p" });
        const old = { game: keyOf(await run(context, "coach")), position: 2 };

        context.now = () => new Date(Date.now() + 60_000);
        await run(context, "end_game", { result: "player_resigns" });
        await run(context, "new_game", { ai_colour: "black" });
        await run(context, "player_move", { move: "d4" });
        await run(context, "ai_move", { move: "d5", plan: "p" });

        expect(await run(context, "coach", { ...old, badge: "blunder", note: "About e4.", hint: "Look at e5." })).toBe("Stop now: the player has moved, or the game is over. End with one word.");
        expect(await run(context, "coach", { ...old, done: true })).toBe("Stop now: the player has moved, or the game is over. End with one word.");
        const folder = gameFolder(context.home());
        expect(coachWords(folder, loadGame(folder)!)).toEqual({ judgments: [] });
    });

    it("judges the player's own move that ends the game, started once, from the chat's move or the board page's (Stefano, review of T-112)", async () => {
        const context = { ...playerFolder(), host: () => "claude-code" };
        setUpHosts(context.folder, "linux");
        helps(context, true);
        await run(context, "new_game", { ai_colour: "white" });
        await run(context, "ai_move", { move: "f3", plan: "p" });
        await run(context, "player_move", { move: "e5" });
        await run(context, "ai_move", { move: "g4", plan: "p" });
        const coachLine = 'Coach the player: start the chesspal-coach agent in the background with the prompt "Coach."';

        expect(await run(context, "player_move", { move: "Qh4" })).toContain(coachLine);
        expect(await run(context, "status")).not.toContain(coachLine);

        const start = await run(context, "coach");
        const at = { game: keyOf(start), position: 4 };
        expect(start).toMatch(/^Game "\w+", position 4: the game is over, 0-1, checkmate, with the player's move\.\n/);
        expect(start).toContain("\nTheir move to judge: 2...Qh4#. The position they played it in:\n");
        expect(start).not.toMatch(/After their move|The opponent answered/);
        expect(await run(context, "coach", { ...at, badge: "best", note: "Mate." })).toBe("Kept: it goes into the game's record. Stop now: end with one word.");
        expect(await run(context, "export", { format: "pgn" })).toMatch(/2\.\.\. Qh4# \{\[%badge best\]\s+\[%review\s+Mate\.\]\}/);

        // On the board page the player's move reaches the chat through status, which tells it once.
        const page = { ...playerFolder(), host: () => "claude-code" };
        setUpHosts(page.folder, "linux");
        helps(page, true);
        await run(page, "new_game", { ai_colour: "white" });
        await run(page, "ai_move", { move: "f3", plan: "p" });
        await run(page, "player_move", { move: "e5" });
        await run(page, "ai_move", { move: "g4", plan: "p" });
        await run({ ...page, host: undefined }, "player_move", { move: "Qh4" });
        // Just before the next step, where the AI acts on it (Priya, review of T-112).
        expect(await run(page, "status")).toMatch(new RegExp(`\\n${coachLine.replace(/[.()]/g, "\\$&")}[^\\n]*\\nNext: `));
        expect(await run(page, "status")).not.toContain(coachLine);
    });

    it("holds a note while a move it names is legal on the player's turn, not only until their next move (Anatolij, review of T-112)", async () => {
        const context = playerFolder();
        helps(context, true);
        await run(context, "new_game", { ai_colour: "black" });

        for (const [player, ai] of [["e4", "e5"], ["Bc4", "Bc5"], ["Qf3", "h6"], ["Nc3", "a6"]]) {
            await run(context, "player_move", { move: player });
            await run(context, "ai_move", { move: ai, plan: "p" });
        }

        const at = { game: keyOf(await run(context, "coach")), position: 8 };
        await run(context, "coach", { ...at, badge: "miss", note: "♕xf7 era matto." });
        const folder = gameFolder(context.home());
        const shown = () => coachShown(coachWords(folder, loadGame(folder)!), loadGame(folder)!).judgments;
        const judgment = { ply: 7, badge: "miss", note: "♕xf7 era matto.", held: ["Qxf7#"] };
        expect(coachWords(folder, loadGame(folder)!).judgments).toEqual([judgment]);
        expect(shown()).toEqual([]);

        await run(context, "player_move", { move: "d3" });
        expect(shown()).toEqual([]);
        await run(context, "ai_move", { move: "b5", plan: "p" });
        expect(shown()).toEqual([]);
        await run(context, "player_move", { move: "Bb3" });
        await run(context, "ai_move", { move: "Nf6", plan: "p" });
        // Let go by the last pair of moves: marked for the card, which shows it now (Zoe, playtest of T-112); one pair later, no longer.
        expect(shown()).toEqual([{ ...judgment, released: true }]);
        await run(context, "player_move", { move: "Nge2" });
        await run(context, "ai_move", { move: "Nc6", plan: "p" });
        expect(shown()).toEqual([judgment]);
    });

    it("judges the player's move before the opponent's that ends the game, into the archive beside what the analyst wrote there", async () => {
        const context = playerFolder();
        helps(context, true);
        await run(context, "new_game", { ai_colour: "black" });
        await run(context, "player_move", { move: "f3" });
        await run(context, "ai_move", { move: "e5", plan: "Centre." });
        await run(context, "player_move", { move: "g4" });
        await run(context, "ai_move", { move: "Qh4", plan: "Mate." });

        const start = await run(context, "coach");
        const at = { game: keyOf(start), position: 4 };
        expect(start).toMatch(/^Game "\w+", position 4: the game is over, 0-1.*, with the opponent's move\.\n/);
        expect(start).toContain("\nTheir move to judge: 2.g4. The position they played it in:\n");
        expect(start).toContain("\nAfter their move: at risk none; the opponent's checks: Qh4#.\n");
        expect(start).not.toContain("Now, for your hint");
        expect(start).toMatch(/\nNo hint: the game is over\. .*coach \{game: "\w+", position: 4, badge, note\}; then end with one word\.$/);
        await expect(run(context, "coach", { ...at, hint: "Look at h4." })).rejects.toThrow("The game is over: no hint.");

        // The analyst reviewed the game before the coach's judgment came (Federico, review of T-112).
        const folder = gameFolder(context.home());
        const [archived] = readdirSync(join(folder, "games"));
        const path = join(folder, "games", archived!);
        writeFileSync(path, readFileSync(path, "utf8").replace("1. f3", "{[%review A short game.]} 1. f3 {[%review Weakens the king.]}"));

        expect(await run(context, "coach", { ...at, badge: "blunder", note: "It opens the diagonal to the king." })).toBe(
            "Kept: it goes into the game's record. Stop now: end with one word.",
        );
        const pgn = readFileSync(path, "utf8");
        expect(pgn).toContain("A short game.");
        expect(pgn).toContain("Weakens the king.");
        expect(pgn).toMatch(/2\. g4\?\? \{\[%badge blunder\] \[%review It\s+opens\s+the\s+diagonal\s+to\s+the\s+king\.\]\}\s+2\.\.\. Qh4#/);
        expect(await run(context, "export", { format: "pgn" })).toContain("[%badge blunder]");
    });
});

function keyOf(start: string): string
{
    return /^Game "(\w+)"/.exec(start)?.[1] ?? "";
}

function helps(context: Context, on: boolean): void
{
    writeFileSync(join(gameFolder(context.home()), "settings.json"), JSON.stringify({ helps: on }));
}

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
