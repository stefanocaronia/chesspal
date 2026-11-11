import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { z } from "zod";
import { type Context, withProfile } from "../src/commands/registry/context.ts";
import { defineCommand } from "../src/commands/registry/registry.ts";

/**
 * A context for the tests: a folder, which is the data folder too, its first profile made by Chesspal for the account "Player" as it needs it, a fixed
 * draw, a fixed time (2 November 2026 at 15:30:12 where the tests run) and Linux.
 */
export function testContext(folder = "/the/player", random = 0, now = new Date(2026, 10, 2, 15, 30, 12), platform = "linux"): Context
{
    return { folder, home: () => withProfile(temporary(folder), "Player"), random: () => random, now: () => now, platform, given: new Set() };
}

// A test writes its data only in a temporary folder of its own, never on the disk at large.
function temporary(folder: string): string
{
    if (!resolve(folder).startsWith(resolve(tmpdir()))) {
        throw new Error(`${folder} is no temporary folder: give testContext one made with mkdtemp, before a command that reads the data folder.`);
    }

    return folder;
}

/** A command with every kind of field, for the command line and the server: the real ones come with the chess. */
export const play = defineCommand({
    name: "try_move",
    description: "Plays a move in a test game. Only the tests know it.",
    input: z.object({
        san: z.string().describe("the move, in SAN"),
        minutes: z.number().optional().describe("the minutes left"),
        tag: z.array(z.string()).optional().describe("a tag of the move"),
        seconds: z.array(z.number()).optional().describe("the seconds each move took"),
        flip: z.boolean().default(true).describe("turn the board"),
    }),
    positionals: ["san"],
    run: (input) => input,
    format: (result) => JSON.stringify(result),
});

/** A tool that answers after 200 ms, to close the server's input while it runs. */
export const slow = defineCommand({
    name: "slow",
    description: "Answers after a while.",
    input: z.object({}),
    run: async (): Promise<string> => {
        await new Promise((done) => setTimeout(done, 200));
        return "done";
    },
    format: (result) => result,
});
