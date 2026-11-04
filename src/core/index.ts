// The chess core: the game and its rules, the facts of a position, its record, PGN, the openings. It runs in the browser too (D-17, D-18).
export { boardText } from "./board-text.ts";
export { canMate, clockAfterMove, clockOfComment, clockTag, clockText, startClock, timeControlOf, timeControlOfTag, timeControlTag, timeControlText, timeLeft } from "./clock.ts";
export type { Clock, TimeControl } from "./clock.ts";
export type { Facts, PieceFacts, PieceLetter, Pin } from "./facts.ts";
export { Game } from "./game.ts";
export type { Ending, Move, Outcome, Played, Position, Promotion, Refusal, Side, Square } from "./game.ts";
export type { Illegal, IllegalReason } from "./illegal.ts";
export { aiLevels, layersOf, levelForPlayer, levelOf, levelTag, sees, suggestedLevel } from "./levels.ts";
export type { AiLevel, Layer } from "./levels.ts";
export { materialOf } from "./material.ts";
export type { Material } from "./material.ts";
export { endWithMood, type Mood, moodAt, moodMoves, type MoodNow, moodOf, moods, moodTag, withoutMoods } from "./moods.ts";
export { bookDepth, bookMoves, indexBook, indexOpenings, inOpenings, openingOf, outOfBookMove } from "./openings.ts";
export type { Opening, OpeningBook, OpeningIndex } from "./openings.ts";
export { pgnDate, readPgn, writePgn } from "./pgn.ts";
export type { BishopFacts, CentreSquare, KingFacts, Outpost, PawnFacts, PawnSquare, Phase, Profile, SideProfile } from "./profile.ts";
export type { Annotation, GameRecord, RecordedMove } from "./record.ts";
export { arrowOf, type Badge, badges, closingOf, type DrawColour, type DrawnArrow, type DrawnSquare, gameReviewOf, isBadge, type MoveReview, reviewed, reviewOf, squareOf, withGameReview } from "./review.ts";
