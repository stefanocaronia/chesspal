// The chess core: the game and its rules, the facts of a position, its record, PGN, the openings. It runs in the browser too (D-17, D-18).
export { boardText, figurinesOf } from "./board-text.ts";
export { canMate, clockAfterMove, clockOfComment, clockStarted, clockTag, clockText, startClock, timeControlOf, timeControlOfTag, timeControlTag, timeControlText, timeLeft } from "./clock.ts";
export type { Clock, TimeControl } from "./clock.ts";
export type { Facts, PieceFacts, PieceLetter, Pin, Skewer } from "./facts.ts";
export { Game, withSanLetters } from "./game.ts";
export type { Ending, Move, Outcome, Played, Position, Promotion, Refusal, Side, Square } from "./game.ts";
export type { Illegal, IllegalReason } from "./illegal.ts";
export { type Lead, leadOf, leadText, readLead, withLead } from "./lead.ts";
export { aiLevels, layersOf, levelForPlayer, levelOf, levelTag, sees, suggestedLevel } from "./levels.ts";
export type { AiLevel, Layer } from "./levels.ts";
export { materialOf } from "./material.ts";
export type { Material } from "./material.ts";
export { endWithMood, type Mood, moodAt, type MoodNow, moodOf, moods, moodTag, withoutMoods } from "./moods.ts";
export { bookMoves, indexBook, indexOpenings, inOpenings, openingOf, outOfBookMove } from "./openings.ts";
export type { Opening, OpeningBook, OpeningIndex } from "./openings.ts";
export { pgnDate, readPgn, writePgn } from "./pgn.ts";
export type { BishopFacts, CentreSquare, KingFacts, Outpost, PawnFacts, PawnSquare, Phase, Profile, SideProfile } from "./profile.ts";
export { movesOnly } from "./record.ts";
export type { Annotation, GameRecord, RecordedMove } from "./record.ts";
export {
    aiHostIn,
    type AiModel,
    aiModelIn,
    aiNameOf,
    annotatorOf,
    arrowOf,
    type Badge,
    badges,
    closingOf,
    type DrawColour,
    drawingsIn,
    drawingsText,
    type DrawnArrow,
    type DrawnSquare,
    gameReviewOf,
    isReviewed,
    type MoveReview,
    reviewed,
    reviewOf,
    squareOf,
    unreviewed,
    withAiHost,
    withAiModel,
    withAnnotator,
    withGameReview,
} from "./review.ts";
