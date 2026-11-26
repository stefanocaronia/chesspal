import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { gameInAnalysis } from "../src/games/index.ts";
import { agentFiles } from "../src/host-files/agents.ts";
import { opponentInstructions, tableHelperInstructions } from "../src/host-files/index.ts";
import { activeProfile, gameFolder, type PageSettings, saveProfileSettings } from "../src/profiles/index.ts";
import { chatInPage } from "../src/server/driven/index.ts";
import { call, cleanUp, drivenTable, type FakeChat, type FakeDriver, gate, opened, pause, posted, raw, until } from "./driven-fakes.ts";

afterEach(cleanUp);

const brought = '[White "Ann"]\n[Black "Bob"]\n\n1. e4 e5 2. Qh5 Nc6 *';

describe("the instructions of the chats the table opens", () => {
    it("tell the opponent that the table runs its helpers, and the helpers that the table hears them, leaving the agents' files as they are", () => {
        const own = opponentInstructions();
        const atTable = opponentInstructions(true);
        expect(atTable.split("\n")).toHaveLength(own.split("\n").length);
        expect(atTable).toContain("The table runs your helpers itself");
        expect(atTable).toContain("the table's analyst writes its review of a game not yet reviewed on the board page.");
        expect(atTable).not.toMatch(/spawn_agent|start the analyst agent|tells you to start an agent/);
        expect(own).toContain("spawn_agent");

        for (const role of ["ponder", "coach", "analyst"] as const) {
            expect(tableHelperInstructions(role)).not.toMatch(/started you|the AI you think for/);
        }

        expect(tableHelperInstructions("analyst")).toContain("Your last message goes to the opponent");
        expect(agentFiles("folder").map((file) => file.text).join("\n")).not.toMatch(/the table hears you|nobody reads/);
    });
});

describe("the opponent's helpers the table runs itself", () => {
    it("thinks on the player's time on the opponent's model, from its first move, a turn after each, and its thought reaches the opponent's next turn", async () => {
        const { table, home, ai } = await playing({ level: "strong" });
        ai.helpers.ponder = pondering("d4", "d5");
        const opponent = ai.chats[0]!;
        opponent.turns.push(async (client) => void opponent.answers.push(await call(client, "ai_move", { move: "e5", plan: "Centre." })));
        await posted(table.url, "/api/move", { move: "e4" });
        await until(() => helperOf(ai, "ponder")?.ends.includes("done") === true);
        const ponder = helperOf(ai, "ponder")!;

        expect(ponder.sent).toEqual(["Ponder."]);
        expect(ponder.options).toMatchObject({ model: `claude-${opponent.options.model}`, allowed: ["chesspal"] });
        expect(ponder.options.instructions).toContain("the table hears you through `ponder` alone");
        expect(ponder.options.instructions).not.toContain("started you");
        // The opponent hears of no agent: the table starts its own.
        expect(opponent.answers[0]!.text).not.toMatch(/agent/i);
        // Its done does not wait for the player's move at the table's place: its turn has ended before it.
        expect(ponder.calls).toEqual(["ponder", "ponder", "ponder"]);

        opponent.turns.push(async (client) => void (await call(client, "ai_move", { move: "d5", plan: "Centre." })));
        await posted(table.url, "/api/move", { move: "d4" });
        await until(() => opponent.sent.length === 4 && opponent.idle() && ponder.sent.length === 2);
        expect(opponent.sent[3]).toContain("Thought on their time by your model (legal, not checked): d5, The centre.");
        expect(settingsOf(home)).toMatchObject({ [chatInPage]: true });
    }, 30_000);

    it("thinks on the quick model at a low level, as the opponent's next turn says", async () => {
        const { table, ai } = await playing({ level: "club" });
        ai.helpers.ponder = pondering("d4", "d5");
        const opponent = ai.chats[0]!;
        opponent.turns.push(async (client) => void (await call(client, "ai_move", { move: "e5", plan: "Centre." })));
        await posted(table.url, "/api/move", { move: "e4" });
        await until(() => helperOf(ai, "ponder")?.ends.includes("done") === true);
        expect(helperOf(ai, "ponder")!.options.model).toBe("haiku");

        await posted(table.url, "/api/move", { move: "d4" });
        await until(() => opponent.sent.length >= 4);
        expect(opponent.sent[3]).toContain("Thought on their time by a quicker model (legal, not checked): d5, The centre.");
    }, 30_000);

    it("stops thinking at the player's move, and closes at the game's end; a new game gets a fresh one", async () => {
        const { table, ai } = await playing({ level: "strong" });
        const thinking = gate();
        ai.helpers.ponder = async () => await thinking.passed;
        const opponent = ai.chats[0]!;
        opponent.turns.push(async (client) => void (await call(client, "ai_move", { move: "e5", plan: "Centre." })));
        opponent.turns.push(async (client) => void (await call(client, "ai_move", { move: "Qh4", plan: "Mate." })));
        await posted(table.url, "/api/move", { move: "f3" });
        await until(() => helperOf(ai, "ponder")?.idle() === false);
        const ponder = helperOf(ai, "ponder")!;

        await posted(table.url, "/api/move", { move: "g4" });
        await until(() => ponder.ends.includes("interrupted"));
        // The AI's move that ends the game ends the thinking.
        await until(() => ponder.closed && opponent.idle());
        expect(ponder.closes).toEqual([true]);
        expect(ponder.sent).toEqual(["Ponder."]);

        thinking.open();
        const sentBefore = opponent.sent.length;
        await posted(table.url, "/api/new", { ai_colour: "black", level: "strong" });
        await until(() => (ai.chats.length > 1 || opponent.sent.length > sentBefore) && ai.chats.at(-1)!.idle());
        const next = ai.chats.at(-1)!;
        next.turns.push(async (client) => void (await call(client, "ai_move", { move: "e5", plan: "Centre." })));
        await posted(table.url, "/api/move", { move: "e4" });
        await until(() => ai.helperChats.filter((chat) => role(chat) === "ponder").length === 2);
    }, 30_000);

    it("coaches with the helps on alone, a turn after each AI move and at the player's move that ends the game, the latest asked, never stopped", async () => {
        const off = await playing({ level: "strong" });
        off.ai.chats[0]!.turns.push(async (client) => void (await call(client, "ai_move", { move: "e5", plan: "Centre." })));
        await posted(off.table.url, "/api/move", { move: "e4" });
        await until(() => off.ai.chats[0]!.sent.length === 3 && off.ai.chats[0]!.idle());
        await pause(100);
        expect(off.ai.helperChats.map(role)).toEqual(["ponder"]);

        const judging = gate();
        const { table, home, ai } = await playing({ level: "strong", helps: true, white: "f3" }, (driver) => {
            driver.helpers.coach = async (client) => {
                await judging.passed;
                await coaching(client);
            };
        });
        const opponent = ai.chats[0]!;
        await until(() => helperOf(ai, "coach")?.idle() === false);
        const coach = helperOf(ai, "coach")!;
        expect(coach.options.model).toBe(`claude-${opponent.options.model}`);

        // Asked again at the AI's move and at the player's that ends the game, the coach waits for its turn running, never stopped: the latest goes.
        opponent.turns.push(async (client) => void (await call(client, "ai_move", { move: "g4", plan: "Attack." })));
        await posted(table.url, "/api/move", { move: "e5" });
        await until(() => opponent.sent.length === 3 && opponent.idle());
        await posted(table.url, "/api/move", { move: "Qh4" });
        await until(() => opponent.sent.length === 4 && opponent.idle());
        expect(coach.ends).toEqual([]);

        judging.open();
        await until(() => coach.ends.length === 2 && coach.idle());
        expect(coach.ends).toEqual(["done", "done"]);
        expect(coach.sent).toEqual(["Coach.", "Coach."]);
        expect(readFileSync(archived(home), "utf8")).toMatch(/2\.\.\. Qh4# \{\[%badge best\]\s+\[%review\s+Well played\.\]\}/);
    }, 30_000);

    it("shows the coach's judgment on the page while the game goes on", async () => {
        const { table, ai } = await playing({ level: "strong", helps: true });
        ai.helpers.coach = coaching;
        const opponent = ai.chats[0]!;
        opponent.turns.push(async (client) => void (await call(client, "ai_move", { move: "e5", plan: "Centre." })));
        await posted(table.url, "/api/move", { move: "e4" });
        await until(() => helperOf(ai, "coach")?.ends.includes("done") === true);
        const { coach } = (await raw(table.url)).game as { coach: { judgments: { ply: number; badge: string; }[]; }; };
        expect(coach.judgments).toMatchObject([{ ply: 1, badge: "best" }]);
    }, 30_000);

    it("goes over a game brought to the page with no chat at the table, on the model the player chose, and lets it go at its end", async () => {
        const { table, home, ai } = await drivenTable();
        saveProfileSettings(home, activeProfile(home).id, { [chatInPage]: true, claudeModel: "sonnet" });
        const done = gate();
        ai.helpers.analyst = analysing(done, "The opening went wrong at Qh5.");
        const game = await study(table.url, { pgn: brought });

        await until(() => helperOf(ai, "analyst")?.calls.length === 1);
        const analyst = helperOf(ai, "analyst")!;
        expect(analyst.sent).toEqual([`Analyse ${game}. The player speaks English.`]);
        expect(analyst.options.model).toBe("sonnet");
        expect(analyst.options.instructions).toContain("Your last message goes to the opponent");
        expect(await analysisOf(table.url)).toMatchObject({ reviewing: true });
        expect(gameInAnalysis(gameFolder(home))?.analyst?.game).toBe(game);

        done.open();
        await until(() => analyst.closed);
        expect(await analysisOf(table.url)).toMatchObject({ incomplete: true });
        expect(gameInAnalysis(gameFolder(home))?.analyst).toBeUndefined();
        expect(ai.chats).toEqual([]);
    }, 30_000);

    it("goes over a game brought, or brought back, with the opponent at the table, which it does not ring for it, and rings it with its message at its end", async () => {
        const { table, ai } = await drivenTable();
        await opened(table.url);
        await until(() => ai.chats.length === 1 && ai.chats[0]!.idle());
        const opponent = ai.chats[0]!;
        const done = gate();
        ai.helpers.analyst = analysing(done, "The opening went wrong at Qh5.");
        const game = await study(table.url, { pgn: brought });

        await until(() => helperOf(ai, "analyst")?.calls.length === 1);
        expect(helperOf(ai, "analyst")!.options.model).toBe(`claude-${opponent.options.model}`);
        await pause(100);
        expect(opponent.sent).toHaveLength(1);

        done.open();
        await until(() => opponent.sent.length === 2 && opponent.idle());
        expect(opponent.sent[1]).toMatch(new RegExp(`^The analyst has gone over ${game}: The opening went wrong at Qh5\\. Go over it with the player\\.\\n`));

        // Brought back, as Rifai or Completa ask: another analyst takes it.
        ai.helpers.analyst = analysing(gate(), "");
        await study(table.url, { game, redo: true });
        await until(() => ai.helperChats.filter((chat) => role(chat) === "analyst").length === 2);
        expect(opponent.sent).toHaveLength(2);
    }, 30_000);

    it("has the analyst go over a game over when the opponent calls analyse_game on the player's yes, its own answer as before", async () => {
        const { table, ai } = await playing({ level: "strong" });
        ai.helpers.analyst = analysing(gate(), "");
        const opponent = ai.chats[0]!;
        opponent.turns.push(async (client) => void opponent.answers.push(await call(client, "ai_move", { move: "e5", plan: "Centre." })));
        opponent.turns.push(async (client) => void opponent.answers.push(await call(client, "ai_move", { move: "Qh4", plan: "Mate." })));
        await posted(table.url, "/api/move", { move: "f3" });
        await until(() => opponent.answers.length === 1 && opponent.idle());
        await posted(table.url, "/api/move", { move: "g4" });
        await until(() => opponent.answers.length === 2 && opponent.idle());
        expect(opponent.answers[1]!.text).toContain('call analyse_game {"game": "games/');
        expect(opponent.answers[1]!.text).not.toContain("spawn_agent");

        opponent.turns.push(async (client) => void opponent.answers.push(await call(client, "analyse_game")));
        await posted(table.url, "/api/message", { text: "Yes, go over it." });
        await until(() => opponent.answers.length === 3 && opponent.idle());
        expect(opponent.answers[2]!.isError).toBe(false);
        expect(opponent.answers[2]!.text).toContain("The table's analyst is writing its review of this game on the board page");
        await until(() => helperOf(ai, "analyst")?.sent[0]?.startsWith("Analyse games/") === true);
        expect(await analysisOf(table.url)).toMatchObject({ reviewing: true });
    }, 30_000);

    it("lets the page stop the analyst, take another game in its place, and closes it for a new game", async () => {
        const { table, ai } = await drivenTable();
        await opened(table.url);
        await until(() => ai.chats.length === 1 && ai.chats[0]!.idle());
        ai.helpers.analyst = analysing(gate(), "");
        const first = await study(table.url, { pgn: brought });
        await until(() => helperOf(ai, "analyst")?.calls.length === 1);
        const analyst = helperOf(ai, "analyst")!;

        expect((await posted(table.url, "/api/stop-analysis", { game: first })).status).toBe(200);
        await until(() => analyst.closed);
        expect(analyst.ends).toEqual(["interrupted"]);
        expect((await analysisOf(table.url))?.reviewing).toBeUndefined();

        const second = await study(table.url, { pgn: brought.replace("Qh5", "Nf3") });
        await until(() => analysts(ai).length === 2 && analysts(ai)[1]!.calls.length === 1);
        await study(table.url, { pgn: brought.replace("Qh5 Nc6", "Nf3 Nf6") });
        await until(() => analysts(ai).length === 3);
        expect(analysts(ai)[1]!.closed).toBe(true);
        expect(analysts(ai)[1]!.sent).toEqual([`Analyse ${second}. The player speaks English.`]);
        // The game it goes over, asked again, is still its own.
        const third = analysts(ai)[2]!.sent[0]!.split(" ")[1]!.replace(/\.$/, "");
        await study(table.url, { game: third, redo: true });
        await pause(100);
        expect(analysts(ai)).toHaveLength(3);

        await posted(table.url, "/api/new", { ai_colour: "black" });
        await until(() => analysts(ai)[2]!.closed);
    }, 30_000);

    it("starts the analyst on the model chosen in the page's window, when the chat at the table starts again for the game brought", async () => {
        const { table, home, ai } = await drivenTable();
        await opened(table.url);
        await until(() => ai.chats.length === 1 && ai.chats[0]!.idle());
        ai.helpers.analyst = analysing(gate(), "");
        await study(table.url, { pgn: brought, hold: true });
        await pause(100);
        expect(analysts(ai)).toEqual([]);

        saveProfileSettings(home, activeProfile(home).id, { [chatInPage]: true, claudeModel: "sonnet", claudeEffort: "high" });
        expect(await posted(table.url, "/api/table/restart", { host: "claude" })).toEqual({ status: 200, text: JSON.stringify({ restarting: true }) });
        await until(() => analysts(ai).length === 1);
        expect(analysts(ai)[0]!.options).toMatchObject({ model: "sonnet", effort: "high" });
    }, 30_000);

    it("goes on with the game when a helper fails, logs it, and opens it again at the next turn asked", async () => {
        const { table, ai } = await playing({ level: "strong" });
        ai.helpers.ponder = () => Promise.resolve("failed" as const);
        const opponent = ai.chats[0]!;
        opponent.turns.push(async (client) => void (await call(client, "ai_move", { move: "e5", plan: "Centre." })));
        await posted(table.url, "/api/move", { move: "e4" });
        await until(() => helperOf(ai, "ponder")?.closed === true);
        expect(ai.logged.some((line) => line.startsWith("helper ponder failed:"))).toBe(true);

        ai.helpers.ponder = pondering("Nf3", "Nc6");
        opponent.turns.push(async (client) => void (await call(client, "ai_move", { move: "Nf6", plan: "Develop." })));
        await posted(table.url, "/api/move", { move: "Nc3" });
        await until(() => ai.helperChats.filter((chat) => role(chat) === "ponder").length === 2 && opponent.idle());
        expect(opponent.sent).toHaveLength(4);
    }, 30_000);

    it("closes every helper gently as the table closes", async () => {
        const { table, ai } = await playing({ level: "strong", helps: true });
        let working = 0;

        const work = async (): Promise<void> => {
            working += 1;
            await gate().passed;
        };

        ai.helpers.ponder = work;
        ai.helpers.coach = work;
        const opponent = ai.chats[0]!;
        opponent.turns.push(async (client) => void (await call(client, "ai_move", { move: "e5", plan: "Centre." })));
        await posted(table.url, "/api/move", { move: "e4" });
        await until(() => working === 2);

        await table.close();
        expect(ai.helperChats.map((chat) => chat.closes)).toEqual([[true], [true]]);
        expect(ai.helperChats.map((chat) => chat.ends)).toEqual([["interrupted"], ["interrupted"]]);
    }, 30_000);
});

/**
 * A table whose chat plays a new game at `level`, Black, or White with its first move `white`, with the helps on when asked: its first turns done, the
 * helpers' fakes `set` before the game starts.
 */
async function playing(
    { level, helps = false, white }: { level: string; helps?: boolean; white?: string; },
    set: (driver: FakeDriver) => void = () => undefined,
): Promise<Awaited<ReturnType<typeof drivenTable>>>
{
    const driven = await drivenTable();
    saveProfileSettings(driven.home, activeProfile(driven.home).id, { [chatInPage]: true, ...(helps ? { helps: true } : {}) });
    set(driven.ai);
    await opened(driven.table.url);
    await until(() => driven.ai.chats.length === 1 && driven.ai.chats[0]!.idle());
    const opponent = driven.ai.chats[0]!;

    if (white !== undefined) {
        opponent.turns.push(async (client) => void (await call(client, "ai_move", { move: white, plan: "Open." })));
    }

    await posted(driven.table.url, "/api/new", { ai_colour: white === undefined ? "black" : "white", level });
    await until(() => driven.ai.chats[0]!.sent.length === 2 && driven.ai.chats[0]!.idle());
    return driven;
}

/** A helper that thinks on one reply, then is done. */
function pondering(reply: string, move: string): FakeDriver["helpers"]["ponder"]
{
    return async (client) => {
        const position = Number(/^Position (\d+)/.exec((await call(client, "ponder")).text)?.[1]);
        await call(client, "ponder", { position, reply, move, why: "The centre." });
        await call(client, "ponder", { position, done: true });
    };
}

/** What the coach does at each turn: judges the player's last move best, then is done. */
async function coaching(client: Client): Promise<void>
{
    const start = /^Game "(\w+)", position (\d+)/.exec((await call(client, "coach")).text);

    if (start === null) {
        return;
    }

    const at = { game: start[1], position: Number(start[2]) };
    await call(client, "coach", { ...at, badge: "best", note: "Well played." });
    await call(client, "coach", { ...at, ahead: 0 });
    await call(client, "coach", { ...at, done: true });
}

/** An analyst that reads the game it was asked for, waits at `done`, then writes `message` and ends. */
function analysing(done: { passed: Promise<void>; }, message: string): FakeDriver["helpers"]["analyst"]
{
    return async (client, prompt, chat) => {
        await call(client, "analyse_game", { game: prompt.split(" ")[1]!.replace(/\.$/, "") });
        await done.passed;
        chat.emit({ type: "text", block: 0, text: message });
    };
}

/** A game brought to the page to analyse: its name. */
async function study(url: string, body: object): Promise<string>
{
    const answer = await posted(url, "/api/study", body);
    return (JSON.parse(answer.text) as { game: string; }).game;
}

async function analysisOf(url: string): Promise<{ reviewing?: true; incomplete?: true; } | undefined>
{
    return (await raw(url)).analysis as { reviewing?: true; incomplete?: true; } | undefined;
}

function role(chat: FakeChat): string
{
    return basename(chat.options.folder);
}

function helperOf(ai: FakeDriver, name: string): FakeChat | undefined
{
    return ai.helperChats.findLast((chat) => role(chat) === name);
}

function analysts(ai: FakeDriver): FakeChat[]
{
    return ai.helperChats.filter((chat) => role(chat) === "analyst");
}

/** The one game in the archive. */
function archived(home: string): string
{
    const folder = join(gameFolder(home), "games");
    return join(folder, readdirSync(folder).find((name) => name.endsWith(".pgn"))!);
}

function settingsOf(home: string): PageSettings
{
    return JSON.parse(readFileSync(join(gameFolder(home), "settings.json"), "utf8")) as PageSettings;
}
