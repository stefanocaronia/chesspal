// The core's bench (D-34): times what a move costs, in one process as the MCP server runs it, against budgets a change must not break.
// Run it with: npm run bench. It exits with 1 when a median is over its budget.
import { Chess } from "chess.js";
import { Game, readPgn, writePgn } from "../../src/core/index.ts";

const plies = 120;
const runs = 25;
const comment = "A comment of the length an AI writes, about the move and the plan.";

const sans = randomGame(1, plies);
const record = new Game({ tags: { Event: "Bench" }, moves: sans.map((san, index) => (index % 5 === 4 ? { san, nags: [1], comment } : { san })) }).record;
const pgn = writePgn(record);
const archive = Array.from({ length: 100 }, () => pgn).join("\n");
const kept = new Game();
let seed = 1_000;

// Each case gives the time of one operation, in milliseconds.
const cases: { name: string; budget: number; run: () => number; }[] = [
    { name: `replay a game of ${plies} plies`, budget: 15, run: () => timed(1, () => new Game(record)) },
    { name: "play a move in SAN", budget: 0.15, run: () => timed(sans.length, () => playAll(sans)) },
    { name: "play a move as squares, in a new position", budget: 2.5, run: () => onNewPositions((game, move) => game.play(move), true) },
    { name: "a move as the server plays it, in a new position", budget: 2.5, run: () => onNewPositions(serverMove) },
    { name: "legal moves of a position not seen yet", budget: 1.5, run: () => looksAtNewPositions((game) => game.legalMoves()) },
    { name: "legal moves of a position seen", budget: 0.005, run: () => timed(1_000, () => repeat(1_000, () => kept.legalMoves())) },
    { name: "position and outcome of a new position", budget: 0.1, run: () => looksAtNewPositions((game) => [game.position, game.outcome]) },
    { name: `write the PGN of ${plies} plies`, budget: 1, run: () => timed(1, () => writePgn(record)) },
    { name: `read the PGN of ${plies} plies`, budget: 20, run: () => timed(1, () => readPgn(pgn)) },
    { name: "read 100 games of PGN", budget: 2_000, run: () => timed(1, () => readPgn(archive)) },
];

let over = false;
console.log("| what | median | budget |\n|---|---|---|");

for (const { name, budget, run } of cases) {
    run();
    const times = Array.from({ length: runs }, run).sort((one, other) => one - other);
    const median = times[Math.floor(runs / 2)] ?? 0;
    over ||= median > budget;
    console.log(`| ${name} | ${format(median)} | ${format(budget)}${median > budget ? " ✗ over" : ""} |`);
}

process.exitCode = over ? 1 : 0;

function timed(operations: number, work: () => unknown): number
{
    const started = performance.now();
    work();
    return (performance.now() - started) / operations;
}

/** The time of one look at positions not seen yet: those of a new random game each run (its first plies may repeat another's). */
function looksAtNewPositions(look: (game: Game) => unknown): number
{
    const moves = randomGame(seed++, 40);
    const game = new Game();
    let time = 0;

    for (const move of moves) {
        game.play(move);
        time += timed(1, () => look(game));
    }

    return time / moves.length;
}

/** The time of one move, played from positions not seen yet. */
function onNewPositions(play: (game: Game, move: string) => void, asSquares = false): number
{
    const sans = randomGame(seed++, 40);
    const moves = asSquares ? squaresOf(sans) : sans;
    const game = new Game();
    let time = 0;

    for (const move of moves) {
        time += timed(1, () => play(game, move));
    }

    return time / moves.length;
}

/** What the server does at each move: play it, then what it tells the AI about the new position. */
function serverMove(game: Game, move: string): void
{
    game.play(move);
    void [game.position, game.outcome, game.legalMoves()];
}

function playAll(moves: string[]): void
{
    const game = new Game();

    for (const move of moves) {
        game.play(move);
    }
}

function repeat(times: number, work: () => unknown): void
{
    for (let index = 0; index < times; index++) {
        work();
    }
}

/** A game of random legal moves, made on chess.js so that the core sees its positions for the first time; from the first seed that lasts long enough. */
function randomGame(firstSeed: number, length: number): string[]
{
    for (let attempt = firstSeed;; attempt++) {
        const random = randomFrom(attempt);
        const chess = new Chess();
        const moves: string[] = [];

        while (moves.length < length && !chess.isGameOver()) {
            const legal = chess.moves();
            const move = legal[Math.floor(random() * legal.length)] ?? "";
            chess.move(move);
            moves.push(move);
        }

        if (moves.length === length) {
            return moves;
        }
    }
}

function squaresOf(moves: string[]): string[]
{
    const chess = new Chess();
    return moves.map((san) => {
        const { from, to, promotion } = chess.move(san);
        return `${from}${to}${promotion ?? ""}`;
    });
}

/** A small seeded generator, so the bench plays the same games every time. */
function randomFrom(start: number): () => number
{
    let state = start;

    return () => {
        state = (state * 1_103_515_245 + 12_345) % 2 ** 31;
        return state / 2 ** 31;
    };
}

function format(milliseconds: number): string
{
    return milliseconds < 1 ? `${Math.round(milliseconds * 1_000)} µs` : `${milliseconds.toFixed(1)} ms`;
}
