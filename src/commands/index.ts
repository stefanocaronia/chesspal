// The commands: the only way the AI, the command line and the page change a game (D-5, D-27), grouped by area, each defined once.
import { analyseGame, annotateGame, deleteReview, studyGames } from "./analysis/index.ts";
import { aiMove, coach, endGame, exportGame, look, newGame, playerMove, ponder, position, status } from "./game/index.ts";
import { deleteGame, editProfile, newProfile, pastGames, profiles, setAvatar, useProfile } from "./profiles/index.ts";
import type { AnyCommand } from "./registry/index.ts";
import { init, instructions } from "./setup/index.ts";
import { aiSay, playerSay } from "./talk/index.ts";

// What the server and the command line use besides the list: the context, the reading of an input, and the operations the page shares with the tools.
export { analyseGame, deleteReview } from "./analysis/index.ts";
export { bookOpening, bookPlies, gameAt, gameToStudy, namedGame, playMove, PositionChanged, positionIn, samePosition, say, shownPosition } from "./answers/index.ts";
export { aiMove, answerDraw, ChatNotClear, DrawRefused, endGame, newGame, offerDraw, startNewGame } from "./game/index.ts";
export { chooseDrawnAvatar, deleteGame, editProfile, GameGoingOn, newProfile, ratingsAge, refreshRatings, useProfile } from "./profiles/index.ts";
export { type AnyCommand, baseType, type Caller, type Command, commandLineFieldProblem, type Context, defaultContext, inputProblems, isBoolean, isList, type SeenPosition, speaksItalian, takesNumbers } from "./registry/index.ts";

/** Every command of Chesspal, in the order the command line lists them and the MCP server offers them. */
export const commands: AnyCommand[] = [
    init,
    instructions,
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
    editProfile,
];
