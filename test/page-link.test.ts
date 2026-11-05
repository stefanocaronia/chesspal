import { mkdtempSync, rmSync } from "node:fs";
import { get } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Context } from "../src/commands/context.ts";
import { newGame } from "../src/commands/new-game.ts";
import { status } from "../src/commands/status.ts";
import { type Page, startPage } from "../src/server/page.ts";
import { testContext } from "./commands.ts";

const folders: string[] = [];
const pages: Page[] = [];
const url = "http://127.0.0.1:5870/";

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
        expect(await said(newGame, { ai_colour: "white" }, context)).toMatch(new RegExp(`\\n${escaped(asked)}\\nNext: `));

        open = true;
        expect(await said(status, {}, context)).toContain(`\nBoard page: ${url}\n`);
        expect(await said(newGame, { ai_colour: "white", replace: true }, context)).not.toContain("Board page");
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

async function said(command: typeof status | typeof newGame, input: Record<string, unknown>, context: Context): Promise<string>
{
    const parsed = command.input.parse(input) as never;
    return (command.format as (result: unknown) => string)(await command.run(parsed, context));
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
