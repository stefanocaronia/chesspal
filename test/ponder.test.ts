import { commands } from "chesspal";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Context } from "../src/commands/context.ts";
import { setUpHosts } from "../src/host-files/host-files.ts";
import { testContext } from "./commands.ts";

const folders: string[] = [];

afterEach(() => {
    for (const folder of folders.splice(0)) {
        rmSync(folder, { recursive: true, force: true });
    }
});

describe("the AI thinking on the player's time (D-72)", () => {
    it("gives the position, the one after a reply, keeps the answer and gives it back with the player's move", async () => {
        const context = playerFolder();
        await run(context, "new_game", { ai_colour: "black" });

        expect(await run(context, "ponder")).toMatch(
            /^Position 0: the player \(White\) to move, move 1; you play Black at the strong level \(.*\)\.\nFEN: .*\n(?:.*\n)*For each reply you think likely, ponder \{position: 0, reply\}/,
        );
        expect(await run(context, "ponder", { position: 0, reply: "e2e4" })).toMatch(
            /^If the player plays e4:\nYou \(Black\) to move, move 1\.\nLast move: 1\.e4 \(e2-e4\)\.\n(?:.*\n)*Keep your answer: ponder \{position: 0, reply: "e4", move, why\}\.$/,
        );
        await expect(run(context, "ponder", { position: 0, reply: "e5" })).rejects.toThrow(/The player's legal moves: .*\. Nothing changed\.$/);
        await expect(run(context, "ponder", { position: 0, reply: "e4", move: "e4", why: "No." })).rejects.toThrow(/Your legal moves after e4: .*\. Nothing changed\.$/);
        await expect(run(context, "ponder", { position: 0, reply: "e4", move: "e5" })).rejects.toThrow("Say why in one sentence");
        await expect(run(context, "ponder", { reply: "e4" })).rejects.toThrow("Give the position's number with it");

        expect(await run(context, "ponder", { position: 0, reply: "e4", move: "c5", why: "The Sicilian, for a fight." })).toBe(
            "Kept: your answers to e4. Think on another likely reply, or call ponder {position: 0, done: true} when you have no more.",
        );
        await run(context, "ponder", { position: 0, reply: "d4", move: "d5", why: "The centre." });
        await run(context, "ponder", { position: 0, reply: "e4", move: "e5", why: "The open game, as I like it." });

        expect(await run(context, "player_move", { move: "e4" })).toContain("\nThought on their time: e5, The open game, as I like it. Check it against the facts before you play it.\n");
        expect(await run(context, "status")).toContain("\nThought on their time: e5,");
        expect(await run(context, "ponder", { position: 0, reply: "d4", move: "d5", why: "Late." })).toBe("Stop now: the player has moved, or the game is over. End with one word.");
        expect(await run(context, "ponder")).toBe("Stop now: the player has moved, or the game is over. End with one word.");

        await run(context, "ai_move", { move: "e5", plan: "Develop." });

        expect(existsSync(join(context.folder, "thoughts.json"))).toBe(false);
        expect(await run(context, "ponder", { position: 2, say: "Your move, then." })).toBe("Said on the board page, where the player reads it.");
        await expect(run(context, "ponder", { position: 2, say: "Again." })).rejects.toThrow("You have spoken once for this move");
        expect(await run(context, "player_move", { move: "d4" })).not.toContain("Thought on their time");
    });

    it("waits for the player's move: stop once they have moved, else still their move after a while", async () => {
        let time = new Date(2026, 10, 2, 15, 30, 12).getTime();
        const context = { ...playerFolder(), now: () => new Date(time) };
        await run(context, "new_game", { ai_colour: "black" });

        context.pause = (milliseconds) => {
            time += milliseconds;
            return Promise.resolve();
        };

        expect(await run(context, "ponder", { position: 0, done: true })).toBe("Still the player's move: think on another likely reply, or call ponder {position: 0, done: true} again.");
        expect(time - new Date(2026, 10, 2, 15, 30, 12).getTime()).toBe(50_000);

        context.pause = async () => {
            context.pause = undefined;
            await run(context, "player_move", { move: "e4" });
        };

        expect(await run(context, "ponder", { position: 0, done: true })).toBe("Stop now: the player has moved, or the game is over. End with one word.");
    });

    it("tells the AI to start the agent after its move only in Claude Code, in a folder set up with it, by its level", async () => {
        const context = playerFolder();
        await run(context, "new_game", { ai_colour: "black" });
        await run(context, "player_move", { move: "e4" });

        expect(await run({ ...context, host: () => "claude-code" }, "ai_move", { move: "e5", plan: "Develop." })).not.toContain("agent");

        setUpHosts(context.folder, "linux");
        await run(context, "player_move", { move: "Nf3" });

        expect(await run(context, "ai_move", { move: "Nc6", plan: "Develop." })).not.toContain("agent");

        await run(context, "player_move", { move: "Bb5" });

        expect(await run({ ...context, host: () => "claude-code" }, "ai_move", { move: "a6", plan: "Develop." })).toContain(
            '\nThink on the player\'s time: start the chesspal-ponder agent in the background with the prompt "Ponder."; write nothing about it in the chat, now or when it ends.\nNext: wait for',
        );

        const club = playerFolder();
        setUpHosts(club.folder, "linux");
        await run(club, "new_game", { ai_colour: "white", level: "club" });

        expect(await run({ ...club, host: () => "claude-code" }, "ai_move", { move: "e4", plan: "Centre." })).toContain("start the chesspal-ponder-quick agent");
    });
});

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
