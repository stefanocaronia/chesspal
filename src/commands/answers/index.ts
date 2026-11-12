// What the commands share to answer the AI: the lines it reads, the game's summary and view, the clock, the talk, the moves played, the games to study.
// Above the registry only, below every other command folder.
export { agentRuns, agentsLine, analystLine, analystOf, analystOnView, analystRuns, anotherAnalyst, coachOnEnd, coachOnEndLine, coachRuns, goneOver, reviewedLine, withAnalyst } from "./agents.ts";
export { clockLine, clockSummaryOf, gameAt } from "./clock.ts";
export { arrowsInput, drawingsOf, noteInput, squaresInput } from "./drawings.ts";
export { aheadWords, leadFrom, leadInput } from "./lead-input.ts";
export { closingLines, headLines, lastMoveText, moveLines, newGameStep, nextStep, positionLines, shownMove, shownMoves, sidesLine, wordLines } from "./lines.ts";
export { bookOpening, bookPlies, bookReaches, knownMoves, openingLine, openingName } from "./opening-book.ts";
export { playMove, PositionChanged, positionIn, refuseOtherGame, refuseUnseenPosition, samePosition } from "./play-move.ts";
export { give, newWords, say, unansweredWords, waitingWords, type Written } from "./say.ts";
export { type Speech, speechLine, speechOf } from "./speech.ts";
export { gameShown, gameToStudy, knownTag, moveIndex, moveNumbers, namedGame, noGameGoingOn, positionAfter, positionLine, shownPosition, type Studied, studyInput } from "./study.ts";
export { gameGoingOn, type GameSummary, lastMoves, type MovePlayed, summaryOf, withThought } from "./summary.ts";
export { balanceText, boardView, colourName, compactView, fullView, materialText, riskLine, tacticsText } from "./view.ts";
