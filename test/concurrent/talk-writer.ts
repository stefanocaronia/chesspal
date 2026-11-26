// A second process that writes the game: it adds its lines to the talk one save at a time, as the page and the chat do, until each is saved. With a gate,
// it reads the game for its first line and waits there until every writer has read it too, then saves: the first saves of the writers are made on the
// same game, so all but one are refused, however the machine times the processes; the lines after race freely.
// Usage: node --experimental-strip-types talk-writer.ts <game folder> <name> <lines> [<gate folder> <writers>]
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GameChanged, loadGame, saveGame } from "../../src/games/index.ts";

const [folder = "", name = "", lines = "0", gate, writers = "1"] = process.argv.slice(2);
let refused = 0;
let waited = gate === undefined;

for (let line = 0; line < Number(lines); line++) {
    while (!saved(`${name} ${line}`)) {
        refused++;
    }
}

process.stdout.write(`${refused}\n`);

function saved(text: string): boolean
{
    try {
        const current = loadGame(folder)!;
        waitForTheOthers();
        saveGame(folder, { ...current, talk: [...current.talk, { who: "player", text, ply: 0, at: new Date().toISOString() }] });
        return true;
    } catch (error) {
        if (error instanceof GameChanged) {
            return false;
        }

        throw error;
    }
}

// Once, after the first read: until every writer has read the game too.
function waitForTheOthers(): void
{
    if (waited) {
        return;
    }

    waited = true;
    writeFileSync(join(gate!, name), "");
    const giveUp = Date.now() + 20_000;

    while (readdirSync(gate!).length < Number(writers)) {
        if (Date.now() > giveUp) {
            process.stderr.write(`The writer ${name} waited 20 s at the gate for the others, which never came.\n`);
            process.exit(2);
        }

        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1);
    }
}
