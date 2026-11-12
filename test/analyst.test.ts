import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { commands } from "chesspal";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Context } from "../src/commands/registry/context.ts";
import { saveChatStart, startAnalysis } from "../src/games/index.ts";
import { setUpHosts } from "../src/host-files/host-files.ts";
import { gameFolder } from "../src/profiles/index.ts";
import { createMcpServer } from "../src/server/mcp/mcp.ts";
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
        // The chat goes over its review then, and doesn't start it for that review (Stefano, after Priya's playtest).
        // The game's name given as pgn, as haiku gives it, is that game (Priya).
        const analyst = { ...context, agent: "chesspal-analyst", agentRun: "agent-a" };
        expect(await run(analyst, "analyse_game", { pgn: "games/2026-11-02-153012.pgn" })).toMatch(/^The player speaks Italian\.\nYou played Black/);
        const reviewed = "The analyst agent has gone over this game, or is at it: don't start it for this review. When the player wants it gone over, go over it with them from what "
            + 'it told you, or, in a chat without it, from its review on the board page, which analyse_game {"game": "games/2026-11-02-153012.pgn"} gives.';
        const status = await run(context, "status");
        expect(status).not.toContain("chesspal-analyst");
        expect(status).toContain(`\nNext: answer the player with ai_say. ${reviewed}`);
        expect(status).toContain(`\nIn analysis on the board page: games/2026-11-02-153012.pgn (no review yet). ${reviewed}`);
        expect(await run(context, "ai_say", { text: "Ci lavoro." })).toContain(`\nNext: ${reviewed} When they want another game,`);
        await run(analyst, "annotate_game", { game: "games/2026-11-02-153012.pgn", summary: "Corta." });
        startAnalysis(gameFolder(context.home()), "games/2026-11-01-100000.pgn", context.now());
        expect(await run(context, "status")).not.toContain('"Analyse games/2026-11-02-153012.pgn.');
        // A second analyst started anyway stops at once.
        await expect(run({ ...analyst, agentRun: "agent-b" }, "analyse_game", { game: "games/2026-11-02-153012.pgn" })).rejects.toThrow("Stop now: this game has its review already.");

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
        startAnalysis(gameFolder(context.home()), `games/${name!}`, context.now(), { brought: true });

        expect(await run(context, "status")).toContain(
            `\nThe player brought games/${name!} on the board page to analyse it. Next: start the chesspal-analyst agent in the background with the prompt "Analyse games/${name!}. The player speaks <their language>.":`,
        );
    });

    it("is started again when the player has the game just over analysed again on the page, its review deleted", async () => {
        const context = claudeFolder();
        await mate(context);
        await run(context, "ai_move", { move: "Qh4", plan: "Mate." });
        const game = "games/2026-11-02-153012.pgn";
        const analyst = { ...context, agent: "chesspal-analyst", agentRun: "agent-first" };
        await run(analyst, "analyse_game", { game });
        await run(analyst, "annotate_game", { game, summary: "Corta." });
        expect(await run(context, "status")).toContain("don't start it for this review");

        // The page's «Analyse again»: the review deleted, the game brought back for a new review, which the chat starts without asking (Priya).
        await run(context, "delete_review", { game });
        startAnalysis(gameFolder(context.home()), game, context.now(), { brought: true, redo: true });
        const status = await run(context, "status");
        expect(status).toContain(
            `\nThe player asked on the board page for a new review of ${game}. Next, at once, even if an analyst was stopped before: start the chesspal-analyst agent`,
        );
        // The chat that remembers the old review leaves the new one to the analyst.
        expect(status).toContain("from what it tells you. The new review replaces the old one: correct a note with annotate_game only when the player shows it wrong.");
        expect(status).not.toContain("don't start it for this review");
        expect(await run({ ...analyst, agentRun: "agent-second" }, "analyse_game", { game })).toMatch(/^You played Black/);
    });

    it("stops a second analyst started on a game another is reviewing, and lets the first call again", async () => {
        const context = claudeFolder();
        await mate(context);
        await run(context, "ai_move", { move: "Qh4", plan: "Mate." });
        const game = "games/2026-11-02-153012.pgn";
        const first = { ...context, agent: "chesspal-analyst", agentRun: "agent-first" };
        const second = { ...first, agentRun: "agent-second" };

        await run(first, "analyse_game");
        await expect(run(second, "analyse_game", { game })).rejects.toThrow("Stop now: another analyst is reviewing this game.");
        await run(first, "annotate_game", { game, notes: [{ move: "2.", badge: "blunder" }] });
        // The page opening the game meanwhile leaves it to the first, which may read it again with its review half written.
        startAnalysis(gameFolder(context.home()), game, context.now(), { brought: true });
        await expect(run(second, "analyse_game", { game })).rejects.toThrow("Stop now: another analyst is reviewing this game.");
        expect(await run(first, "analyse_game", { game })).toContain("you marked blunder");
        await run(first, "annotate_game", { game, summary: "Corta." });
        expect(await run(first, "analyse_game", { game })).toContain("Your review: Corta.");
        await expect(run(second, "analyse_game", { game })).rejects.toThrow("Stop now: this game has its review already.");
        // The chat goes over the game whoever reviews it.
        expect(await run(context, "analyse_game", { game })).toContain("Your review: Corta.");
    });

    it("lets another analyst take a game whose analyst went with its chat, not with a summary of it", async () => {
        const context = claudeFolder();
        await mate(context);
        await run(context, "ai_move", { move: "Qh4", plan: "Mate." });
        const game = "games/2026-11-02-153012.pgn";
        const first = { ...context, agent: "chesspal-analyst", agentRun: "agent-first" };
        const second = { ...first, agentRun: "agent-second" };
        await run(first, "analyse_game", { game });

        const later = (minutes: number): string => new Date(context.now().getTime() + minutes * 60_000).toISOString();
        saveChatStart(context.folder, { source: "compact", at: later(1) });
        await expect(run(second, "analyse_game", { game })).rejects.toThrow("Stop now: another analyst is reviewing this game.");
        saveChatStart(context.folder, { source: "resume", at: later(2) });
        expect(await run(second, "analyse_game", { game })).toMatch(/^You played Black/);
    });

    it("keeps a game to its analyst while the page opens another and comes back to it", async () => {
        const context = claudeFolder();
        await mate(context);
        await run(context, "ai_move", { move: "Qh4", plan: "Mate." });
        const game = "games/2026-11-02-153012.pgn";
        const first = { ...context, agent: "chesspal-analyst", agentRun: "agent-first" };
        await run(first, "analyse_game", { game });
        const folder = gameFolder(context.home());
        startAnalysis(folder, "study/2026-11-01-100000.pgn", context.now(), { brought: true });
        startAnalysis(folder, game, context.now(), { brought: true });

        const status = await run(context, "status");
        expect(status).not.toContain("Next: start the chesspal-analyst agent");
        expect(status).toContain(`In analysis on the board page: ${game}. The analyst agent has gone over this game, or is at it`);
        await expect(run({ ...first, agentRun: "agent-second" }, "analyse_game", { game })).rejects.toThrow("Stop now: another analyst is reviewing this game.");
    });

    it("offers the analyst again once the review alone is deleted, whichever game the page shows, and stops the old analyst's notes", async () => {
        const context = claudeFolder();
        await mate(context);
        await run(context, "ai_move", { move: "Qh4", plan: "Mate." });
        const game = "games/2026-11-02-153012.pgn";
        const first = { ...context, agent: "chesspal-analyst", agentRun: "agent-first" };
        const second = { ...first, agentRun: "agent-second" };
        await run(first, "analyse_game", { game });
        await run(first, "annotate_game", { game, notes: [{ move: "2.", badge: "blunder" }] });

        // «Delete the analysis» alone, on the game shown: the analyst is offered again, on the player's word.
        await run(context, "delete_review", { game });
        const status = await run(context, "status");
        expect(status).toContain(`In analysis on the board page: ${game} (no review yet). When the player wants it gone over, start the chesspal-analyst agent`);
        expect(status).not.toContain("don't start it for this review");
        await run(second, "analyse_game", { game });
        await expect(run(first, "annotate_game", { game, notes: [{ move: "2.", badge: "mistake" }] })).rejects.toThrow("Stop now: another analyst is reviewing this game.");

        // While the page shows another game, the deletion lets the analyst go too.
        startAnalysis(gameFolder(context.home()), "study/2026-11-01-100000.pgn", context.now(), { brought: true });
        await run(context, "delete_review", { game });
        expect(await run(first, "analyse_game", { game })).toMatch(/^You played Black/);
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
        await run(resigned, "player_move", { move: "e4" });
        expect(await run(resigned, "end_game", { result: "player_resigns" })).toContain(`To go over it, on their yes, ${analystLine}`);

        // A game closed before any move has nothing to go over.
        const empty = claudeFolder();
        await run(empty, "new_game", { ai_colour: "black" });
        expect(await run(empty, "end_game", { result: "player_resigns" })).not.toContain("chesspal-analyst");
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

    it("tells the agent who the player is, as status tells the chat, to write for their level (D-66)", async () => {
        const context = { ...claudeFolder(), language: "it-IT" };
        await run(context, "new_profile", { name: "Anna", level: "regular" });
        await mate(context);
        await run(context, "ai_move", { move: "Qh4", plan: "Mate." });

        expect(await run({ ...context, agent: "chesspal-analyst" }, "analyse_game")).toMatch(/^The player speaks Italian\.\nPlayer: Anna, plays often\.\nYou played Black /);
        // The chat reads it in status.
        expect(await run(context, "analyse_game")).not.toContain("Player: Anna");
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

    it("leaves the note the chat corrected with the player while it went over the game, until its review is deleted (D-101)", async () => {
        const context = claudeFolder();
        await mate(context);
        await run(context, "ai_move", { move: "Qh4", plan: "Mate." });
        const [name] = readdirSync(join(gameFolder(context.home()), "games"));
        const game = `games/${name!}`;
        const analyst = { ...context, agent: "chesspal-analyst" };
        await run(analyst, "analyse_game", { game });

        // A caller the host does not tie to the chat corrects nothing; the chat's correction is not asked for the analyst's work.
        expect(await run(context, "annotate_game", { game, notes: [{ move: "1.", badge: "good" }] })).toMatch(new RegExp(`^Kept in ${game}: 1 move marked\\.`));
        const corrected = await run({ ...context, chat: true }, "annotate_game", { game, notes: [{ move: "2.", badge: "blunder", note: "Opens the king to Qh4." }] });
        expect(corrected).toBe(`Kept in ${game}: 1 move marked. The board page shows them.`);

        const review = await run(analyst, "annotate_game", { game, notes: [{ move: "1.", badge: "inaccuracy", note: "Weakens e1-h4." }, { move: "2.", badge: "mistake" }] });
        expect(review).toMatch(new RegExp(`^Kept in ${game}: 1 move marked\\. The board page shows them\\.\\n2\\. keeps the note the AI wrote with the player: leave it, and don't contradict it in your summary\\.`));
        expect(await run(analyst, "annotate_game", { game, notes: [{ move: "2.", badge: "good" }] })).toMatch(new RegExp(`^Nothing new kept in ${game}\\.\\n2\\. keeps the note`));
        // The chat sees how far the review has got, the book's bare badges aside.
        expect(await run(context, "status")).toContain(`In analysis on the board page: ${game} (its review so far: notes on 2 moves, who is ahead after 0 of 4)`);
        // Told at each call, its summary too.
        expect(await run(analyst, "annotate_game", { game, summary: "Short." })).toContain("2. keeps the note the AI wrote with the player: leave it, and don't contradict it in your summary; if this one does, give it again.");
        expect(await run(context, "analyse_game", { game })).toContain('2.g4: mate in one: Qh4#; you marked blunder: "Opens the king to Qh4."');

        // A correction with who is ahead is a correction too; after the word on the game, the chat hears it stays as written.
        expect(await run({ ...context, chat: true }, "annotate_game", { game, notes: [{ move: "1...", note: "Frees the queen." }], ahead: { "1...": "-1" } })).toBe(
            `Kept in ${game}: 1 move marked and who is ahead after 1 move. The board page shows them.\nThe review's word on the game stays as written: if it says otherwise, give summary again.`,
        );
        expect(await run(analyst, "annotate_game", { game, notes: [{ move: "1...", badge: "good" }] })).toContain("2. 1... keep the notes the AI wrote with the player");
        // The word on the game is not the end of the review while who is ahead is missing.
        expect(await run(context, "status")).toContain(`(its review so far: notes on 3 moves, who is ahead after 1 of 4, its word on the game written)`);
        await run(analyst, "annotate_game", { game, ahead: { "1.": 0, "2.": "-2" } });
        expect(await run(context, "status")).toContain(`${game} (its review is done)`);

        // A review deleted is written again whole.
        await run(context, "delete_review", { game });
        await run(analyst, "analyse_game", { game });
        expect(await run(analyst, "annotate_game", { game, notes: [{ move: "2.", badge: "mistake" }] })).not.toContain("keeps the note");
    });

    it("is offered by look and position once the review is deleted, since the deletion rings no doorbell", async () => {
        const context = { ...claudeFolder(), told: new Set<string>() };
        await mate(context);
        await run(context, "ai_move", { move: "Qh4", plan: "Mate." });
        const game = "games/2026-11-02-153012.pgn";
        const analyst = { ...context, agent: "chesspal-analyst", agentRun: "agent-first" };
        await run(analyst, "analyse_game", { game });
        expect(await run(context, "look", { move: "2." })).not.toContain("chesspal-analyst");
        await run(analyst, "annotate_game", { game, summary: "Short." });
        expect(await run(context, "position", { move: "2." })).not.toContain("chesspal-analyst");

        await run(context, "delete_review", { game });
        const offer = `\n${game} has no review. When the player wants it gone over, start the chesspal-analyst agent in the background with the prompt "Analyse ${game}.`;
        expect(await run(analyst, "look", { move: "2." })).not.toContain("chesspal-analyst");
        expect(await run(context, "look", { move: "2." })).toContain(offer);
        // Once a change of the analysis: told again after the next.
        expect(await run(context, "position", {})).not.toContain("chesspal-analyst");
        const later = { ...context, now: () => new Date(context.now().getTime() + 60_000) };
        await run(later, "delete_review", { game });
        expect(await run(later, "position", {})).toContain(offer);
        // Not while an analyst is at it.
        await run({ ...analyst, agentRun: "agent-second", now: () => new Date(context.now().getTime() + 120_000) }, "analyse_game", { game });
        expect(await run(context, "look", {})).not.toContain("chesspal-analyst");
    });

    it("is started in Codex with spawn_agent, which the line names", async () => {
        const context = { ...playerFolder(), host: () => "codex-mcp-client" };
        setUpHosts(context.folder, "linux");
        await mate(context);
        const spawn = 'start the chesspal-analyst agent with spawn_agent {"agent_type": "chesspal-analyst", "message": "Analyse games/2026-11-02-153012.pgn. The player '
            + 'speaks <their language>.", "fork_turns": "none"}: it writes its review on the board page';

        expect(await run(context, "ai_move", { move: "Qh4", plan: "Mate." })).toContain(`To go over it, on their yes, ${spawn}`);
        expect(await run(context, "ai_say", { text: "Mate!" })).toContain(`\nNext: when the player wants this game gone over, ${spawn}`);
        startAnalysis(gameFolder(context.home()), "games/2026-11-02-153012.pgn", context.now(), { brought: true });
        expect(await run(context, "status")).toContain(`on the board page to analyse it. Next: ${spawn}`);
    });

    it("ends the review of a resigned game only with who is ahead after its last move", async () => {
        const context = claudeFolder();
        await run(context, "new_game", { ai_colour: "black" });
        await run(context, "player_move", { move: "e4" });
        await run(context, "ai_move", { move: "e5", plan: "Centre." });
        await run(context, "end_game", { result: "player_resigns" });
        const game = "games/2026-11-02-153012.pgn";
        const analyst = { ...context, agent: "chesspal-analyst" };
        await run(analyst, "analyse_game", { game });

        await run(analyst, "annotate_game", { game, summary: "Short.", ahead: { "1.": 0 } });
        expect(await run(context, "status")).toContain(`${game} (its review so far: notes on 0 moves, who is ahead after 1 of 2, its word on the game written)`);
        await run(analyst, "annotate_game", { game, ahead: { "1...": 0 } });
        expect(await run(context, "status")).toContain(`${game} (its review is done)`);
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
