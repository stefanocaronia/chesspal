import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { commands } from "chesspal";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Context } from "../src/commands/context.ts";
import { saveChatStart, startAnalysis } from "../src/games/index.ts";
import { setUpHosts } from "../src/host-files/host-files.ts";
import { gameFolder } from "../src/profiles/index.ts";
import { createMcpServer } from "../src/server/mcp.ts";
import { testContext } from "./commands.ts";

const folders: string[] = [];

afterEach(() => {
    for (const folder of folders.splice(0)) {
        rmSync(folder, { recursive: true, force: true });
    }
});

const analystLine = 'start the chesspal-analyst agent in the background with the prompt "Analyse games/2026-11-02-153012.pgn. The player speaks <their language>.": it writes its review on the board page';

describe("the analyst agent, on the player's yes (D-89)", () => {
    it("is offered with the game's end in Claude Code, in a folder set up with it, and waits for the player's yes", async () => {
        const context = { ...claudeFolder(), language: "it-IT" };
        await mate(context);

        const ended = await run(context, "ai_move", { move: "Qh4", plan: "Mate." });
        expect(ended).toContain(`then offer them, in words, another game or to go over this one. To go over it, on their yes, ${analystLine}`);
        expect(ended).not.toContain("(analyse_game)");
        // Told the end in its words, the AI keeps the offer for the player's answer.
        expect(await run(context, "ai_say", { text: "Scacco matto!", mood: "happy" })).toContain(`\nNext: when the player wants this game gone over, ${analystLine}`);
        await run(context, "player_say", { text: "Sì, analizziamola" });
        expect(await run(context, "status")).toContain(`\nNext: answer the player with ai_say. To go over it, on their yes, ${analystLine}`);

        // Once the agent is at work, the offer is not made again (Federico), nor once it has reviewed the game, whatever the page opens since.
        // The chat goes over its review then, and never starts it again (Stefano, after Priya's playtest).
        // The game's name given as pgn, as haiku gives it, is that game (Priya).
        const analyst = { ...context, agent: "chesspal-analyst" };
        expect(await run(analyst, "analyse_game", { pgn: "games/2026-11-02-153012.pgn" })).toMatch(/^The player speaks Italian\.\nYou played Black/);
        const reviewed = "The analyst agent has gone over this game, or is at it: never start it again. When the player wants it gone over, go over it with them from what "
            + 'it told you, or, in a chat without it, from its review on the board page, which analyse_game {"game": "games/2026-11-02-153012.pgn"} gives.';
        const status = await run(context, "status");
        expect(status).not.toContain("chesspal-analyst");
        expect(status).toContain(`\nNext: answer the player with ai_say. ${reviewed}`);
        expect(status).toContain(`\nIn analysis on the board page: games/2026-11-02-153012.pgn. ${reviewed}`);
        expect(await run(context, "ai_say", { text: "Ci lavoro." })).toContain(`\nNext: ${reviewed} When they want another game,`);
        await run(analyst, "annotate_game", { game: "games/2026-11-02-153012.pgn", summary: "Corta." });
        startAnalysis(gameFolder(context.home()), "games/2026-11-01-100000.pgn", context.now());
        expect(await run(context, "status")).not.toContain("chesspal-analyst");
        // A second analyst started anyway stops at once.
        await expect(run(analyst, "analyse_game", { game: "games/2026-11-02-153012.pgn" })).rejects.toThrow("Stop now: this game has its review already.");

        // Without the agent, or in another host, the chat goes over it itself.
        const gemini = { ...playerFolder(), host: () => "gemini-cli-mcp-client" };
        setUpHosts(gemini.folder, "linux");
        await mate(gemini);
        expect(await run(gemini, "ai_move", { move: "Qh4", plan: "Mate." })).toContain("to go over this one (analyse_game). For another,");
    });

    it("goes over the game the player brought on the board page", async () => {
        const context = claudeFolder();
        await mate(context);
        await run(context, "ai_move", { move: "Qh4", plan: "Mate." });
        const [name] = readdirSync(join(gameFolder(context.home()), "games"));
        startAnalysis(gameFolder(context.home()), `games/${name!}`, context.now(), true);

        expect(await run(context, "status")).toContain(
            `\nThe player brought games/${name!} on the board page to analyse it. Next: start the chesspal-analyst agent in the background with the prompt "Analyse games/${name!}. The player speaks <their language>.":`,
        );
    });

    it("is offered when the game ends on the player's move or by a resignation", async () => {
        const context = claudeFolder();
        await run(context, "new_game", { ai_colour: "white" });
        await run(context, "ai_move", { move: "f3", plan: "Open." });
        await run(context, "player_move", { move: "e5" });
        await run(context, "ai_move", { move: "g4", plan: "Space." });
        expect(await run(context, "player_move", { move: "Qh4" })).toContain(`To go over it, on their yes, ${analystLine}`);

        const resigned = claudeFolder();
        await run(resigned, "new_game", { ai_colour: "black" });
        expect(await run(resigned, "end_game", { result: "player_resigns" })).toContain(`To go over it, on their yes, ${analystLine}`);
    });

    it("gets the player's language and no instructions from analyse_game, and leaves the player's words to the chat", async () => {
        const context = { ...claudeFolder(), language: "it-IT", told: new Set<string>() };
        await mate(context);
        await run(context, "ai_move", { move: "Qh4", plan: "Mate." });
        await run(context, "player_say", { text: "Bella partita" });
        const analyst = { ...context, agent: "chesspal-analyst" };

        const analysis = await run(analyst, "analyse_game");
        expect(analysis).toMatch(/^The player speaks Italian\.\nYou played Black at the /);
        expect(await run(analyst, "look")).not.toContain("Bella partita");
        expect(await run(analyst, "look", { move: "2..." })).not.toContain("Bella partita");
        // The game in analysis follows the board page: the agent names its game (Federico).
        await expect(run(analyst, "annotate_game", { summary: "Corta." })).rejects.toThrow("Give the game's name as game, as analyse_game named it");
        // The chat's analyse_game still says how to analyse, the first time in the chat.
        expect(await run(context, "analyse_game")).toMatch(/^The player asked you to analyse a game[\s\S]*\n- Each line of the analysis is a move/);
        expect(await run(context, "look")).toContain("«Bella partita»");
    });

    it("keeps two reviews written at once while the host is asked who writes them", async () => {
        const context = claudeFolder();
        await mate(context);
        await run(context, "ai_move", { move: "Qh4", plan: "Mate." });
        await run(context, "analyse_game");
        const slow: Context = { ...context, caller: () => new Promise((resolve) => setTimeout(() => resolve({ annotator: "claude-opus-5-5" }), 20)) };

        await Promise.all([run(slow, "annotate_game", { notes: [{ move: "2.", badge: "blunder" }] }), run(slow, "annotate_game", { summary: "Short and sharp." })]);
        const analysis = await run(context, "analyse_game");
        expect(analysis).toContain("2.g4: mate in one: Qh4#; you marked blunder");
        expect(analysis).toContain("Your review: Short and sharp.");
    });

    it("calls the tools it shares with the chat without counting as the chat that has read the game", async () => {
        const context: Context = { ...claudeFolder(), calls: vi.fn() };
        await mate(context);
        await run(context, "ai_move", { move: "Qh4", plan: "Mate." });
        const transcript = join(context.folder, "session.jsonl");
        const agents = join(context.folder, "session", "subagents");
        mkdirSync(agents, { recursive: true });
        writeFileSync(transcript, line("toolu_1") + "\n");
        writeFileSync(join(agents, "agent-a.jsonl"), line("toolu_2") + "\n");
        writeFileSync(join(agents, "agent-a.meta.json"), JSON.stringify({ agentType: "chesspal-analyst" }));
        saveChatStart(context.folder, { source: "startup", at: new Date().toISOString(), transcript });
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await createMcpServer(context).connect(serverTransport);
        const client = new Client({ name: "claude-code", version: "1.0.0" });
        await client.connect(clientTransport);
        context.seen = "before";

        const byAgent = await client.callTool({ name: "analyse_game", arguments: {}, _meta: { "claudecode/toolUseId": "toolu_2" } });
        // A language Chesspal does not know is the prompt's to give.
        expect(text(byAgent)).toMatch(/^You played Black at the /);
        expect(context.seen).toBe("before");
        expect(context.calls).not.toHaveBeenCalled();

        const byChat = await client.callTool({ name: "analyse_game", arguments: {}, _meta: { "claudecode/toolUseId": "toolu_1" } });
        expect(text(byChat)).toMatch(/^The player asked you to analyse a game/);
        expect(context.seen).not.toBe("before");
        expect(context.calls).toHaveBeenCalledTimes(1);
        await client.close();
    });
});

/** A folder set up for Claude Code, with its agents. */
function claudeFolder(): Context
{
    const context = { ...playerFolder(), host: () => "claude-code" };
    setUpHosts(context.folder, "linux");
    return context;
}

/** A game the AI mates in its next move, Qh4. */
async function mate(context: Context): Promise<void>
{
    await run(context, "new_game", { ai_colour: "black" });
    await run(context, "player_move", { move: "f3" });
    await run(context, "ai_move", { move: "e5", plan: "Centre." });
    await run(context, "player_move", { move: "g4" });
}

/** A line of Claude Code's transcript with the call of a tool. */
function line(call: string): string
{
    return JSON.stringify({ type: "assistant", message: { model: "claude-opus-5-5", content: [{ type: "tool_use", id: call, name: "mcp__chesspal__analyse_game" }] } });
}

function text(result: Awaited<ReturnType<Client["callTool"]>>): string
{
    return (result.content as { text: string; }[])[0]!.text;
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
