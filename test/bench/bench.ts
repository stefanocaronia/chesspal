// What the benches share: timing, seeded random games, and the report against the budgets (D-34).
import { Chess } from "chess.js";

/** A case of a bench: what it times, its budget in milliseconds, and a run giving the time of one operation, at once or once it has ended. */
export interface BenchCase
{
    name: string;
    budget: number;
    run: () => number | Promise<number>;
}

/** Runs each case, one run after another, and prints its median against its budget; the process exits with 1 when one is over. */
export async function report(cases: BenchCase[], runs = 25): Promise<void>
{
    let over = false;
    console.log("| what | median | budget |\n|---|---|---|");

    for (const { name, budget, run } of cases) {
        await run();
        const times: number[] = [];

        for (let index = 0; index < runs; index++) {
            times.push(await run());
        }

        times.sort((one, other) => one - other);
        const median = times[Math.floor(runs / 2)] ?? 0;
        over ||= median > budget;
        console.log(`| ${name} | ${format(median)} | ${format(budget)}${median > budget ? " ✗ over" : ""} |`);
    }

    process.exitCode = over ? 1 : process.exitCode;
}

/** The time of one of the operations a piece of work does, in milliseconds. */
export function timed(operations: number, work: () => unknown): number
{
    const started = performance.now();
    work();
    return (performance.now() - started) / operations;
}

/**
 * A game of random legal moves, after an opening when one is given, made on chess.js so that the core sees its positions for the first time; from the
 * first seed that lasts long enough.
 */
export function randomGame(firstSeed: number, length: number, opening: string[] = []): string[]
{
    for (let attempt = firstSeed;; attempt++) {
        const random = randomFrom(attempt);
        const chess = new Chess();
        const moves = [...opening];
        moves.forEach((move) => chess.move(move));

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

/** The moves of a game as squares: e2e4, e7e8q. */
export function squaresOf(moves: string[]): string[]
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
