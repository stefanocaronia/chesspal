// The commands: the only way the AI, the command line and the page change a game (D-5, D-27), each defined once in the file named as its tool.
import { aiMove } from "./ai-move.ts";
import { aiSay } from "./ai-say.ts";
import { analyseGame } from "./analyse-game.ts";
import { annotateGame } from "./annotate-game.ts";
import { coach } from "./coach.ts";
import { deleteGame } from "./delete-game.ts";
import { deleteReview } from "./delete-review.ts";
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
import { newProfile, profiles, setAccounts, setAvatar, useProfile } from "./profiles.ts";
import type { AnyCommand } from "./registry.ts";
import { status } from "./status.ts";
import { studyGames } from "./study-games.ts";

// What the server and the command line use besides the list: the context, the reading of an input, and the operations the page shares with the tools.
export { aiMove } from "./ai-move.ts";
export { analyseGame } from "./analyse-game.ts";
export { gameAt } from "./clock.ts";
export { type Caller, type Context, defaultContext, type SeenPosition } from "./context.ts";
export { deleteGame } from "./delete-game.ts";
export { deleteReview } from "./delete-review.ts";
export { answerDraw, DrawRefused, offerDraw } from "./draw-offer.ts";
export { endGame } from "./end-game.ts";
export { ChatNotClear, newGame, startNewGame } from "./new-game.ts";
export { bookOpening, bookPlies } from "./opening-book.ts";
export { playMove, PositionChanged, positionIn, samePosition } from "./play-move.ts";
export { chooseDrawnAvatar, GameGoingOn, newProfile, setAccounts, useProfile } from "./profiles.ts";
export { type AnyCommand, baseType, type Command, commandLineFieldProblem, inputProblems, isBoolean, isList, takesNumbers } from "./registry.ts";
export { say } from "./say.ts";
export { gameToStudy, namedGame } from "./study.ts";

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
    deleteReview,
    deleteGame,
    profiles,
    newProfile,
    useProfile,
    setAvatar,
    setAccounts,
];
