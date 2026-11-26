import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { analysisStopped, anotherAnalyst } from "../src/commands/answers/index.ts";
import type { TableHelpers } from "../src/commands/index.ts";
import { gameInAnalysis } from "../src/games/index.ts";
import { agentFiles } from "../src/host-files/agents.ts";
import { atTableInstructions, instructionsFile, opponentInstructions, tableHelperInstructions } from "../src/host-files/index.ts";
import type { HostEvent } from "../src/hosts/index.ts";
import { activeProfile, gameFolder, type PageSettings, saveProfileSettings } from "../src/profiles/index.ts";
import { chatInPage } from "../src/server/driven/index.ts";
import { testContext } from "./commands.ts";
import { call, cleanUp, drivenTable, type FakeChat, type FakeDriver, fakeDriver, gate, movingContext, opened, pageListening, pause, posted, raw, temporary, until } from "./driven-fakes.ts";

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

        expect(tableHelperInstructions("ponder").split("\n").at(-1)).toContain("start again from `ponder {}`");
        expect(tableHelperInstructions("coach")).toContain("start again from `coach {}`");
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

        expect(ponder.sent).toEqual(["Ponder."]);
        // What the opponent was opened with, not the name its host gives the model.
        expect(ponder.options).toMatchObject({ model: "sonnet", effort: "high", allowed: ["chesspal"] });
        expect(ponder.options.instructions).toContain("the table hears you through `ponder` alone");
        expect(opponent.answers[0]!.text).not.toMatch(/agent/i);
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

    it("stops the thinking at the player's move, keeping its chat, closes it at the game's end, and opens a fresh one for a new game", async () => {
        const { table, ai } = await playing({ level: "strong" });
        ai.helpers.ponder = async () => await gate().passed;
        const opponent = ai.chats[0]!;
        const replying = gate();
        opponent.turns.push(async (client) => void (await call(client, "ai_move", { move: "e5", plan: "Centre." })));
        opponent.turns.push(async (client) => {
            await replying.passed;
            await call(client, "ai_move", { move: "Qh4", plan: "Mate." });
        });
        await posted(table.url, "/api/move", { move: "f3" });
        await until(() => helperOf(ai, "ponder")?.idle() === false);
        const ponder = helperOf(ai, "ponder")!;

        // The player's move, while the AI has not answered: the thinking stops, its chat stays for the next.
        await posted(table.url, "/api/move", { move: "g4" });
        await until(() => ponder.ends.includes("interrupted"));
        expect(ponder.closed).toBe(false);

        // The AI's move that ends the game ends the thinking's chat.
        replying.open();
        await until(() => ponder.closed && opponent.idle());
        expect(ponder.closes).toEqual([true]);
        expect(ponder.sent).toEqual(["Ponder."]);

        const sentBefore = opponent.sent.length;
        await posted(table.url, "/api/new", { ai_colour: "black", level: "strong" });
        await until(() => (ai.chats.length > 1 || opponent.sent.length > sentBefore) && ai.chats.at(-1)!.idle());
        const next = ai.chats.at(-1)!;
        next.turns.push(async (client) => void (await call(client, "ai_move", { move: "e5", plan: "Centre." })));
        await posted(table.url, "/api/move", { move: "e4" });
        await until(() => ai.helperChats.filter((chat) => role(chat) === "ponder").length === 2);
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
        expect(off.ai.helperChats.map(role)).toEqual(["ponder"]);

        const { table, home, ai } = await playing({ level: "strong", helps: true, white: "f3" }, (driver) => {
            driver.helpers.coach = coaching;
        });
        const opponent = ai.chats[0]!;
        await until(() => helperOf(ai, "coach")?.ends.length === 1);
        const coach = helperOf(ai, "coach")!;
        expect(coach.options.model).toBe(opponent.options.model);

        opponent.turns.push(async (client) => void (await call(client, "ai_move", { move: "g4", plan: "Attack." })));
        await posted(table.url, "/api/move", { move: "e5" });
        await until(() => opponent.sent.length === 3 && opponent.idle() && coach.ends.length === 2);
        await posted(table.url, "/api/move", { move: "Qh4" });
        await until(() => coach.closed);
        expect(coach.sent).toEqual(["Coach.", "Coach.", "Coach."]);
        expect(coach.ends).toEqual(["done", "done", "done"]);
        expect(readFileSync(archived(home), "utf8")).toMatch(/2\.\.\. Qh4# \{\[%badge best\]\s+\[%review\s+Well\s+played\.\]\}/);

        // A word after the end asks the coach nothing more.
        await posted(table.url, "/api/message", { text: "Good game." });
        await until(() => opponent.sent.length === 5 && opponent.idle());
        expect(ai.helperChats.filter((chat) => role(chat) === "coach")).toHaveLength(1);
    }, 30_000);

    it("asks the coach one turn at a time, and logs a turn replaced before it went or sent after the player moved", async () => {
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

        opponent.turns.push(async (client) => await gate().passed);
        await posted(table.url, "/api/move", { move: "Nc6" });
        await until(() => opponent.sent.length === 5);
        judging.open();
        await until(() => coach.ends.length === 2);
        expect(coach.sent).toEqual(["Coach.", "Coach."]);
        expect(ai.logged).toContain("coach turn for ply 5 sent after the player moved, at ply 6");
    }, 30_000);

    it("runs no helper with the switch off, and closes them when it goes off in a game, the AI told of no agent", async () => {
        const { table, home, ai } = await playing({ level: "strong", helps: true });
        ai.helpers.ponder = async () => await gate().passed;
        ai.helpers.coach = coaching;
        const opponent = ai.chats[0]!;
        opponent.turns.push(async (client) => void opponent.answers.push(await call(client, "ai_move", { move: "e5", plan: "Centre." })));
        await posted(table.url, "/api/move", { move: "e4" });
        await until(() => opponent.answers.length === 1 && opponent.idle() && ai.helperChats.length === 2);

        saveProfileSettings(home, activeProfile(home).id, { [chatInPage]: false, helps: true });
        opponent.turns.push(async (client) => void opponent.answers.push(await call(client, "ai_move", { move: "Nc6", plan: "Develop." })));
        await posted(table.url, "/api/move", { move: "Nf3" });
        await until(() => opponent.answers.length === 2 && opponent.idle());
        await until(() => ai.helperChats.every((chat) => chat.closed));
        expect(ai.helperChats).toHaveLength(2);
        expect(opponent.answers[1]!.text).not.toMatch(/agent|spawn/i);

        const free = await drivenTable(undefined, undefined, undefined, false);
        free.ai.helpers.analyst = analysing(gate(), "");
        await posted(free.table.url, "/api/study", { pgn: brought });
        await opened(free.table.url);
        await pause(200);
        expect(free.terminal.opened).toEqual(["claude"]);
        expect(free.ai.helperChats).toEqual([]);
    }, 30_000);

    it("starts one program at a time, the next once the one before said which chat it is", async () => {
        const { table, ai } = await playing({ level: "strong", helps: true });
        const order: string[] = [];
        const open = ai.driver.open.bind(ai.driver);

        ai.driver.open = (options) => {
            const name = basename(options.folder);
            order.push(`open ${name}`);
            const chat = open(options);
            const onEvent = chat.onEvent.bind(chat);
            chat.onEvent = (listener) =>
                onEvent((event: HostEvent) => {
                    if (event.type === "session") {
                        order.push(`session ${name}`);
                    }

                    listener(event);
                });
            return chat;
        };

        ai.helpers.ponder = pondering("d4", "d5");
        ai.helpers.coach = coaching;
        const opponent = ai.chats[0]!;
        opponent.turns.push(async (client) => void (await call(client, "ai_move", { move: "e5", plan: "Centre." })));
        await posted(table.url, "/api/move", { move: "e4" });
        await until(() => order.length === 4);
        expect(order).toEqual(["open ponder", "session ponder", "open coach", "session coach"]);
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

        expect(ai.helperChats).toHaveLength(3);
        expect(ai.logged.filter((line) => line.startsWith("helper ponder failed:"))).toHaveLength(3);
        expect(ai.logged.filter((line) => line.startsWith("helper ponder stopped:"))).toHaveLength(1);

        ai.helpers.ponder = pondering("d3", "d6");
        await posted(table.url, "/api/table/restart", { host: "claude" });
        await until(() => ai.chats.length === 2 && ai.chats[1]!.idle());
        ai.chats[1]!.turns.push(async (client) => void (await call(client, "ai_move", { move: "O-O", plan: "Safe." })));
        await posted(table.url, "/api/move", { move: "Nbd2" });
        await until(() => ai.helperChats.length === 4);
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
        await posted(left.table.url, "/api/table/restart", { host: "codex" });
        await until(() => analysts(left.ai)[0]!.closed);
        expect(left.terminal.opened).toEqual(["codex"]);
        expect(gameInAnalysis(gameFolder(left.home))?.analyst).toBeUndefined();

        const gone = await playing({ level: "strong", helps: true });
        gone.ai.helpers.ponder = work;
        gone.ai.helpers.coach = work;
        gone.ai.chats[0]!.turns.push(async (client) => void (await call(client, "ai_move", { move: "e5", plan: "Centre." })));
        await posted(gone.table.url, "/api/move", { move: "e4" });
        await until(() => working === 4);
        await posted(gone.table.url, "/api/table/restart", { host: "codex" });
        await until(() => gone.ai.helperChats.every((chat) => chat.closed));
    }, 30_000);
});

/**
 * A table whose chat plays a new game at `level`, Black, or White with its first move `white`, with the helps on when asked, opened on `model` and `effort`
 * when given: its first turns done, the helpers' fakes `set` before the game starts.
 */
async function playing(
    { level, helps = false, white, model, effort }: { level: string; helps?: boolean; white?: string; model?: string; effort?: string; },
    set: (driver: FakeDriver) => void = () => undefined,
): Promise<Awaited<ReturnType<typeof drivenTable>>>
{
    const driven = await drivenTable();
    const chosen = { ...(model === undefined ? {} : { claudeModel: model }), ...(effort === undefined ? {} : { claudeEffort: effort }) };
    saveProfileSettings(driven.home, activeProfile(driven.home).id, { [chatInPage]: true, ...(helps ? { helps: true } : {}), ...chosen });
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
