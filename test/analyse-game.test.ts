import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { aiMove } from "../src/commands/ai-move.ts";
import { analyseGame } from "../src/commands/analyse-game.ts";
import type { Context } from "../src/commands/context.ts";
import { endGame } from "../src/commands/end-game.ts";
import { look } from "../src/commands/look.ts";
import { newGame } from "../src/commands/new-game.ts";
import { pastGames } from "../src/commands/past-games.ts";
import { playerMove } from "../src/commands/player-move.ts";
import { position } from "../src/commands/position.ts";
import { newProfile } from "../src/commands/profiles.ts";
import { studyGames } from "../src/commands/study-games.ts";
import { saveChatStart } from "../src/games/index.ts";
import { gameFolder } from "../src/profiles/index.ts";
import { createMcpServer } from "../src/server/mcp.ts";
import { testContext } from "./commands.ts";

const folders: string[] = [];

afterEach(() => {
    for (const folder of folders.splice(0)) {
        rmSync(folder, { recursive: true, force: true });
    }
});

// The scholar's mate, with Lichess's clock: the first move of each side spends no time it can tell.
const pgn = `[Event "Casual"]
[White "Ann"]
[Black "Bob"]
[Date "2026.10.01"]
[TimeControl "300+2"]
[Result "1-0"]

1. e4 { [%clk 0:05:00] } e5 { [%clk 0:04:58] } 2. Bc4 { [%clk 0:04:55] } Nc6 { [%clk 0:04:50] } 3. Qh5 { [%clk 0:04:40] } Nf6 { [%clk 0:04:30] }
4. Qxf7# { [%clk 0:04:35] } 1-0`;

const imported = "study/2026-11-02-153012.pgn";

describe("the analysis of a game (D-68)", () => {
    it("gives a game brought as a PGN move by move, facts only, and keeps it in the archive once", async () => {
        const context = playerFolder();
        const analysis = await analyse(context, { pgn });

        expect(analysis).toBe([
            "White: Ann; Black: Bob. 2026.10.01, time control 5+2. Result: 1-0 (checkmate), after 4 moves.",
            "Opening: C23 Bishop's Opening, in the book to 3.Qh5: those moves have the book badge, unless you give another",
            `Look and position take it as game "${imported}".`,
            "1.e4: 5:00 left",
            "1...e5: 4:58 left",
            "2.Bc4: spent 0:07, 4:55 left",
            "2...Nc6: spent 0:10, 4:50 left",
            "3.Qh5: spent 0:17, 4:40 left; at risk: outnumbered Black Pf7",
            "3...Nf6: spent 0:22, 4:30 left; at risk: undefended White Qh5 Pe4; outnumbered Black Pf7; mate in one: Qxf7#; out of book",
            "4.Qxf7#: took P; spent 0:07, 4:35 left; material White +1",
        ].join("\n"));

        expect(await analyse({ ...context, now: () => new Date(2026, 10, 3) }, { pgn })).toBe(analysis);
        expect(await analyse(context, { game: imported })).toBe(analysis);
        expect(await analyse(context, { game: " 2026-11-02-153012 " })).toBe(analysis);
    });

    it("keeps a game brought as a PGN with its clock alone, and names the player's side by the profile", async () => {
        const context = playerFolder();
        await newProfile.run(newProfile.input.parse({ name: "Bob" }), context);
        const commented = `[White "Ann"]\n[Black "Bob"]\n[TimeControl "180"]\n\n1. e4 { [%clk 0:03:00] } e5 { [%clk 0:03:00] } 2. Nf3 $1 { [%eval 0.3] Best move [%clk 0:02:55] } *`;

        expect(await analyse(context, { pgn: commented })).toBe([
            "White: Ann; Black: Bob (the player). Time control 3+0. Result: unknown, after 2 moves.",
            "Opening: C40 King's Knight Opening, in the book to the end: those moves have the book badge, unless you give another",
            `Look and position take it as game "${imported}".`,
            "1.e4: 3:00 left",
            "1...e5: 3:00 left",
            "2.Nf3: spent 0:05, 2:55 left; at risk: undefended Black Pe5",
        ].join("\n"));
        expect(readFileSync(join(gameFolder(context.folder), imported), "utf8")).toMatch(/2\.\s+Nf3 \{\[%clk 0:02:55\] \[%badge book\]\} \*/);
    });

    it("keeps a game brought as a PGN to study in the profile that brought it, listed by study_games and not among the games played", async () => {
        const context = playerFolder();
        const none = "No game kept to study yet: analyse_game with the PGN of a game played elsewhere keeps it here.";
        await newProfile.run(newProfile.input.parse({ name: "Ann" }), context);
        expect(await listStudy(context)).toBe(none);

        await analyse(context, { pgn });

        expect(await listStudy(context)).toBe(`Ann vs Bob, 2026.10.01: 1-0, C23 Bishop's Opening, 4 moves. ${imported}`);
        expect(await lookAt(context, { game: imported, move: "1." })).toMatch(/^After 1\.e4 in /);
        expect(pastGames.format(await pastGames.run(pastGames.input.parse({}), context))).toBe("No game played yet.");

        // Another profile has studies of its own.
        await newProfile.run(newProfile.input.parse({ name: "Carla" }), context);

        expect(await listStudy(context)).toBe(none);
        await expect(async () => lookAt(context, { game: imported })).rejects.toThrow(/There is no/);
    });

    it("numbers the moves of a game from a position, and tells an en passant capture and a promotion", async () => {
        const context = playerFolder();
        const fromBlack = `[FEN "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"]\n[SetUp "1"]\n\n1... e5 2. Nf3 Nc6 *`;
        const promotion = `[FEN "r3k3/1P6/8/8/1p6/8/2P5/4K3 w - - 0 1"]\n[SetUp "1"]\n\n1. c4 bxc3 2. bxa8=Q+ *`;

        expect(await analyse(context, { pgn: fromBlack })).toMatch(/\n1\.\.\.e5\n2\.Nf3: at risk: undefended Black Pe5\n2\.\.\.Nc6: at risk: none$/);
        expect(await lookAt(context, { game: imported, move: "2." })).toMatch(/^After 2\.Nf3 in /);
        expect(await analyse({ ...context, now: () => new Date(2026, 10, 3) }, { pgn: promotion })).toMatch(
            /\n1\.\.\.bxc3: took P; material Black \+5; at risk: undefended Black Ra8; tactics: promote b8=Q\+, bxa8=Q\+\n2\.bxa8=Q\+: took R; material White \+8; at risk: none$/,
        );
    });

    it("gives the start of a game from a position, with the mates there, and takes the result from the board before the tags", async () => {
        const context = playerFolder();
        const missed = `[FEN "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1"]
[SetUp "1"]

1. h3 h6 *`;
        const fools = `[Result "1-0"]

1. f3 e5 2. g4 Qh4# 1-0`;

        expect(await analyse(context, { pgn: missed })).toBe([
            "White: ?; Black: ?. Result: unknown, after 1 move.",
            `Look and position take it as game "${imported}".`,
            "Start, 6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1: mate in one: Ra8#",
            "1.h3",
            "1...h6",
        ].join("\n"));
        expect(await analyse({ ...context, now: () => new Date(2026, 10, 3) }, { pgn: fools })).toMatch(
            /^White: \?; Black: \?\. Result: 0-1 \(checkmate\), after 2 moves\.\n[\s\S]*\n2\.g4: mate in one: Qh4#\n2\.\.\.Qh4#$/,
        );
    });

    it("says when the side to move had one legal move alone, as after the check of Légal's mate (D-103)", async () => {
        const context = playerFolder();
        const analysis = await analyse(context, { pgn: "1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5# 1-0" });

        expect(analysis).toMatch(/\n6\.Bxf7\+: [^\n]*; one legal move: Ke7[;\n]/);
        expect(analysis.match(/one legal move/g)).toHaveLength(1);
    });

    it("says what is at risk only when it changes, and none once nothing is", async () => {
        const context = playerFolder();
        const analysis = await analyse(context, { pgn: "1. e4 d5 2. a3 dxe4 3. Nc3 Nf6 *" });

        expect(analysis).toMatch(/\n1\.\.\.d5: at risk: undefended White Pe4\n2\.a3: out of book\n2\.\.\.dxe4: took P; material Black \+1; at risk: none\n3\.Nc3: at risk: undefended Black Pe4\n/);
    });

    it("gives the game played here once it is over, with what the AI said and planned, and nothing while a game goes on", async () => {
        const context = playerFolder();
        await newGame.run(newGame.input.parse({ ai_colour: "black", level: "beginner" }), context);
        await playerMove.run(playerMove.input.parse({ move: "e4" }), context);
        await aiMove.run(aiMove.input.parse({ move: "d5", plan: "open the centre", comment: "Straight at you." }), context);

        const going = /^A game is going on: games are analysed once it is over/;
        await expect(async () => analyse(context, {})).rejects.toThrow(going);
        await expect(async () => analyse(context, { pgn })).rejects.toThrow(going);
        await expect(async () => lookAt(context, { move: "1..." })).rejects.toThrow(going);
        await expect(async () => position.run(position.input.parse({ move: "1." }), context)).rejects.toThrow(going);

        await endGame.run(endGame.input.parse({ result: "player_resigns" }), context);
        expect(await analyse(context, {})).toBe([
            "You played Black at the beginner level, the player White. 2026.11.02. Result: 0-1 (White resigns), after 1 move.",
            "Opening: B01 Scandinavian Defense, in the book to the end: those moves have the book badge, unless you give another",
            'Look and position take it as game "games/2026-11-02-153012.pgn".',
            "1.e4",
            '1...d5: at risk: undefended White Pe4; you said "Straight at you."; your plan: open the centre',
        ].join("\n"));

        // A game kept to study by the same name: the name alone is the game played.
        await analyse(context, { pgn });
        expect(await lookAt(context, { game: "2026-11-02-153012", move: "1." })).toMatch(/^After 1\.e4 in games\/2026-11-02-153012\.pgn: /);
        expect(await lookAt(context, { game: "study/2026-11-02-153012", move: "1." })).toMatch(/^After 1\.e4 in study\/2026-11-02-153012\.pgn: /);
    });

    it("says how to analyse the first time in a chat where the server keeps what it told, and again once the chat starts again", async () => {
        const context = playerFolder();
        createMcpServer(context);
        const instructions = /^The player asked you to analyse a game/;

        expect(await analyse(context, { pgn })).toMatch(instructions);
        expect(await analyse(context, { pgn })).not.toMatch(instructions);
        saveChatStart(context.folder, { source: "compact", at: "2026-11-02T15:40:00.000Z" });
        expect(await analyse(context, { pgn })).toMatch(instructions);
        expect(await analyse(testContext(context.folder), { pgn })).not.toMatch(instructions);
    });

    it("refuses a game it cannot take", async () => {
        const context = playerFolder();
        await expect(async () => analyse(context, {})).rejects.toThrow(/There is no game to study/);
        await expect(async () => analyse(context, { game: imported, pgn })).rejects.toThrow(/not both/);
        await expect(async () => analyse(context, { pgn: `${pgn}\n\n${pgn}` })).rejects.toThrow(/holds 2 games/);
        await expect(async () => analyse(context, { pgn: "1. e4 e5 2. Ke3" })).rejects.toThrow();
        await expect(async () => analyse(context, { pgn: "F:\\games\\2026-11-02-153012.PGN" })).rejects.toThrow(/is a file's name, not a game: pgn takes a game's text/);

        for (const name of ["../game.json", "games/../../x.pgn", "study/../x.pgn"]) {
            await expect(async () => analyse(context, { game: name })).rejects.toThrow(/is no game (of the archive|kept to study)/);
        }
    });
});

describe("look and position on a game over (D-68)", () => {
    it("give any position of a game by its move, the move deciding the side when the dots do not", async () => {
        const context = playerFolder();
        await analyse(context, { pgn });

        expect(await lookAt(context, { game: imported, move: "3..." })).toMatch(/^After 3\.\.\.Nf6 in .*: White to move\.\n[\s\S]*Pinned: Black Pf7 to Ke8 by Qh5/);
        expect(await lookAt(context, { game: imported, move: "2.Nc6" })).toMatch(/^After 2\.\.\.Nc6 in /);
        expect(await lookAt(context, { game: imported, move: "2…" })).toMatch(/^After 2\.\.\.Nc6 in /);
        expect(await lookAt(context, { game: imported })).toMatch(/^After 4\.Qxf7# in .*: the board ends the game by checkmate\./);
        expect(await lookAt(context, { game: imported, move: "2.", only: "board" })).toContain("4 ⊙ ⊙ ♗ ⊙ ♙ ⊙ ⊙ ⊙ 4");

        const profile = position.format(await position.run(position.input.parse({ game: imported, move: "1..." }), context));
        expect(profile).toMatch(new RegExp(`^After 1\\.\\.\\.e5 in ${imported}: White to move\\.\\nPhase: opening\\nMaterial: even`));
    });

    it("show the chat the game in analysis on the board page without its name, and an agent the game just over (D-101)", async () => {
        const context = playerFolder();
        await newGame.run(newGame.input.parse({ ai_colour: "black" }), context);
        await playerMove.run(playerMove.input.parse({ move: "e4" }), context);
        await aiMove.run(aiMove.input.parse({ move: "d5", plan: "open the centre" }), context);
        await endGame.run(endGame.input.parse({ result: "player_resigns" }), context);
        await analyse(context, { pgn });

        expect(await lookAt(context, { move: "1..." })).toMatch(new RegExp(`^After 1\\.\\.\\.e5 in ${imported}:`));
        expect(position.format(await position.run(position.input.parse({ move: "1..." }), context))).toMatch(new RegExp(`^After 1\\.\\.\\.e5 in ${imported}:`));
        expect(await lookAt({ ...context, agent: "chesspal-analyst" }, { move: "1..." })).toMatch(/^After 1\.\.\.d5 in games\//);
    });

    it("refuse a move the game does not have", async () => {
        const context = playerFolder();
        await analyse(context, { pgn });

        await expect(async () => lookAt(context, { game: imported, move: "2.Nf3" })).rejects.toThrow("There is no 2.Nf3 in this game: move 2 is 2.Bc4 2...Nc6.");
        await expect(async () => lookAt(context, { game: imported, move: "9." })).rejects.toThrow("There is no 9. in this game: its moves go from 1.e4 to 4.Qxf7#.");
        await expect(async () => lookAt(context, { game: imported, move: "e4" })).rejects.toThrow(/is not a move of the game/);
        await expect(async () => lookAt(context, { game: "study/2026-01-01-000000.pgn" })).rejects.toThrow(/There is no/);
    });
});

async function analyse(context: Context, input: object): Promise<string>
{
    return analyseGame.format(await analyseGame.run(analyseGame.input.parse(input), context));
}

async function listStudy(context: Context): Promise<string>
{
    return studyGames.format(await studyGames.run(studyGames.input.parse({}), context));
}

async function lookAt(context: Context, input: object): Promise<string>
{
    return look.format(await look.run(look.input.parse(input), context));
}

function playerFolder(): Context
{
    const folder = mkdtempSync(join(tmpdir(), "chesspal-"));
    folders.push(folder);
    return testContext(folder);
}
