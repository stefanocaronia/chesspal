import { z } from "zod";
import { defineCommand } from "../src/commands/registry.ts";

/** A command with every kind of field, for the command line and the server: the real ones come with the chess (T-6). */
export const play = defineCommand({
    name: "play",
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
