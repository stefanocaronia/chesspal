// The page of a player's folder, with the data of CHESSPAL_HOME or Documents (D-71), served until Ctrl+C, to look at it while it is built: npm run page -- <folder>
import { resolve } from "node:path";
import { defaultContext } from "../../src/commands/registry/context.ts";
import { startPage } from "../../src/server/page/page.ts";

const page = await startPage({ ...defaultContext(), folder: resolve(process.argv[2] ?? ".") });
console.log(`Chesspal's page: ${page.url}`);
// The server does not keep the process alive by itself: this does, until Ctrl+C.
setInterval(() => undefined, 60_000);
