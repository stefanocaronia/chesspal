// The talk on the board page before the first game (D-77): talk.json, in the folder of the profile's games, until a game starts and its talk goes in game.json.
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { savedLine, type TalkLine } from "./current-game.ts";
import { writeAtomically } from "./files.ts";

/** What the player and the AI said with no game on the page, and since when: it keys the player's lines apart from any game's. */
export interface TableTalk
{
    readonly started: string;
    readonly talk: readonly TalkLine[];
}

/** The talk with no game: empty when there is none, or talk.json cannot be read, since it is only words. */
export function loadTableTalk(folder: string): TableTalk
{
    try {
        return tableFile.parse(JSON.parse(readFileSync(join(folder, fileName), "utf8")));
    } catch {
        return { started: "", talk: [] };
    }
}

/** Writes the talk with no game, whole or not at all. */
export function saveTableTalk(folder: string, table: TableTalk): void
{
    writeAtomically(join(folder, fileName), `${JSON.stringify(table, null, 2)}\n`);
}

/** Forgets the talk with no game, when a game starts. */
export function endTableTalk(folder: string): void
{
    rmSync(join(folder, fileName), { force: true });
}

const fileName = "talk.json";

const tableFile = z.object({ started: z.iso.datetime(), talk: z.array(savedLine) });
