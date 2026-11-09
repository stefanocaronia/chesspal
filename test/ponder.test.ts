import { commands } from "chesspal";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Context } from "../src/commands/context.ts";
import { clockStarted } from "../src/core/index.ts";
import { loadGame, ponderingOn, saveGame, thoughtKey } from "../src/games/index.ts";
import { setUpHosts } from "../src/host-files/host-files.ts";
import { gameFolder } from "../src/profiles/index.ts";
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

        expect(await run(context, "player_move", { move: "e4" })).toContain("\nThought on their time by your model (legal, not checked): e5, The open game, as I like it.\n");
        expect(await run(context, "status")).toContain("\nThought on their time by your model (legal, not checked): e5,");
        expect(await run(context, "ponder", { position: 0, reply: "d4", move: "d5", why: "Late." })).toBe("Stop now: the player has moved, or the game is over. End with one word.");
        expect(await run(context, "ponder")).toBe("Stop now: the player has moved, or the game is over. End with one word.");

        await run(context, "ai_move", { move: "e5", plan: "Develop." });

        expect(await run(context, "ponder", { position: 2, say: "Your move, then." })).toBe("Said on the board page, where the player reads it.");
        await expect(run(context, "ponder", { position: 2, say: "Again." })).rejects.toThrow("You have spoken for this move already: say nothing more.");
        expect(await run(context, "player_move", { move: "d4" })).not.toContain("Thought on their time");
    });

    it("notes on disk that it thinks on a position, from its first look until it waits, for the page in whatever process it runs", async () => {
        let time = new Date(2026, 10, 2, 15, 30, 12).getTime();
        const context: Context = { ...playerFolder(), now: () => new Date(time) };
        await run(context, "new_game", { ai_colour: "black" });
        const folder = gameFolder(context.folder);
        const key = thoughtKey(loadGame(folder)!);

        expect(ponderingOn(folder, key)).toBe(false);
        await run(context, "ponder");
        await run(context, "ponder", { position: 0, reply: "e4", move: "e5", why: "The centre." });
        expect(ponderingOn(folder, key)).toBe(true);

        context.pause = (milliseconds) => {
            time += milliseconds;
            return Promise.resolve();
        };

        await run(context, "ponder", { position: 0, done: true });
        expect(ponderingOn(folder, key)).toBe(false);
        // Its thoughts stay, for its next move.
        expect(await run(context, "player_move", { move: "e4" })).toContain("Thought on their time by your model (legal, not checked): e5");
    });

    it("waits for the player's move: stop once they have moved, else still their move after a while", async () => {
        let time = new Date(2026, 10, 2, 15, 30, 12).getTime();
        const context = { ...playerFolder(), now: () => new Date(time) };
        await run(context, "new_game", { ai_colour: "black" });

        context.pause = (milliseconds) => {
            time += milliseconds;
            return Promise.resolve();
        };

        expect(await run(context, "ponder", { position: 0, done: true })).toBe("Still the player's move: call ponder {position: 0, done: true} again.");
        expect(time - new Date(2026, 10, 2, 15, 30, 12).getTime()).toBe(50_000);
        // Codex hands its agent's code back to the model after 30 seconds: a call there waits less, and stays one turn of it (Priya).
        context.host = () => "codex-mcp-client";
        await run(context, "ponder", { position: 0, done: true });
        expect(time - new Date(2026, 10, 2, 15, 30, 12).getTime()).toBe(75_000);
        context.host = undefined;

        context.pause = async () => {
            context.pause = undefined;
            await run(context, "player_move", { move: "e4" });
        };

        expect(await run(context, "ponder", { position: 0, done: true })).toBe("Stop now: the player has moved, or the game is over. End with one word.");
    });

    it("tells the AI to start the agent after its move only in Claude Code and Codex, in a folder set up with it, by its level", async () => {
        const context = playerFolder();
        await run(context, "new_game", { ai_colour: "black" });
        await run(context, "player_move", { move: "e4" });

        expect(await run({ ...context, host: () => "claude-code" }, "ai_move", { move: "e5", plan: "Develop." })).not.toContain("agent");

        setUpHosts(context.folder, "linux");
        await run(context, "player_move", { move: "Nf3" });

        expect(await run(context, "ai_move", { move: "Nc6", plan: "Develop." })).not.toContain("agent");

        await run(context, "player_move", { move: "Bb5" });

        expect(await run({ ...context, host: () => "claude-code" }, "ai_move", { move: "a6", plan: "Develop." })).toContain(
            '\nThink on the player\'s time: start the chesspal-ponder agent in the background with the prompt "Ponder."; start it even when an agent of the move before '
                + "has just ended, and write nothing about it in the chat, now or when it ends.\nNext: wait for",
        );

        const club = playerFolder();
        setUpHosts(club.folder, "linux");
        await run(club, "new_game", { ai_colour: "white", level: "club" });

        expect(await run({ ...club, host: () => "claude-code" }, "ai_move", { move: "e4", plan: "Centre." })).toContain("start the chesspal-ponder-quick agent");
        await run(club, "ponder", { position: 1, reply: "e5", move: "Nf3", why: "Development." });

        expect(await run(club, "player_move", { move: "e5" })).toContain("\nThought on their time by a quicker model (legal, not checked): Nf3, Development.\n");

        // Codex starts its own agents, which init writes for it too (D-98).
        const codex = playerFolder();
        setUpHosts(codex.folder, "linux");
        await run(codex, "new_game", { ai_colour: "white", level: "club" });

        expect(await run({ ...codex, host: () => "codex-mcp-client" }, "ai_move", { move: "e4", plan: "Centre." })).toContain("start the chesspal-ponder-quick agent");

        const mated = playerFolder();
        setUpHosts(mated.folder, "linux");
        await run(mated, "new_game", { ai_colour: "black" });
        await run(mated, "player_move", { move: "f3" });
        await run({ ...mated, host: () => "claude-code" }, "ai_move", { move: "e5", plan: "Centre." });
        await run(mated, "player_move", { move: "g4" });

        expect(await run({ ...mated, host: () => "claude-code" }, "ai_move", { move: "Qh4", plan: "Mate." })).not.toContain("chesspal-ponder");
    });

    it("is the agent's alone, offered to the hosts that run it, one thing a call", async () => {
        const command = commands.find((each) => each.name === "ponder");
        const context = playerFolder();
        await run(context, "new_game", { ai_colour: "black" });

        expect(command?.byAgents).toEqual(["chesspal-ponder-quick", "chesspal-ponder"]);
        expect(command?.hosts).toEqual(["claude-code", "codex-mcp-client"]);
        await expect(run(context, "ponder", { position: 0, reply: "e4", say: "Hello." })).rejects.toThrow("One thing a call");
        await expect(run(context, "ponder", { position: 0, done: true, reply: "e4" })).rejects.toThrow("One thing a call");
        await expect(run(context, "ponder", { position: 0, reply: "e4", why: "No move." })).rejects.toThrow("Give your move with its why");
    });

    it("keeps eight answers at most, one a reply, and reads past a thoughts file it cannot read", async () => {
        const context = playerFolder();
        await run(context, "new_game", { ai_colour: "black" });

        for (const reply of ["e4", "d4", "c4", "Nf3", "g3", "b3", "f4", "Nc3"]) {
            await run(context, "ponder", { position: 0, reply, move: "Nf6", why: "Flexible." });
        }

        expect(await run(context, "ponder", { position: 0, reply: "e4", move: "e5", why: "Open." })).toContain("Kept: your answers to d4, c4, Nf3, g3, b3, f4, Nc3, e4.");
        await expect(run(context, "ponder", { position: 0, reply: "a3", move: "e5", why: "Centre." })).rejects.toThrow("You have 8 thoughts for this position already");

        writeFileSync(join(gameFolder(context.home()), "thoughts.json"), "{ broken");

        expect(await run(context, "player_move", { move: "e4" })).not.toContain("Thought on their time");
    });

    it("leaves a flag fallen to the page and the chat, so that the doorbell rings it", async () => {
        let time = new Date(2026, 10, 2, 15, 30, 12).getTime();
        const start = time;
        const context = { ...playerFolder(), now: () => new Date(time) };
        await run(context, "new_game", { ai_colour: "black", clock: "1+0" });
        const waiting = loadGame(gameFolder(context.home()))!;
        saveGame(gameFolder(context.home()), { ...waiting, clock: clockStarted(waiting.clock!, new Date(start)) });

        context.pause = (milliseconds) => {
            time += milliseconds;
            return Promise.resolve();
        };

        expect(await run(context, "ponder", { position: 0, done: true })).toMatch(/^Still the player's move/);
        expect(await run(context, "ponder", { position: 0, done: true })).toBe("Stop now: the player has moved, or the game is over. End with one word.");
        expect(time - start).toBe(60_000);
        expect(loadGame(gameFolder(context.home()))?.game.record.tags.Termination).toBeUndefined();
        expect(await run(context, "status")).toContain("lost on time");
    });

    it("stops waiting after ten minutes in all, its answers kept", async () => {
        let time = new Date(2026, 10, 2, 15, 30, 12).getTime();
        const start = time;
        const context = { ...playerFolder(), now: () => new Date(time) };
        await run(context, "new_game", { ai_colour: "black" });
        await run(context, "ponder", { position: 0, reply: "e4", move: "e5", why: "Open." });

        context.pause = (milliseconds) => {
            time += milliseconds;
            return Promise.resolve();
        };

        const answers: string[] = [];

        do {
            answers.push(await run(context, "ponder", { position: 0, done: true }));
        } while (answers.at(-1)?.startsWith("Still") === true);

        expect(answers.at(-1)).toBe("Stop now: you have waited long enough, and your answers are kept. End with one word.");
        expect(time - start).toBe(600_000);
        expect(JSON.parse(readFileSync(join(gameFolder(context.home()), "thoughts.json"), "utf8"))).toMatchObject({ thoughts: [{ reply: "e4", move: "e5" }] });
    });

    it("lets the agent speak first, of what happened, and leaves the chat its answer to the player (D-72)", async () => {
        const context = playerFolder();
        await run(context, "new_game", { ai_colour: "black" });
        await run(context, "player_move", { move: "e4" });
        await run(context, "ai_move", { move: "e5", plan: "Develop.", comment: "The open game, then.", mood: "happy" });

        expect(await run(context, "ponder")).toMatch(/\nYour plan: Develop\.\nYour mood: happy\.\nYou said with your move: «The open game, then\.»\n/);

        await run(context, "player_say", { text: "Why e5?" });

        await expect(run(context, "ponder", { position: 2, say: "A classic." })).rejects.toThrow("the AI in the chat answers them");

        await run(context, "ai_say", { text: "Because I like it." });
        await run(context, "player_move", { move: "Nf3" });
        await run(context, "ai_move", { move: "Nc6", plan: "Develop." });

        expect(await run(context, "ponder")).toContain("\nYou said nothing with your move.\n");

        await run(context, "ponder", { position: 4, say: "Two knights out." });

        await expect(run(context, "ai_say", { text: "Your move." })).rejects.toThrow("speak again only to answer them");

        await run(context, "player_say", { text: "Nervous?" });
        await run(context, "ai_say", { text: "Not yet." });
        await run(context, "player_say", { text: "Sure?" });

        await expect(run(context, "ai_say", { text: "Sure." })).rejects.toThrow("You have spoken once for this move");
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
