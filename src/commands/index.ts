import { aiMove } from "./ai-move.ts";
import { endGame } from "./end-game.ts";
import { exportGame } from "./export-game.ts";
import { look } from "./look.ts";
import { newGame } from "./new-game.ts";
import { playerMove } from "./player-move.ts";
import type { AnyCommand } from "./registry.ts";
import { status } from "./status.ts";

/** Every command of Chesspal, in the order the command line lists them and the MCP server offers them. */
export const commands: AnyCommand[] = [status, newGame, playerMove, aiMove, look, endGame, exportGame];
