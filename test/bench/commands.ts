// The commands' bench (D-34): a move as the MCP server plays it, game.json written, and the command line in a new process, against their budgets.
// Run it with: npm run bench, which builds dist/ first. It exits with 1 when a median is over its budget.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Context } from "../../src/commands/context.ts";
import { commands } from "../../src/commands/index.ts";
import { Game, writePgn } from "../../src/core/index.ts";
import { setUpHosts } from "../../src/host-files/index.ts";
import { gameFolder } from "../../src/profiles/index.ts";
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

// A chat attached to the table of its data folder (D-104), in a folder of its own: the table in this process, as near as another is.
const chatFolder = mkdtempSync(join(tmpdir(), "chesspal-bench-"));
const table = await startTable({ ...testContext(folder), now: () => new Date() });
const chat: Context = { ...testContext(chatFolder), home: context.home, told: new Set() };
const atTable = table === undefined ? undefined : await attachTable(chat, () => undefined);

try {
    await report([
        // A move's write takes the game's lock (D-104): half a millisecond more on a synced folder.
        { name: "a move through player_move or ai_move, game.json written", budget: 3.5, run: movesOfANewGame },
        { name: "a move with the chat at the table, which hears the call before it (D-104)", budget: 5, run: movesAtTheTable },
        { name: "status in a game", budget: 0.5, run: () => timed(1, () => call(context, "status")) },
        { name: "status after another process changed a game of 120 plies", budget: 25, run: readAgain },
        { name: "analyse_game on a game of 120 plies over, its positions new", budget: 250, run: analyseLong },
        { name: "chesspal status from the command line, a new process", budget: 500, run: () => timed(1, () => spawnSync(process.execPath, [cli, "status"], { cwd: folder, env: { ...process.env, CHESSPAL_HOME: folder } })) },
    ]);
} finally {
    await atTable?.close();
    await table?.close();
    rmSync(folder, { recursive: true, force: true });
    rmSync(chatFolder, { recursive: true, force: true });
    rmSync(studyFolder, { recursive: true, force: true });
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

/** The time of a status when game.json was written by someone else: read, parsed and replayed. */
function readAgain(): number
{
    writeFileSync(join(gameFolder(context.home()), "game.json"), longFile);
    return timed(1, () => call(context, "status"));
}

/** The time of the analysis of a long game of the archive, a new random one each time: no position of it computed before, as for a game imported. */
function analyseLong(): number
{
    const game = new Game({ tags: { Result: "1/2-1/2" }, moves: randomGame(seed++, 120).map((san) => ({ san })) });
    const study = testContext(studyFolder);
    mkdirSync(join(gameFolder(study.home()), "games"), { recursive: true });
    writeFileSync(join(gameFolder(study.home()), "games", "2026-11-02-153012.pgn"), writePgn(game.record));
    return timed(1, () => call(study, "analyse_game", { game: "games/2026-11-02-153012.pgn" }));
}

/** A command as the MCP server runs it: its input checked, its result as text. */
function call(at: Context, name: string, input: Record<string, unknown> = {}): string
{
    const command = commands.find((candidate) => candidate.name === name);

    if (command === undefined) {
        throw new Error(`There is no command ${name}.`);
    }

    return command.format(command.run(command.input.parse(input), at));
}
