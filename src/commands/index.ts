import { aiMove } from "./ai-move.ts";
import { aiSay } from "./ai-say.ts";
import { analyseGame } from "./analyse-game.ts";
import { annotateGame } from "./annotate-game.ts";
import { coach } from "./coach.ts";
import { endGame } from "./end-game.ts";
import { exportGame } from "./export-game.ts";
import { init } from "./init.ts";
import { look } from "./look.ts";
import { newGame } from "./new-game.ts";
import { pastGames } from "./past-games.ts";
import { playerMove } from "./player-move.ts";
import { playerSay } from "./player-say.ts";
import { ponder } from "./ponder.ts";
import { position } from "./position.ts";
import { newProfile, profiles, setAvatar, useProfile } from "./profiles.ts";
import type { AnyCommand } from "./registry.ts";
import { status } from "./status.ts";
import { studyGames } from "./study-games.ts";

/** Every command of Chesspal, in the order the command line lists them and the MCP server offers them. */
export const commands: AnyCommand[] = [
    init,
    status,
    newGame,
    playerMove,
    playerSay,
    aiMove,
    aiSay,
    ponder,
    coach,
    look,
    position,
    endGame,
    exportGame,
    pastGames,
    analyseGame,
    annotateGame,
    studyGames,
    profiles,
    newProfile,
    useProfile,
    setAvatar,
];
