// A second process that writes the game: it adds its lines to the talk one save at a time, as the page and the chat do, until each is saved.
// Usage: node --experimental-strip-types talk-writer.ts <game folder> <name> <lines>
import { GameChanged, loadGame, saveGame } from "../../src/games/index.ts";

const [folder = "", name = "", lines = "0"] = process.argv.slice(2);
let refused = 0;

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
        saveGame(folder, { ...current, talk: [...current.talk, { who: "player", text, ply: 0, at: new Date().toISOString() }] });
        return true;
    } catch (error) {
        if (error instanceof GameChanged) {
            return false;
        }

        throw error;
    }
}
