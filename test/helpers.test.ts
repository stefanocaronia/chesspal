import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { analysisStopped, anotherAnalyst } from "../src/commands/answers/index.ts";
import type { TableHelpers } from "../src/commands/index.ts";
import { gameInAnalysis, loadGame, notePondering, thoughtKey } from "../src/games/index.ts";
import { tableFolder } from "../src/home/index.ts";
import { agentFiles } from "../src/host-files/agents.ts";
import { atTableInstructions, instructionsFile, opponentInstructions, tableHelperInstructions } from "../src/host-files/index.ts";
import { activeProfile, gameFolder, type PageSettings, saveProfileSettings } from "../src/profiles/index.ts";
import { doorVariable, keyVariable } from "../src/server/door/index.ts";
import { chatInPage } from "../src/server/driven/index.ts";
import { testContext } from "./commands.ts";
import { call, cleanUp, drivenTable, type FakeChat, type FakeDriver, fakeDriver, gate, movingContext, opened, pageListening, pause, posted, raw, shown, temporary, until } from "./driven-fakes.ts";

afterEach(cleanUp);

const brought = '[White "Ann"]\n[Black "Bob"]\n\n1. e4 e5 2. Qh5 Nc6 *';

describe("the instructions of the chats the table opens", () => {
    it("tell the opponent that the table runs its helpers and that the player is on the page, and the helpers that the table hears them", () => {
        const own = opponentInstructions();
        const atTable = opponentInstructions(true);
        expect(atTable.split("\n")).toHaveLength(own.split("\n").length);
        expect(atTable).toContain(
            "a game over, the table's analyst reviews it there when the player wants it, as Chesspal's answers say. Never start an agent, and write nothing in the chat about the one that thinks or the coach.",
        );
        expect(atTable).toContain("in front of the player");
        expect(atTable).toContain("the page's message box");
        expect(atTable).toContain("add `review: true`");
        expect(atTable).not.toMatch(/spawn_agent|start the analyst agent|tells you to start an agent|in the chat, in the chat|ask them in the chat|in the player's browser/);
        expect(own).toContain("spawn_agent");

        for (const role of ["ponder", "coach", "analyst"] as const) {
            const text = tableHelperInstructions(role);
            expect(text).not.toMatch(/started you|the AI you think for|are not for you|and again while it says/);
        }

        // A chat of the table's lives one turn: nothing tells it of turns before.
        expect(tableHelperInstructions("ponder")).not.toMatch(/start again|new position/);
        expect(tableHelperInstructions("coach")).not.toMatch(/start again|new move to judge/);
        expect(tableHelperInstructions("analyst")).toContain("Your last message goes to the opponent");
        expect(tableHelperInstructions("analyst")).toContain(instructionsFile("analysis"));
        expect(agentFiles("folder").map((file) => file.text).join("\n")).not.toMatch(/the table hears you|nobody reads/);
    });

    it("give the opponent at the table the analyst's lines without the review to write, which the table's analyst writes", () => {
        const own = instructionsFile("analyst");
        const atTable = atTableInstructions("analyst");
        expect(atTable.split("\n")).toHaveLength(own.split("\n").length);
        expect(atTable).toContain("the table's analyst writes the review: never write one yourself");
        expect(atTable).toContain("give `annotate_game` only the moves, or the word, that change");
        expect(atTable).not.toContain("keep your review there");
    });

    it("say the analyst's refusals at the table without an AI that started it", () => {
        const helpers: TableHelpers = { runs: () => true, analysing: () => undefined, analyse: () => false };
        const context = { ...testContext(temporary()), helpers };
        expect(anotherAnalyst(context)).not.toMatch(/started you/);
        expect(analysisStopped("games/a.pgn", context)).not.toMatch(/started it/);
        expect(anotherAnalyst(testContext(temporary()))).toMatch(/started you/);
    });
});

describe("the opponent's helpers the table runs itself", () => {
    it("gives the opponent its table's instructions through the command, and thinks on the player's time on the model it was opened with", async () => {
        const instructions: string[] = [];
        const { table, home, ai } = await playing({ level: "strong", model: "sonnet", effort: "high" }, (driver) => {
            driver.first = async (client) => void instructions.push((await call(client, "instructions")).text);
        });
        expect(instructions[0]).toContain("The table runs your helpers itself");
        expect(instructions[0]).toContain("the page's message box");

        ai.helpers.ponder = pondering("d4", "d5");
        const opponent = ai.chats[0]!;
        opponent.turns.push(async (client) => void opponent.answers.push(await call(client, "ai_move", { move: "e5", plan: "Centre." })));
        await posted(table.url, "/api/move", { move: "e4" });
        await until(() => helperOf(ai, "ponder")?.ends.includes("done") === true);
        const ponder = helperOf(ai, "ponder")!;

        // In Claude Code its turn's message is the word alone: ponder {} gives it the position.
        expect(ponder.sent).toEqual(["Ponder."]);
        // What the opponent was opened with, not the name its host gives the model.
        expect(ponder.options).toMatchObject({ model: "sonnet", effort: "high", allowed: ["chesspal"] });
        expect(ponder.options.instructions).toContain("the table hears you through `ponder` alone");
        expect(opponent.answers[0]!.text).not.toMatch(/agent/i);
        expect(ponder.calls).toEqual(["ponder", "ponder", "ponder"]);

        opponent.turns.push(async (client) => void (await call(client, "ai_move", { move: "d5", plan: "Centre." })));
        await posted(table.url, "/api/move", { move: "d4" });
        await until(() => opponent.sent.length === 4 && opponent.idle() && turnsOf(ai, "ponder").length === 2);
        expect(opponent.sent[3]).toContain("Thought on their time by your model (legal, not checked): d5, The centre.");
        // Each turn on a chat of its own, the one before closed.
        expect(turnsOf(ai, "ponder").map((chat) => chat.sent.map(firstLine))).toEqual([["Ponder."], ["Ponder."]]);
        expect(ponder.closed).toBe(true);
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

    it("runs the helpers of a chat in Codex on Codex: the one that thinks on Codex's quick model at low effort at a low level, told its tool's name", async () => {
        const { table, ai } = await playing({ level: "club", host: "codex" });
        ai.helpers.ponder = pondering("d4", "d5");
        const opponent = ai.chats[0]!;
        opponent.turns.push(async (client) => void (await call(client, "ai_move", { move: "e5", plan: "Centre." })));
        await posted(table.url, "/api/move", { move: "e4" });
        await until(() => helperOf(ai, "ponder")?.ends.includes("done") === true);
        const ponder = helperOf(ai, "ponder")!;
        expect(ponder.options).toMatchObject({ model: "gpt-6-luna", effort: "low", allowed: ["chesspal"] });
        expect(ponder.options.server?.name).toBe("chesspal_table");
        // In Codex, where a request costs seconds, its turn's message gives the position ponder {} would, to look at one reply at a time.
        expect(ponder.sent.map(firstLine)).toEqual(["Ponder. Your tool: tools.mcp__chesspal_table__ponder."]);
        expect(ponder.sent[0]).toMatch(/\nPosition 2: the player \(White\) to move[\s\S]*One reply at a time, the likeliest first: /);
        expect(new Set(ai.asked)).toEqual(new Set(["codex"]));

        await posted(table.url, "/api/move", { move: "d4" });
        await until(() => opponent.sent.length >= 4);
        expect(opponent.sent[3]).toContain("Thought on their time by a quicker model (legal, not checked): d5, The centre.");
    }, 30_000);

    it("runs the helpers of a chat in Codex on the opponent's model and effort above the low levels, the coach too, never with a subagent", async () => {
        const { table, ai } = await playing({ level: "strong", helps: true, model: "gpt-6-astra", effort: "high", host: "codex" }, (driver) => {
            driver.helpers.coach = coaching;
        });
        ai.helpers.ponder = pondering("d4", "d5");
        const opponent = ai.chats[0]!;
        opponent.turns.push(async (client) => void (await call(client, "ai_move", { move: "e5", plan: "Centre." })));
        await posted(table.url, "/api/move", { move: "e4" });
        await until(() => helperOf(ai, "ponder")?.ends.includes("done") === true && helperOf(ai, "coach")?.ends.includes("done") === true);

        for (const role of ["ponder", "coach"] as const) {
            expect(helperOf(ai, role)!.options).toMatchObject({ model: "gpt-6-astra", effort: "high", allowed: ["chesspal"] });
            expect(helperOf(ai, role)!.sent.map(firstLine)).toEqual([`${role === "ponder" ? "Ponder." : "Coach."} Your tool: tools.mcp__chesspal_table__${role}.`]);
        }

        expect(new Set(ai.asked)).toEqual(new Set(["codex"]));
        await posted(table.url, "/api/move", { move: "d4" });
        await until(() => opponent.sent.length >= 4);
        expect(opponent.sent[3]).toContain("Thought on their time by your model (legal, not checked): d5, The centre.");
    }, 30_000);

    it("runs the helpers of a chat in Antigravity or OpenCode on the chat's own model at every level, the coach too, as the opponent's next turn says", async () => {
        const hosts = [{ host: "antigravity", driver: "antigravity", model: "gemini-3.8-flash", effort: "medium" }, { host: "opencode", driver: "openCode", model: "ollama/gpt-oss:20b" }];

        for (const { host, driver, model, effort } of hosts) {
            const { table, ai } = await playing({ level: "club", helps: true, host }, (fake) => {
                fake.helpers.coach = coaching;
            });
            ai.helpers.ponder = pondering("d4", "d5");
            const opponent = ai.chats[0]!;
            expect(opponent.options).toMatchObject({ model, allowed: ["chesspal"] });
            opponent.turns.push(async (client) => void (await call(client, "ai_move", { move: "e5", plan: "Centre." })));
            await posted(table.url, "/api/move", { move: "e4" });
            await until(() => helperOf(ai, "ponder")?.ends.includes("done") === true && helperOf(ai, "coach")?.ends.includes("done") === true);

            for (const role of ["ponder", "coach"] as const) {
                expect(helperOf(ai, role)!.options, `${host} ${role}`).toMatchObject({ model, allowed: ["chesspal"] });
                expect(helperOf(ai, role)!.options.effort, `${host} ${role}`).toBe(effort);
                const server = helperOf(ai, role)!.options.server;
                expect(server === undefined ? Object.keys(helperOf(ai, role)!.options.environment) : server.name, `${host} ${role}`).toEqual(host === "antigravity" ? expect.arrayContaining([doorVariable, keyVariable]) : "chesspal");
                expect(helperOf(ai, role)!.sent.map(firstLine), `${host} ${role}`).toEqual([role === "ponder" ? "Ponder." : "Coach."]);
            }

            expect(new Set(ai.asked), host).toEqual(new Set([driver]));
            await posted(table.url, "/api/move", { move: "d4" });
            await until(() => opponent.sent.length >= 4);
            expect(opponent.sent[3], host).toContain("Thought on their time by your model (legal, not checked): d5, The centre.");
        }
    }, 60_000);

    it("stops the thinking at the player's move, its thought kept and given, and starts the next turn from ponder {} on the chat waiting ahead", async () => {
        const { table, ai } = await playing({ level: "strong" });
        let kept = 0;

        // The first turn keeps a thought, then thinks on until the player's move stops it; the next ones think on one reply.
        ai.helpers.ponder = async (client, _prompt, chat) => {
            const position = Number(/^Position (\d+)/.exec((await call(client, "ponder")).text)?.[1]);
            await call(client, "ponder", { position, reply: "g4", move: "Qh4", why: "Mate." });
            kept += 1;

            if (turnsOf(ai, "ponder")[0] === chat) {
                await gate().passed;
            }
        };

        const opponent = ai.chats[0]!;
        opponent.turns.push(async (client) => void (await call(client, "ai_move", { move: "e5", plan: "Centre." })));
        await posted(table.url, "/api/move", { move: "f3" });
        await until(() => kept === 1);
        const first = turnsOf(ai, "ponder")[0]!;

        // The player's move: the turn is stopped and its chat closed, gently; a chat waits ahead with nothing sent.
        opponent.turns.push(async (client) => void opponent.answers.push(await call(client, "ai_move", { move: "Nc6", plan: "Develop." })));
        await posted(table.url, "/api/move", { move: "g4" });
        await until(() => first.closed && opponent.answers.length === 1 && opponent.idle());
        expect(first.ends).toEqual(["interrupted"]);
        expect(first.closes).toEqual([true]);
        expect(opponent.sent[3]).toContain("Thought on their time by your model (legal, not checked): Qh4#, Mate.");

        // The next turn, after an interruption, runs on another chat, which starts from ponder {}.
        await until(() => turnsOf(ai, "ponder")[1]?.ends.includes("done") === true);
        const next = turnsOf(ai, "ponder")[1]!;
        expect(next.sent.map(firstLine)).toEqual(["Ponder."]);
        expect(next.calls[0]).toBe("ponder");
        await until(() => next.closed && waitingAhead(ai, "ponder") !== undefined);
        expect(waitingAhead(ai, "ponder")!.sent).toEqual([]);
        expect(ai.helperChats.filter((chat) => role(chat) === "ponder").every((chat) => chat.sent.length <= 1)).toBe(true);

        // The game's end closes the one waiting, which made no request; a new game opens one for it.
        await posted(table.url, "/api/resign", {});
        await until(() => ai.helperChats.every((chat) => chat.closed));
        await posted(table.url, "/api/new", { ai_colour: "black", level: "strong" });
        await until(() => waitingAhead(ai, "ponder") !== undefined);
    }, 30_000);

    it("shows the sign of the thinking only while a turn of the one that thinks is at work: gone with its chat, and at the table's start", async () => {
        const { table, home, ai, context } = await playing({ level: "strong" });

        ai.helpers.ponder = async (client) => {
            await call(client, "ponder");
            await gate().passed;
        };

        const opponent = ai.chats[0]!;
        opponent.turns.push(async (client) => void (await call(client, "ai_move", { move: "e5", plan: "Centre." })));
        await posted(table.url, "/api/move", { move: "e4" });
        await until(async () => (await shown(table.url)).thinking === "ponder");

        // The opponent started again with another effort: the thinking goes with it, and so does its sign.
        saveProfileSettings(home, activeProfile(home).id, { [chatInPage]: true, claudeEffort: "high" });
        await posted(table.url, "/api/table/restart", { host: "claude" });
        await until(() => turnsOf(ai, "ponder")[0]!.closed);
        await until(async () => (await shown(table.url)).thinking === undefined);

        // A sign left by a table that closed in the thinking: the next table takes it away before any chat thinks.
        await table.close();
        notePondering(gameFolder(home), thoughtKey(loadGame(gameFolder(home))!), true, new Date());
        const again = await drivenTable(home, fakeDriver(), context);
        expect((await shown(again.table.url)).thinking).toBeUndefined();
    }, 30_000);

    it("closes the thinking at once and the coach after its turn when the player resigns", async () => {
        const { table, ai } = await playing({ level: "strong", helps: true });
        const judging = gate();
        ai.helpers.ponder = async () => await gate().passed;
        ai.helpers.coach = async () => await judging.passed;
        const opponent = ai.chats[0]!;
        opponent.turns.push(async (client) => void (await call(client, "ai_move", { move: "e5", plan: "Centre." })));
        await posted(table.url, "/api/move", { move: "e4" });
        await until(() => helperOf(ai, "ponder")?.idle() === false && helperOf(ai, "coach")?.idle() === false);

        await posted(table.url, "/api/resign", {});
        await until(() => helperOf(ai, "ponder")!.closed);
        expect(helperOf(ai, "coach")!.closed).toBe(false);
        judging.open();
        await until(() => helperOf(ai, "coach")!.closed);
        expect(helperOf(ai, "coach")!.ends).toEqual(["done"]);

        // A coach at rest goes at once.
        const resting = await playing({ level: "strong", helps: true });
        resting.ai.helpers.coach = coaching;
        resting.ai.chats[0]!.turns.push(async (client) => void (await call(client, "ai_move", { move: "e5", plan: "Centre." })));
        await posted(resting.table.url, "/api/move", { move: "e4" });
        await until(() => helperOf(resting.ai, "coach")?.ends.length === 1);
        await posted(resting.table.url, "/api/resign", {});
        await until(() => helperOf(resting.ai, "coach")!.closed);
        expect(helperOf(resting.ai, "coach")!.sent).toEqual(["Coach."]);
    }, 30_000);

    it("coaches with the helps on alone, after each AI move and once at the player's move that ends the game, its turns never stopped", async () => {
        const off = await playing({ level: "strong" });
        off.ai.chats[0]!.turns.push(async (client) => void (await call(client, "ai_move", { move: "e5", plan: "Centre." })));
        await posted(off.table.url, "/api/move", { move: "e4" });
        await until(() => off.ai.chats[0]!.sent.length === 3 && off.ai.chats[0]!.idle());
        await pause(100);
        expect(off.ai.helperChats.map(role).every((name) => name === "ponder")).toBe(true);

        const { table, home, ai } = await playing({ level: "strong", helps: true, white: "f3" }, (driver) => {
            driver.helpers.coach = coaching;
        });
        const opponent = ai.chats[0]!;
        await until(() => helperOf(ai, "coach")?.ends.length === 1);
        expect(helperOf(ai, "coach")!.options.model).toBe(opponent.options.model);

        opponent.turns.push(async (client) => void (await call(client, "ai_move", { move: "g4", plan: "Attack." })));
        await posted(table.url, "/api/move", { move: "e5" });
        await until(() => opponent.sent.length === 3 && opponent.idle() && turnsOf(ai, "coach")[1]?.ends.length === 1);
        await posted(table.url, "/api/move", { move: "Qh4" });
        await until(() => turnsOf(ai, "coach").length === 3 && ai.helperChats.every((chat) => chat.closed));
        // A turn a chat, each closed after it.
        expect(turnsOf(ai, "coach").map((chat) => [chat.sent, chat.ends, chat.closes])).toEqual(Array(3).fill([["Coach."], ["done"], [true]]));
        expect(readFileSync(archived(home), "utf8")).toMatch(/2\.\.\. Qh4# \{\[%badge best\]\s+\[%review\s+Well\s+played\.\]\}/);

        // A word after the end asks the coach nothing more.
        await posted(table.url, "/api/message", { text: "Good game." });
        await until(() => opponent.sent.length === 5 && opponent.idle());
        await pause(100);
        expect(turnsOf(ai, "coach")).toHaveLength(3);
        expect(ai.helperChats.every((chat) => chat.closed)).toBe(true);
    }, 30_000);

    it("asks the coach one turn at a time, a chat each, and logs a turn replaced before it went", async () => {
        const judging = gate();
        const { table, ai } = await playing({ level: "strong", helps: true, white: "f3" }, (driver) => {
            driver.helpers.coach = async (client) => {
                await judging.passed;
                await coaching(client);
            };
        });
        const opponent = ai.chats[0]!;
        await until(() => helperOf(ai, "coach")?.idle() === false);
        const coach = helperOf(ai, "coach")!;

        opponent.turns.push(async (client) => void (await call(client, "ai_move", { move: "g4", plan: "Attack." })));
        await posted(table.url, "/api/move", { move: "e5" });
        await until(() => opponent.sent.length === 3 && opponent.idle());
        opponent.turns.push(async (client) => void (await call(client, "ai_move", { move: "Nc3", plan: "Develop." })));
        await posted(table.url, "/api/move", { move: "d6" });
        await until(() => opponent.sent.length === 4 && opponent.idle());
        expect(ai.logged).toContain("coach turn for ply 3 replaced before it was sent, by ply 5");

        judging.open();
        await until(() => turnsOf(ai, "coach").length === 2 && turnsOf(ai, "coach")[1]!.ends.length === 1);
        expect(coach.closed).toBe(true);
        expect(turnsOf(ai, "coach").map((chat) => chat.sent)).toEqual([["Coach."], ["Coach."]]);
        expect(ai.helperChats.filter((chat) => role(chat) === "coach" && !chat.closed).length).toBeLessThanOrEqual(1);
    }, 30_000);

    it("stops a coach's turn on the position it took once gone by, past its limit while the next waits, and gives the next on a chat of its own", async () => {
        const [called, stuck] = [gate(), gate()];
        const { table, ai } = await playing({ level: "strong", helps: true, white: "f3", staleTurn: 500 }, (driver) => {
            driver.helpers.coach = async (client, _prompt, chat) => {
                if (turnsOf(driver, "coach").indexOf(chat) === 0) {
                    // It takes its position, then thinks on it for ever.
                    await call(client, "coach");
                    called.open();
                    await stuck.passed;
                    return;
                }

                await coaching(client);
            };
        });
        const opponent = ai.chats[0]!;
        await called.passed;
        const first = helperOf(ai, "coach")!;

        opponent.turns.push(async (client) => void (await call(client, "ai_move", { move: "g4", plan: "Attack." })));
        await posted(table.url, "/api/move", { move: "e5" });
        await until(() => turnsOf(ai, "coach")[1]?.ends.includes("done") === true);
        expect(first.ends).toEqual(["interrupted"]);
        expect(first.closed).toBe(true);
        expect(ai.logged.filter((line) => / stopped after /.test(line))).toEqual([
            expect.stringMatching(/^coach turn on ply 1 stopped after \d+ s, past its 1 s: the turn for ply 3 waits$/),
        ]);
        const { coach } = (await raw(table.url)).game as { coach: { judgments: { ply: number; }[]; }; };
        expect(coach.judgments.map((judged) => judged.ply)).toEqual([2]);
        stuck.open();
    }, 30_000);

    it("lets a coach's turn asked on a position gone by, which took the newest with its first call, work past the limit and judge it", async () => {
        const moved = gate();
        const { table, ai } = await playing({ level: "strong", helps: true, white: "f3", staleTurn: 500 }, (driver) => {
            driver.helpers.coach = async (client, _prompt, chat) => {
                if (turnsOf(driver, "coach").indexOf(chat) === 0) {
                    // A turn that starts late: it looks only once the player and the opponent have moved, and thinks past the limit.
                    await moved.passed;
                    const start = /^Game "(\w+)", position (\d+)/.exec((await call(client, "coach")).text)!;
                    const at = { game: start[1], position: Number(start[2]) };
                    await pause(1000);
                    await call(client, "coach", { ...at, badge: "best", note: "Well played." });
                    await call(client, "coach", { ...at, ahead: 0 });
                    await call(client, "coach", { ...at, done: true });
                }
            };
        });
        const opponent = ai.chats[0]!;
        await until(() => helperOf(ai, "coach")?.idle() === false);
        const first = helperOf(ai, "coach")!;

        opponent.turns.push(async (client) => void (await call(client, "ai_move", { move: "g4", plan: "Attack." })));
        await posted(table.url, "/api/move", { move: "e5" });
        await until(() => opponent.sent.length === 3 && opponent.idle());
        moved.open();
        await until(() => first.ends.length === 1);
        expect(first.ends).toEqual(["done"]);
        expect(ai.logged.filter((line) => / stopped after /.test(line))).toEqual([]);
        const { coach } = (await raw(table.url)).game as { coach: { judgments: { ply: number; }[]; }; };
        expect(coach.judgments.map((judged) => judged.ply)).toEqual([2]);
    }, 30_000);

    it("judges a move after two turns its tool answered too late, each on a fresh chat, and counts those it skipped from coach's answer", async () => {
        const late = [gate(), gate()];
        const { table, ai } = await playing({ level: "strong", helps: true, white: "e4" }, (driver) => {
            driver.helpers.coach = async (client, _prompt, chat) => {
                await late[turnsOf(driver, "coach").indexOf(chat)]?.passed;
                await coaching(client);
            };
        });
        const opponent = ai.chats[0]!;

        // Twice the player moves before the coach has looked, and it looks while the opponent thinks: coach {} says stop.
        for (const [index, [player, reply]] of ([["e5", "Nf3"], ["Nc6", "Bb5"]] as const).entries()) {
            await until(() => turnsOf(ai, "coach")[index]?.idle() === false);
            const thinking = gate();
            opponent.turns.push(async (client) => {
                await thinking.passed;
                await call(client, "ai_move", { move: reply, plan: "Develop." });
            });
            await posted(table.url, "/api/move", { move: player });
            await until(() => !opponent.idle());
            late[index]!.open();
            await until(() => turnsOf(ai, "coach")[index]!.closed);
            thinking.open();
            await until(() => opponent.idle());
        }

        await until(() => turnsOf(ai, "coach")[2]?.ends.includes("done") === true);
        expect(turnsOf(ai, "coach").map((chat) => chat.calls)).toEqual([["coach"], ["coach"], ["coach", "coach", "coach", "coach"]]);
        expect(ai.logged.filter((line) => /^coach turn for ply \d+ skipped/.test(line))).toEqual([
            "coach turn for ply 1 skipped: coach {} answered that the player had moved, at ply 2 (1 skipped)",
            "coach turn for ply 3 skipped: coach {} answered that the player had moved, at ply 4 (2 skipped)",
        ]);
        const { coach } = (await raw(table.url)).game as { coach: { judgments: { ply: number; }[]; }; };
        expect(coach.judgments.map((judged) => judged.ply)).toEqual([4]);
    }, 30_000);

    it("runs no helper with the switch off, and closes them when it goes off in a game, the AI told of no agent", async () => {
        const { table, home, ai } = await playing({ level: "strong", helps: true });
        ai.helpers.ponder = async () => await gate().passed;
        ai.helpers.coach = coaching;
        const opponent = ai.chats[0]!;
        opponent.turns.push(async (client) => void opponent.answers.push(await call(client, "ai_move", { move: "e5", plan: "Centre." })));
        await posted(table.url, "/api/move", { move: "e4" });
        await until(() => opponent.answers.length === 1 && opponent.idle() && turnsOf(ai, "ponder").length === 1 && turnsOf(ai, "coach")[0]?.closed === true);

        saveProfileSettings(home, activeProfile(home).id, { [chatInPage]: false, helps: true });
        opponent.turns.push(async (client) => void opponent.answers.push(await call(client, "ai_move", { move: "Nc6", plan: "Develop." })));
        await posted(table.url, "/api/move", { move: "Nf3" });
        await until(() => opponent.answers.length === 2 && opponent.idle());
        await until(() => ai.helperChats.every((chat) => chat.closed));

        // Off, the AI's next move gives no helper a turn, nor opens one ahead.
        const before = ai.helperChats.length;
        opponent.turns.push(async (client) => void opponent.answers.push(await call(client, "ai_move", { move: "Nf6", plan: "Develop." })));
        await posted(table.url, "/api/move", { move: "d3" });
        await until(() => opponent.answers.length === 3 && opponent.idle());
        await pause(200);
        expect(ai.helperChats).toHaveLength(before);
        expect(ai.helperChats.every((chat) => chat.closed)).toBe(true);
        expect(opponent.answers[1]!.text).not.toMatch(/agent|spawn/i);

        const free = await drivenTable(undefined, undefined, undefined, false);
        free.ai.helpers.analyst = analysing(gate(), "");
        await posted(free.table.url, "/api/study", { pgn: brought });
        await opened(free.table.url);
        await pause(200);
        expect(free.terminal.opened).toEqual(["claude"]);
        expect(free.ai.helperChats).toEqual([]);
    }, 30_000);

    it("starts one program at a time, each once the one before sat or said which chat it is, and once the program before of its role exited", async () => {
        const { table, ai } = await playing({ level: "strong", helps: true });
        ai.exitAfter = 150;
        // Servers slow to sit: a chat sent its turn as it opens says which chat it is first, and that lets the next start.
        ai.sitAfter = 100;
        ai.helpers.ponder = pondering("d4", "d5");
        ai.helpers.coach = coaching;
        const opponent = ai.chats[0]!;

        for (const [player, reply] of [["e4", "e5"], ["Nf3", "Nc6"]] as const) {
            const before = opponent.sent.length;
            opponent.turns.push(async (client) => void (await call(client, "ai_move", { move: reply, plan: "Develop." })));
            await posted(table.url, "/api/move", { move: player });
            await until(() => opponent.sent.length === before + 1 && opponent.idle());
        }

        await until(() => turnsOf(ai, "ponder").length === 2 && turnsOf(ai, "coach").length === 2 && waitingAhead(ai, "ponder") !== undefined && waitingAhead(ai, "coach") !== undefined);
        await until(() => ai.timeline.filter((entry) => entry.startsWith("sat") && !entry.endsWith(" opponent")).length === 6);
        const helpers = ai.timeline.filter((entry) => !entry.endsWith(" opponent"));
        expect(helpers.filter((entry) => entry.startsWith("start"))).toHaveLength(6);

        // A role never has two programs alive, and a start waits for the one before to have opened: sat at its place, or said which chat it is.
        const alive = new Map<string, number>();
        let sitting: string | undefined;

        for (const entry of helpers) {
            const [step, name] = entry.split(" ") as [string, string];

            if (step === "start") {
                expect(sitting).toBeUndefined();
                expect(alive.get(name) ?? 0).toBe(0);
                sitting = name;
            }

            alive.set(name, (alive.get(name) ?? 0) + (step === "start" ? 1 : step === "exit" ? -1 : 0));
            sitting = (step === "sat" || step === "said") && sitting === name ? undefined : sitting;
        }

        // Each turn on a chat that had none before; the ones waiting have been sent nothing.
        expect(ai.helperChats.every((chat) => chat.sent.length <= 1)).toBe(true);
        expect([waitingAhead(ai, "ponder")!.sent, waitingAhead(ai, "coach")!.sent]).toEqual([[], []]);
    }, 30_000);

    it("stills a helper that fell twice in a row, logged once, until the opponent's chat opens again", async () => {
        const { table, ai } = await playing({ level: "strong" });
        // A turn done between two falls starts the count again.
        const turns: ("failed" | "done")[] = ["failed", "done", "failed", "failed"];
        ai.helpers.ponder = () => Promise.resolve(turns.shift() === "done" ? undefined : ("failed" as const));
        const opponent = ai.chats[0]!;

        for (const [player, reply] of [["e4", "e5"], ["Nf3", "Nc6"], ["Bc4", "Bc5"], ["d3", "d6"], ["c3", "Nf6"]] as const) {
            const before = opponent.sent.length;
            opponent.turns.push(async (client) => void (await call(client, "ai_move", { move: reply, plan: "Develop." })));
            await posted(table.url, "/api/move", { move: player });
            await until(() => opponent.sent.length === before + 1 && opponent.idle() && ai.helperChats.every((chat) => chat.idle()));
            await pause(150);
        }

        // The chats of four turns, none opened after the second fall in a row.
        expect(ai.helperChats).toHaveLength(4);
        expect(ai.logged.filter((line) => line.startsWith("helper ponder failed:"))).toHaveLength(3);
        expect(ai.logged.filter((line) => line.startsWith("helper ponder stopped:"))).toHaveLength(1);

        ai.helpers.ponder = pondering("d3", "d6");
        await posted(table.url, "/api/table/restart", { host: "claude" });
        await until(() => ai.chats.length === 2 && ai.chats[1]!.idle());
        ai.chats[1]!.turns.push(async (client) => void (await call(client, "ai_move", { move: "O-O", plan: "Safe." })));
        await posted(table.url, "/api/move", { move: "Nbd2" });
        await until(() => turnsOf(ai, "ponder").length === 5);
    }, 30_000);

    it("stops every helper at once when the host says the player is not signed in", async () => {
        const { table, ai } = await playing({ level: "strong", helps: true });
        ai.helpers.ponder = (_client, _prompt, chat) => Promise.resolve(chat.emit({ type: "ended", why: "the host's program ended (1)", code: "signin" }));
        ai.helpers.coach = async () => await gate().passed;
        const opponent = ai.chats[0]!;
        opponent.turns.push(async (client) => void (await call(client, "ai_move", { move: "e5", plan: "Centre." })));
        await posted(table.url, "/api/move", { move: "e4" });
        await until(() => ai.helperChats.length === 2 && ai.helperChats.every((chat) => chat.closed));

        opponent.turns.push(async (client) => void (await call(client, "ai_move", { move: "Nc6", plan: "Develop." })));
        await posted(table.url, "/api/move", { move: "Nf3" });
        await until(() => opponent.sent.length === 4 && opponent.idle());
        await pause(100);
        expect(ai.helperChats).toHaveLength(2);
        expect(ai.logged.filter((line) => line.startsWith("helpers stopped: the player is not signed in"))).toHaveLength(1);
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

    it("has no analyst with no chat at the table: the analyst starts with the opponent's chat, on the model the window chose", async () => {
        const { table, home, ai } = await drivenTable();
        saveProfileSettings(home, activeProfile(home).id, { [chatInPage]: true, claudeModel: "sonnet" });
        ai.helpers.analyst = analysing(gate(), "");
        const game = await study(table.url, { pgn: brought });
        await pause(200);
        expect(ai.helperChats).toEqual([]);

        saveProfileSettings(home, activeProfile(home).id, { [chatInPage]: true, claudeModel: "opus", claudeEffort: "high" });
        await opened(table.url);
        await until(() => analysts(ai).length === 1 && analysts(ai)[0]!.calls.length === 1);
        expect(analysts(ai)[0]!.sent).toEqual([`Analyse ${game}. The player speaks English.`]);
        expect(analysts(ai)[0]!.options).toMatchObject({ model: "opus", effort: "high" });
        expect(analysts(ai)[0]!.options.instructions).toContain("Your last message goes to the opponent");
        expect(gameInAnalysis(gameFolder(home))?.analyst?.game).toBe(game);
    }, 30_000);

    it("goes over a game brought with the opponent at the table, rings it at the end with where the review is, and tells the pages", async () => {
        const { table, home, ai } = await drivenTable();
        saveProfileSettings(home, activeProfile(home).id, { [chatInPage]: true, claudeModel: "sonnet", claudeEffort: "high" });
        await opened(table.url);
        await until(() => ai.chats.length === 1 && ai.chats[0]!.idle());
        const opponent = ai.chats[0]!;
        const page = await pageListening(table.url);
        const done = gate();

        ai.helpers.analyst = async (client, prompt, chat) => {
            const game = prompt.split(" ")[1]!.replace(/\.$/, "");
            await call(client, "analyse_game", { game });
            await done.passed;
            await call(client, "annotate_game", { game, summary: "A short game." });
            chat.emit({ type: "text", block: 0, text: "The opening went wrong at Qh5." });
        };

        const game = await study(table.url, { pgn: brought });
        await until(() => helperOf(ai, "analyst")?.calls.length === 1);
        await until(() => page.events.length > 0);
        expect(await analysisOf(table.url)).toMatchObject({ reviewing: true });
        await pause(100);
        expect(opponent.sent).toHaveLength(1);
        const told = page.events.length;

        done.open();
        await until(() => opponent.sent.length === 2 && opponent.idle());
        expect(opponent.sent[1]!.split("\n")[0]).toBe(
            `The analyst has gone over ${game}: The opening went wrong at Qh5. Its review is on the board page, and analyse_game {"game": "${game}"} gives it. Go over it with the player.`,
        );
        await until(() => page.events.length > told);
        expect(gameInAnalysis(gameFolder(home))?.analyst).toBeUndefined();
        // Signed by the model its host names.
        expect(readFileSync(join(gameFolder(home), game), "utf8")).toMatch(/\[Annotator "claude-sonnet"\]/);
        page.destroy();

        // A game reviewed brought back goes to no analyst; asked again, it does.
        await study(table.url, { game });
        await pause(200);
        expect(analysts(ai)).toHaveLength(1);
        ai.helpers.analyst = analysing(gate(), "");
        await posted(table.url, "/api/delete-review", { game });
        await study(table.url, { game, redo: true });
        await until(() => analysts(ai).length === 2);
        expect(opponent.sent).toHaveLength(2);
    }, 30_000);

    it("tells the opponent the analysis did not finish, at the end of the turn it is in, and never wakes it after the player's Stop", async () => {
        const { table, ai } = await drivenTable();
        await opened(table.url);
        await until(() => ai.chats.length === 1 && ai.chats[0]!.idle());
        const opponent = ai.chats[0]!;
        const done = gate();
        const talking = gate();
        ai.helpers.analyst = analysing(done, "I could not read the game.");
        const game = await study(table.url, { pgn: brought });
        await until(() => analysts(ai)[0]?.calls.length === 1);
        opponent.turns.push(async () => await talking.passed);
        await posted(table.url, "/api/message", { text: "Hello?" });
        await until(() => !opponent.idle());
        done.open();
        await until(() => analysts(ai)[0]!.closed);
        await pause(100);
        expect(opponent.sent).toHaveLength(2);

        talking.open();
        await until(() => opponent.sent.length === 3 && opponent.idle());
        expect(opponent.sent[2]!.split("\n")[0]).toBe(
            `The analyst did not finish the review of ${game}: I could not read the game. The board page shows it incomplete; the player can have it analysed again there.`,
        );

        // A second analysis ends in a turn the player stops: the news waits for the player's next act.
        const second = gate();
        ai.helpers.analyst = analysing(second, "Done.");
        await study(table.url, { pgn: brought.replace("Qh5", "Nf3") });
        await until(() => analysts(ai)[1]?.calls.length === 1);
        opponent.turns.push(async () => await gate().passed);
        await posted(table.url, "/api/message", { text: "And now?" });
        await until(() => !opponent.idle());
        second.open();
        await until(() => analysts(ai)[1]!.closed);
        await posted(table.url, "/api/table/stop", {});
        await until(() => opponent.idle());
        await pause(300);
        expect(opponent.sent).toHaveLength(4);

        await posted(table.url, "/api/message", { text: "Well?" });
        await until(() => opponent.sent.length === 5);
        expect(opponent.sent[4]).toMatch(/^The analyst did not finish the review of /);

        // A third ends while the opponent rests after the player's Stop: it waits for the player too.
        await until(() => opponent.idle());
        opponent.turns.push(async () => await gate().passed);
        await posted(table.url, "/api/message", { text: "Wait." });
        await until(() => !opponent.idle());
        await posted(table.url, "/api/table/stop", {});
        await until(() => opponent.idle());
        const third = gate();
        ai.helpers.analyst = analysing(third, "Done.");
        await study(table.url, { pgn: brought.replace("Qh5 Nc6", "Nf3 Nf6") });
        await until(() => analysts(ai)[2]?.calls.length === 1);
        third.open();
        await until(() => analysts(ai)[2]!.closed);
        await pause(300);
        expect(opponent.sent).toHaveLength(6);
    }, 30_000);

    it("starts the analyst only on review: true, offered to the opponent's analyse_game alone, with the instructions of a chat that writes no review", async () => {
        const { table, ai } = await playing({ level: "strong" });
        const analystSchema: string[] = [];

        ai.helpers.analyst = async (client, prompt) => {
            const tools = await client.listTools();
            analystSchema.push(JSON.stringify(tools.tools.find((tool) => tool.name === "analyse_game")?.inputSchema));
            await call(client, "analyse_game", { game: prompt.split(" ")[1]!.replace(/\.$/, "") });
            await gate().passed;
        };

        const opponent = ai.chats[0]!;
        opponent.turns.push(async (client) => void opponent.answers.push(await call(client, "ai_move", { move: "e5", plan: "Centre." })));
        opponent.turns.push(async (client) => void opponent.answers.push(await call(client, "ai_move", { move: "Qh4", plan: "Mate." })));
        await posted(table.url, "/api/move", { move: "f3" });
        await until(() => opponent.answers.length === 1 && opponent.idle());
        await posted(table.url, "/api/move", { move: "g4" });
        await until(() => opponent.answers.length === 2 && opponent.idle());
        expect(opponent.answers[1]!.text).toMatch(/call analyse_game \{"game": "games\/[^"]+", "review": true\}/);
        expect(opponent.answers[1]!.text).not.toContain("spawn_agent");

        const schemas: string[] = [];
        opponent.turns.push(async (client) => {
            schemas.push(JSON.stringify((await client.listTools()).tools.find((tool) => tool.name === "analyse_game")?.inputSchema));
            opponent.answers.push(await call(client, "analyse_game"));
        });
        await posted(table.url, "/api/message", { text: "What went wrong?" });
        await until(() => opponent.answers.length === 3 && opponent.idle());
        expect(schemas[0]).toContain('"review"');
        expect(opponent.answers[2]!.text).toContain("never write one yourself");
        expect(opponent.answers[2]!.text).not.toContain("keep your review there");
        expect(opponent.answers[2]!.text).not.toContain("The table's analyst is writing its review");
        await pause(200);
        expect(analysts(ai)).toEqual([]);

        opponent.turns.push(async (client) => void opponent.answers.push(await call(client, "analyse_game", { review: true })));
        await posted(table.url, "/api/message", { text: "Yes, go over it." });
        await until(() => opponent.answers.length === 4 && opponent.idle());
        expect(opponent.answers[3]!.text).toContain("The table's analyst is writing its review of this game on the board page");
        await until(() => analysts(ai)[0]?.calls.length === 1);
        expect(analystSchema[0]).not.toContain('"review"');
        expect(await analysisOf(table.url)).toMatchObject({ reviewing: true });
    }, 30_000);

    it("tells the opponent at its bell what status tells it, with the helps on and in an analysis", async () => {
        const { table, ai } = await playing({ level: "strong", helps: true, white: "f3" }, (driver) => {
            driver.helpers.coach = () => Promise.resolve();
        });
        const opponent = ai.chats[0]!;
        opponent.turns.push(async (client) => void opponent.answers.push(await call(client, "ai_move", { move: "g4", plan: "Attack." })));
        await posted(table.url, "/api/move", { move: "e5" });
        await until(() => opponent.answers.length === 1 && opponent.idle());
        await posted(table.url, "/api/move", { move: "Qh4" });
        await until(() => opponent.sent.length === 4 && opponent.idle());
        const rung = opponent.sent[3]!;
        opponent.turns.push(async (client) => void opponent.answers.push(await call(client, "status")));
        await posted(table.url, "/api/message", { text: "Well." });
        await until(() => opponent.answers.length === 2 && opponent.idle());
        // At the end the bell and status word the next step apart, the bell first: both have the table's analyst, never an agent.
        const analyst = (text: string) => /call analyse_game \{[^}]*\}/.exec(text)?.[0];
        expect(analyst(rung)).toMatch(/"review": true/);
        expect(analyst(rung)).toBe(analyst(opponent.answers[1]!.text));
        expect(rung).not.toMatch(/agent/i);
        const lines = (text: string) => text.split("\n").filter((line) => /analys|agent|review/i.test(line));

        ai.helpers.analyst = analysing(gate(), "");
        await study(table.url, { pgn: brought });
        await until(() => analysts(ai)[0]?.calls.length === 1);
        opponent.turns.push(async (client) => void opponent.answers.push(await call(client, "status")));
        await posted(table.url, "/api/message", { text: "What about move 2?" });
        await until(() => opponent.answers.length === 3 && opponent.idle());
        expect(lines(opponent.sent.at(-1)!)).toEqual(lines(opponent.answers[2]!.text));
    }, 30_000);

    it("lets the page stop the analyst, take another game in its place, start again a review asked again, and closes it for a new game", async () => {
        const { table, home, ai } = await drivenTable();
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
        const third = analysts(ai)[2]!.sent[0]!.split(" ")[1]!.replace(/\.$/, "");
        await until(() => analysts(ai)[2]!.calls.length === 1);

        // Brought again, it is still its own; asked again, its review deleted, a new analyst takes it.
        await study(table.url, { game: third });
        await pause(100);
        expect(analysts(ai)).toHaveLength(3);
        await posted(table.url, "/api/delete-review", { game: third });
        await study(table.url, { game: third, redo: true });
        await until(() => analysts(ai).length === 4 && analysts(ai)[3]!.calls.length === 1);
        expect(analysts(ai)[2]!.closed).toBe(true);
        expect(gameInAnalysis(gameFolder(home))?.analyst?.game).toBe(third);

        await posted(table.url, "/api/new", { ai_colour: "black" });
        await until(() => analysts(ai)[3]!.closed);
    }, 30_000);

    it("keeps the table in use while a helper works with no page open, for the longest turn at most", async () => {
        const home = temporary();
        const { context, ahead } = movingContext(home);
        const { table, ai } = await drivenTable(home, fakeDriver(), context, true, { idle: 300, every: 50 });
        let closed = false;
        void table.closed.then(() => (closed = true));
        await opened(table.url);
        await until(() => ai.chats.length === 1 && ai.chats[0]!.idle());
        ai.helpers.analyst = analysing(gate(), "");
        await study(table.url, { pgn: brought });
        await until(() => analysts(ai)[0]?.calls.length === 1);
        await pause(1000);
        expect(closed).toBe(false);

        ahead.ms = 31 * 60_000;
        await until(() => closed);
        expect(analysts(ai)[0]!.closed).toBe(true);
    }, 30_000);

    it("closes the helpers gently, and lets go the game its analyst held, as the table closes, the opponent leaves, or its place goes", async () => {
        const { table, ai, withdrawn } = await playing({ level: "strong", helps: true });
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
        expect(withdrawn).toEqual(expect.arrayContaining(["ponder", "coach"]));

        const analysed = await drivenTable();
        await opened(analysed.table.url);
        await until(() => analysed.ai.chats.length === 1 && analysed.ai.chats[0]!.idle());
        analysed.ai.helpers.analyst = analysing(gate(), "");
        const game = await study(analysed.table.url, { pgn: brought });
        await until(() => analysts(analysed.ai)[0]?.calls.length === 1);
        expect(gameInAnalysis(gameFolder(analysed.home))?.analyst?.game).toBe(game);
        await analysed.table.close();
        expect(analysts(analysed.ai)[0]!.closed).toBe(true);
        expect(gameInAnalysis(gameFolder(analysed.home))?.analyst).toBeUndefined();
        expect(analysed.withdrawn).toContain("analyst");

        const left = await drivenTable();
        await opened(left.table.url);
        await until(() => left.ai.chats.length === 1 && left.ai.chats[0]!.idle());
        left.ai.helpers.analyst = analysing(gate(), "");
        await study(left.table.url, { pgn: brought });
        await until(() => analysts(left.ai)[0]?.calls.length === 1);
        // The opponent leaves for a chat in a terminal, with the switch off.
        saveProfileSettings(left.home, activeProfile(left.home).id, { [chatInPage]: false });
        await posted(left.table.url, "/api/table/restart", { host: "antigravity" });
        await until(() => analysts(left.ai)[0]!.closed && left.terminal.opened.length === 1);
        expect(left.terminal.opened).toEqual(["antigravity"]);
        expect(gameInAnalysis(gameFolder(left.home))?.analyst).toBeUndefined();

        const gone = await playing({ level: "strong", helps: true });
        gone.ai.helpers.ponder = work;
        gone.ai.helpers.coach = work;
        gone.ai.chats[0]!.turns.push(async (client) => void (await call(client, "ai_move", { move: "e5", plan: "Centre." })));
        await posted(gone.table.url, "/api/move", { move: "e4" });
        await until(() => working === 4);
        saveProfileSettings(gone.home, activeProfile(gone.home).id, { [chatInPage]: false });
        await posted(gone.table.url, "/api/table/restart", { host: "antigravity" });
        await until(() => gone.ai.helperChats.every((chat) => chat.closed));
    }, 30_000);
});

/**
 * A table whose chat plays a new game at `level`, Black, or White with its first move `white`, with the helps on when asked, opened on `model` and `effort`
 * when given: its first turns done, the helpers' fakes `set` before the game starts.
 */
async function playing(
    { level, helps = false, white, model, effort, host = "claude", staleTurn }: {
        level: string;
        helps?: boolean;
        white?: string;
        model?: string;
        effort?: string;
        host?: string;
        staleTurn?: number;
    },
    set: (driver: FakeDriver) => void = () => undefined,
): Promise<Awaited<ReturnType<typeof drivenTable>>>
{
    const driven = await drivenTable(undefined, staleTurn === undefined ? undefined : Object.assign(fakeDriver(), { staleTurn }));
    // OpenCode's models as the table keeps them once read: OpenCode offers none before.
    writeFileSync(join(tableFolder(driven.home), "opencode-models.json"), `${JSON.stringify({ models: ["ollama/gpt-oss:20b"], model: "ollama/gpt-oss:20b" })}\n`);
    const chosen = { ...(model === undefined ? {} : { [`${host}Model`]: model }), ...(effort === undefined ? {} : { [`${host}Effort`]: effort }) };
    saveProfileSettings(driven.home, activeProfile(driven.home).id, { [chatInPage]: true, ...(helps ? { helps: true } : {}), ...chosen });
    set(driven.ai);
    await opened(driven.table.url, host);
    await until(() => driven.ai.chats.length === 1 && driven.ai.chats[0]!.idle());
    const opponent = driven.ai.chats[0]!;

    if (white !== undefined) {
        opponent.turns.push(async (client) => void (await call(client, "ai_move", { move: white, plan: "Open." })));
    }

    await posted(driven.table.url, "/api/new", { ai_colour: white === undefined ? "black" : "white", level });
    await until(() => driven.ai.chats[0]!.sent.length === 2 && driven.ai.chats[0]!.idle());
    return driven;
}

/** The first line of a message: a helper's turn, without the position that may follow it. */
function firstLine(message: string): string
{
    return message.split("\n")[0]!;
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

/** The last chat of a role given a turn. */
function helperOf(ai: FakeDriver, name: string): FakeChat | undefined
{
    return turnsOf(ai, name).at(-1);
}

/** The chats of a role given a turn, in order: one a turn. */
function turnsOf(ai: FakeDriver, name: string): FakeChat[]
{
    return ai.helperChats.filter((chat) => role(chat) === name && chat.sent.length > 0);
}

/** The chat of a role waiting ahead, open and sent nothing. */
function waitingAhead(ai: FakeDriver, name: string): FakeChat | undefined
{
    return ai.helperChats.find((chat) => role(chat) === name && !chat.closed && chat.sent.length === 0);
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
