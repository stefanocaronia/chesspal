// The commands of the game being played: started, moved, looked at, offered a draw, ended and exported; the AI's pondering while the player thinks,
// and the coach beside the player.
export { aiMove } from "./ai-move.ts";
export { coach } from "./coach.ts";
export { answerDraw, DrawRefused, offerDraw } from "./draw-offer.ts";
export { endGame } from "./end.ts";
export { exportGame } from "./export.ts";
export { look } from "./look.ts";
export { ChatNotClear, newGame, startNewGame } from "./new.ts";
export { type MoveSentAlone, playerMove, playMoveSentAlone } from "./player-move.ts";
export { ponder } from "./ponder.ts";
export { position } from "./position.ts";
export { status } from "./status.ts";
