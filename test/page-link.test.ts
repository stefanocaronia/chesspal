import { mkdtempSync, rmSync } from "node:fs";
import { get } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { aiMove } from "../src/commands/ai-move.ts";
import type { Context } from "../src/commands/context.ts";
import { newGame } from "../src/commands/new-game.ts";
import { playerMove } from "../src/commands/player-move.ts";
import { status } from "../src/commands/status.ts";
import { chatHasRead, type Page, startPage } from "../src/server/page/page.ts";
import { testContext } from "./commands.ts";

const folders: string[] = [];
const pages: Page[] = [];
const url = "http://127.0.0.1:5870/";
const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

afterEach(async () => {
    await Promise.all(pages.splice(0).map((page) => page.close()));

    for (const folder of folders.splice(0)) {
        rmSync(folder, { recursive: true, force: true });
    }
});

describe("the board page's address for a player who has not opened it", () => {
    it("asks the AI to give it first in status and new_game while no browser has the page open, and only names it once one has", async () => {
        let open = false;
        const context: Context = { ...testContext(playerFolder()), page: url, pageOpen: () => open };
        const asked = `Board page: ${url}, open in no browser: give the player this address before anything else.`;

        expect(await said(status, {}, context)).toContain(`\n${asked}\n`);
        // A new game starts on the page, which the AI names, never in the chat.
        expect(await said(status, {}, context)).toMatch(/\nNext: when the player wants a game, they start it on the board page with its New game button, .*never offer to set it up in the chat\.$/);
        expect(await said(newGame, { ai_colour: "white", from: start }, context)).toMatch(new RegExp(`\\n${escaped(asked)}\\nNext: `));

        open = true;
        expect(await said(status, {}, context)).toContain(`\nBoard page: ${url}\n`);
        expect(await said(newGame, { ai_colour: "white", from: start, replace: true }, context)).not.toContain("Board page");
    });

    it("has the player choose a new game in the page's window, and starts one with choices in the chat only from a position the window cannot set (D-85)", async () => {
        const context: Context = { ...testContext(playerFolder()), page: url, pageOpen: () => false };
        const refusal = "The player chooses a new game in the board page's New game window: call new_game without choices";

        await expect(said(newGame, { ai_colour: "white" }, context)).rejects.toThrow(refusal);
        await expect(said(newGame, { ai_colour: "black", clock: "10+5", level: "club" }, context)).rejects.toThrow(refusal);
        expect(await said(newGame, {}, context)).toBe(`Nobody has the board page open: give the player its address, ${url}, and tell them to start the game there with its New game button. End your turn.`);
        expect(await said(newGame, { ai_colour: "white", from: start }, context)).toMatch(/^New game: /);
        expect(await said(newGame, { ai_colour: "white", replace: true }, testContext(context.folder))).toMatch(/^New game: /);
    });

    it("invites the player to the page once a game when they move in the chat with the page closed, and gives the board only then (D-85)", async () => {
        let open = true;
        const context: Context = { ...testContext(playerFolder()), page: url, pageOpen: () => open, told: new Set() };
        const invite = `The board page is open in no browser, and the game is played there: invite the player, in a few words, to open ${url}; `
            + "their moves in the chat still count.";
        await said(newGame, { ai_colour: "black", from: start }, context);
        open = false;

        expect(await said(playerMove, { move: "e4" }, context)).toContain(`\n${invite}\nNext: `);
        expect(await said(aiMove, { move: "e5", plan: "Hold the centre." }, context)).toContain("\nNo board page is open: copy this board into your message.\n");
        expect(await said(playerMove, { move: "Nf3" }, context)).not.toContain("invite the player");

        open = true;
        expect(await said(aiMove, { move: "Nc6", plan: "Develop." }, context)).not.toContain("copy this board");
    });

    it("invites no more when status or new_game gave the address for the game, nor after the move that ends it (Priya and Federico, round of D-85)", async () => {
        let open = false;
        const context: Context = { ...testContext(playerFolder()), page: url, pageOpen: () => open, told: new Set() };
        await said(newGame, { ai_colour: "black", from: start }, context);
        expect(await said(playerMove, { move: "e4" }, context)).not.toContain("invite the player");

        open = true;
        await said(newGame, { ai_colour: "black", from: start, replace: true }, context);
        open = false;
        await said(status, {}, context);
        expect(await said(playerMove, { move: "e4" }, context)).not.toContain("invite the player");

        open = true;
        await said(newGame, { ai_colour: "black", from: "rnbqkbnr/ppppp2p/5p2/6p1/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3", replace: true }, context);
        open = false;
        const mate = await said(playerMove, { move: "Qh5#" }, context);
        expect(mate).toContain("Game over: 1-0, checkmate.");
        expect(mate).not.toContain("invite the player");
    });

    it("invites a resumed chat once a game too, though its first move came before any tool showed it the game", async () => {
        const folder = playerFolder();
        await said(newGame, { ai_colour: "black", from: start }, testContext(folder));
        const resumed: Context = { ...testContext(folder), page: url, pageOpen: () => false, told: new Set(), positionSeen: null };

        expect(await said(playerMove, { move: "e4" }, resumed)).toContain("invite the player");
        await said(aiMove, { move: "e5", plan: "Hold the centre." }, resumed);
        expect(await said(playerMove, { move: "Nf3" }, resumed)).not.toContain("invite the player");
    });

    it("never asks on the command line, where no page is served", async () => {
        expect(await said(status, {}, testContext(playerFolder()))).not.toContain("Board page");
    });

    it("knows the page open while a browser listens to it", async () => {
        const page = await startPage(testContext(playerFolder()));
        pages.push(page);
        expect(page.open()).toBe(false);

        const listening = get(new URL("/api/events", page.url));
        await until(() => page.open());
        listening.destroy();
        await until(() => !page.open());
    });
});

async function said(command: typeof status | typeof newGame | typeof playerMove | typeof aiMove, input: Record<string, unknown>, context: Context): Promise<string>
{
    const parsed = command.input.parse(input) as never;
    const result = await command.run(parsed, context);
    // As the MCP server does after each tool that shows the game.
    chatHasRead(context, command.showsGame === true);
    return (command.format as (result: unknown) => string)(result);
}

function escaped(text: string): string
{
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function until(condition: () => boolean): Promise<void>
{
    for (let tries = 0; !condition(); tries++) {
        if (tries === 500) {
            throw new Error("The page never changed as expected.");
        }

        await new Promise((done) => setTimeout(done, 10));
    }
}

function playerFolder(): string
{
    const folder = mkdtempSync(join(tmpdir(), "chesspal-link-"));
    folders.push(folder);
    return folder;
}
