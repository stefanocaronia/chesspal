// The commands' bench (D-34): a move as the MCP server plays it, game.json written, and the command line in a new process, against their budgets.
// Run it with: npm run bench, which builds dist/ first. It exits with 1 when a median is over its budget.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { commands, homeForOneCall } from "../../src/commands/index.ts";
import type { Context } from "../../src/commands/registry/context.ts";
import { Game, writePgn } from "../../src/core/index.ts";
import { archivedGames, forgetPositionShown, positionShownNote } from "../../src/games/index.ts";
import { setUpHosts } from "../../src/host-files/index.ts";
import { gameFolder } from "../../src/profiles/index.ts";
import { analysesOf } from "../../src/server/page/analyses.ts";
import { attachTable, startTable } from "../../src/server/table/index.ts";
import { testContext } from "../commands.ts";
import { randomGame, report, timed } from "./bench.ts";

const folder = mkdtempSync(join(tmpdir(), "chesspal-bench-"));
// A player's folder as init sets it up, and a chat whose MCP server keeps what it told it, as the server runs the commands.
setUpHosts(folder, process.platform);
const context: Context = { ...testContext(folder), told: new Set() };
const long = new Game({ tags: {}, moves: randomGame(1, 120).map((san) => ({ san })) });
const longFile = JSON.stringify({ format: 1, ai: "black", started: new Date().toISOString(), pgn: writePgn(long.record) });
// A game over in the archive of a data folder with no game going on, for the analysis.
const studyFolder = mkdtempSync(join(tmpdir(), "chesspal-bench-"));
const cli = fileURLToPath(new URL("../../dist/cli/cli.js", import.meta.url));
let seed = 2_000;
// A Najdorf whose 14 first plies a line of the book reaches, then random moves: the opening's name and the book's plies looked up to the book's depth.
const najdorf = ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "a6", "Be3", "e5", "Nb3", "Be6"];

// A chat attached to the table of its data folder (D-104), in a folder of its own: the table in this process, as near as another is.
const chatFolder = mkdtempSync(join(tmpdir(), "chesspal-bench-"));
const table = await startTable({ ...testContext(folder), now: () => new Date() });
const chat: Context = { ...testContext(chatFolder), home: context.home, told: new Set() };
const atTable = table === undefined ? undefined : await attachTable(chat, () => undefined);
// The archives past_games reads, of a keen player and a very keen one, and that one again as an older Chesspal wrote it, without the tags past_games lists
// from: the games of the first date are the oldest, at the end of the archive.
const played = playedGames();
const archives = new Map([100, 1_000].map((size) => [size, archiveOf(size, played)]));
const oldArchive = archiveOf(1_000, played.map((text) => text.replace(/^\[(?:ECO|Opening|PlyCount) .*\]\n/gm, "")));
const firstDate = "2025-01-01";

try {
    await report([
        // A move's write takes the game's lock (D-104): half a millisecond more on a synced folder.
        { name: "a move through player_move or ai_move, game.json written", budget: 3.5, run: movesOfANewGame },
        { name: "a move with the chat at the table, which hears the call before it (D-104)", budget: 5, run: movesAtTheTable },
        { name: "status in a game", budget: 0.5, run: () => timed(1, () => call(context, "status")) },
        { name: "a move in a game still in theory after 14 plies, game.json written", budget: 3.5, run: movesInTheory },
        { name: "status after another process changed a game of 40 plies still in theory after 14", budget: 20, run: readTheoryAgain },
        { name: "status after another process changed a game of 120 plies", budget: 25, run: readAgain },
        { name: "analyse_game on a game of 120 plies over, its positions new", budget: 250, run: analyseLong },
        // Each game read from its tags: opening its file is most of it, some 50 µs.
        ...[...archives].flatMap(([size, archive]) => {
            const games = `${size.toLocaleString("en")} games`;
            return [
                { name: `past_games, the latest 20 of ${games}`, budget: 4, run: () => pastGames(archive) },
                { name: `past_games searching words of many games, ${games}`, budget: 4, run: () => pastGames(archive, "won") },
                { name: `past_games searching words of a few old games, all ${games} read`, budget: size * 0.08, run: () => pastGames(archive, firstDate) },
            ];
        }),
        // The old archive's path: each game read whole, its moves played and its opening looked up, some 4 ms.
        { name: "past_games, the latest 20 of 1,000 games an older Chesspal archived without the tags, each read whole", budget: 250, run: () => pastGames(oldArchive) },
        // The page's list of games: each read whole, its moves not played, for its review.
        ...[...archives].map(([size, archive]) => ({ name: `the page's list of games, ${size.toLocaleString("en")} games`, budget: size * 0.17, run: () => timed(1, () => analysesOf(archive.home())) })),
        { name: "chesspal status from the command line, a new process", budget: 500, run: () => timed(1, () => spawnSync(process.execPath, [cli, "status"], { cwd: folder, env: { ...process.env, CHESSPAL_HOME: folder } })) },
        // Claude Code runs the prompt hook on every message: one that is no move looks for the chat's page, tells it, and leaves. The table answers from
        // this process, which waits for the hook without stopping.
        { name: "chesspal prompt on a message that is no move, no page of the chat's, a new process", budget: 150, run: async () => (await prompted("Is it my move?")).time },
        { name: "chesspal prompt on a message that is no move, the chat at the table told, a new process", budget: 150, run: async () => (await prompted("Is it my move?", chatFolder)).time },
        { name: "chesspal prompt on a move, played and answered, a new process", budget: 500, run: promptedMove },
        { name: "the chat's server looks for the prompt hook's note before a tool, none there", budget: 0.1, run: lookForNote },
    ]);
} finally {
    await atTable?.close();
    await table?.close();
    rmSync(folder, { recursive: true, force: true });
    rmSync(chatFolder, { recursive: true, force: true });
    rmSync(studyFolder, { recursive: true, force: true });
    [...archives.values(), oldArchive].forEach((archive) => rmSync(archive.folder, { recursive: true, force: true }));
}

/** The time of one move of a new random game of 40 plies, the player's and the AI's in turn, each saved. */
function movesOfANewGame(): number
{
    const moves = randomGame(seed++, 40);
    call(context, "new_game", { ai_colour: "black", replace: true });
    let time = 0;

    moves.forEach((move, index) => {
        time += timed(1, () => (index % 2 === 0 ? call(context, "player_move", { move }) : call(context, "ai_move", { move, plan: "A plan.", comment: "A comment." })));
    });

    return time / moves.length;
}

/** The time of one move of a new game of 40 plies past the book's 14 plies of a Najdorf, the player's and the AI's in turn, each saved. */
function movesInTheory(): number
{
    const moves = randomGame(seed++, 40, najdorf);
    call(context, "new_game", { ai_colour: "black", replace: true });
    let time = 0;

    moves.forEach((move, index) => {
        const took = timed(1, () => (index % 2 === 0 ? call(context, "player_move", { move }) : call(context, "ai_move", { move, plan: "A plan.", comment: "A comment." })));
        time += index < najdorf.length ? 0 : took;
    });

    return time / (moves.length - najdorf.length);
}

/** The time of a status when game.json of a game still in theory after 14 plies was written by someone else: read, parsed, replayed and looked up. */
function readTheoryAgain(): number
{
    const game = new Game({ tags: {}, moves: randomGame(seed++, 40, najdorf).map((san) => ({ san })) });
    writeFileSync(join(gameFolder(context.home()), "game.json"), JSON.stringify({ format: 1, ai: "black", started: new Date().toISOString(), pgn: writePgn(game.record) }));
    return timed(1, () => call(context, "status"));
}

/**
 * The time of one move of a new random game with the chat at the table: the table told of the call before it runs; the copy of what the chat saw goes
 * after the answer, off the AI's clock, and has gone before the next move, as between two tools of a chat.
 */
async function movesAtTheTable(): Promise<number>
{
    if (atTable === undefined) {
        throw new Error("The chat did not attach to the bench's table: another table holds its ports.");
    }

    const moves = randomGame(seed++, 40);
    call(chat, "new_game", { ai_colour: "black", replace: true });
    let time = 0;

    for (const [index, move] of moves.entries()) {
        const started = performance.now();
        await atTable.chatCalls();
        void (index % 2 === 0 ? call(chat, "player_move", { move }) : call(chat, "ai_move", { move, plan: "A plan.", comment: "A comment." }));
        time += performance.now() - started;
        atTable.toolEnded();
        await new Promise((done) => setTimeout(done, 5));
    }

    return time / moves.length;
}

/** The prompt hook in a process of its own, as Claude Code runs it in the chat's folder, with the message given: what it wrote, and in how many ms. */
async function prompted(prompt: string, chatIn = folder): Promise<{ said: string; time: number; }>
{
    const input = JSON.stringify({ session_id: "bench", cwd: chatIn, hook_event_name: "UserPromptSubmit", prompt });
    const started = performance.now();
    const hook = spawn(process.execPath, [cli, "prompt"], { cwd: chatIn, env: { ...process.env, CHESSPAL_HOME: folder, CLAUDE_PROJECT_DIR: chatIn } });
    let said = "";
    hook.stdout.on("data", (chunk: Buffer) => (said += String(chunk)));
    hook.stdin.end(input);
    await new Promise((done) => hook.on("close", done));
    return { said, time: performance.now() - started };
}

/** The time of the prompt hook on the player's first move of a new game: read, played, saved, noted and answered. */
async function promptedMove(): Promise<number>
{
    call(context, "new_game", { ai_colour: "black", replace: true });
    const { said, time } = await prompted("e4");
    forgetPositionShown(folder);

    if (!said.includes("Chesspal has already played")) {
        throw new Error(`The prompt hook did not play the move: it wrote "${said}".`);
    }

    return time;
}

/** The time the chat's server spends on the prompt hook's note before each tool, when there is none: one read that fails. */
function lookForNote(): number
{
    return timed(1_000, () => {
        for (let index = 0; index < 1_000; index++) {
            positionShownNote(folder);
        }
    });
}

/** The time of a status when game.json was written by someone else: read, parsed and replayed. */
function readAgain(): number
{
    writeFileSync(join(gameFolder(context.home()), "game.json"), longFile);
    return timed(1, () => call(context, "status"));
}

/** The time of the analysis of a long game of the archive, a new random one each time: no position of it computed before, as for a game imported. */
async function analyseLong(): Promise<number>
{
    const game = new Game({ tags: { Result: "1/2-1/2" }, moves: randomGame(seed++, 120).map((san) => ({ san })) });
    const study = testContext(studyFolder);
    mkdirSync(join(gameFolder(study.home()), "games"), { recursive: true });
    writeFileSync(join(gameFolder(study.home()), "games", "2026-11-02-153012.pgn"), writePgn(game.record));
    const started = performance.now();
    await callAwaited(study, "analyse_game", { game: "games/2026-11-02-153012.pgn" });
    return performance.now() - started;
}

/** The time of past_games on an archive, with the words searched. */
function pastGames(archive: Context, search?: string): number
{
    return timed(1, () => call(archive, "past_games", search === undefined ? {} : { search }));
}

/**
 * A data folder whose archive holds that many games, one every eight hours from the first date: the games played, with the AI's plans and comments, copied in
 * turn under the names of the others.
 */
function archiveOf(size: number, texts: string[]): Context
{
    const archive = { ...testContext(mkdtempSync(join(tmpdir(), "chesspal-bench-"))), told: new Set<string>() };
    const games = join(gameFolder(archive.home()), "games");
    mkdirSync(games, { recursive: true });

    for (let index = 0; index < size; index++) {
        const start = new Date(2025, 0, 1, 9 + index * 8);
        const name = `${start.getFullYear()}-${twoDigits(start.getMonth() + 1)}-${twoDigits(start.getDate())}-${twoDigits(start.getHours())}0000.pgn`;
        writeFileSync(join(games, name), texts[index % texts.length]!);
    }

    return archive;
}

/** The PGN of a dozen games played through the commands, from the openings players choose most, for all the archives. */
function playedGames(): string[]
{
    const openings = [
        ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "a6"],
        ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6", "O-O", "Be7"],
        ["d4", "d5", "c4", "e6", "Nc3", "Nf6", "Bg5", "Be7"],
        ["e4", "e6", "d4", "d5", "Nc3", "Bb4"],
        ["e4", "c6", "d4", "d5", "Nc3", "dxe4", "Nxe4", "Bf5"],
        ["d4", "Nf6", "c4", "g6", "Nc3", "Bg7", "e4", "d6", "Nf3", "O-O"],
        ["c4", "e5", "Nc3", "Nf6"],
        ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "c3", "Nf6"],
        ["d4", "d5", "c4", "c6", "Nf3", "Nf6", "Nc3", "dxc4"],
        ["e4", "d5", "exd5", "Qxd5", "Nc3", "Qa5"],
        ["Nf3", "d5", "g3", "Nf6", "Bg2", "c6"],
        ["e4", "c5", "Nc3", "Nc6", "g3", "g6"],
    ];
    let day = 1;
    const player = { ...testContext(mkdtempSync(join(tmpdir(), "chesspal-bench-"))), now: () => new Date(2026, 9, day, 18), told: new Set<string>() };
    const folder = gameFolder(player.home());

    openings.forEach((opening, index) => {
        const ai = index % 2 === 0 ? "black" : "white";
        day = 1 + index;
        call(player, "new_game", { ai_colour: ai, replace: true });

        randomGame(3_000 + index * 10, 60 + (index % 4) * 10, opening).forEach((move, ply) => {
            const aiMoves = (ply % 2 === 0) === (ai === "white");
            call(player, aiMoves ? "ai_move" : "player_move", aiMoves ? { move, plan: "Keep the knight on its outpost and push the queenside pawns.", comment: "Your knight looks lonely there." } : { move });
        });

        call(player, "end_game", { result: index % 3 === 0 ? "ai_resigns" : "player_resigns" });
    });

    const games = archivedGames(folder).map((name) => readFileSync(join(folder, name), "utf8"));
    rmSync(player.folder, { recursive: true, force: true });
    return games;
}

function twoDigits(number: number): string
{
    return String(number).padStart(2, "0");
}

/** A command as the MCP server runs it: its input checked, its result as text. */
function call(at: Context, name: string, input: Record<string, unknown> = {}): string
{
    const command = commands.find((candidate) => candidate.name === name);

    if (command === undefined) {
        throw new Error(`There is no command ${name}.`);
    }

    return command.format(command.run(command.input.parse(input), { ...at, home: homeForOneCall(at) }));
}

/** A command that answers later, as analyse_game, which may ask the sites: its result as text once it has it. */
async function callAwaited(at: Context, name: string, input: Record<string, unknown> = {}): Promise<string>
{
    const command = commands.find((candidate) => candidate.name === name);

    if (command === undefined) {
        throw new Error(`There is no command ${name}.`);
    }

    return command.format(await command.run(command.input.parse(input), { ...at, home: homeForOneCall(at) }));
}
