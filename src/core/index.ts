// The chess core: the game and its rules, its record, PGN. It runs in the browser too (D-17, D-18).
export { Game } from "./game.ts";
export type { Ending, Move, Outcome, Played, Position, Promotion, Refusal, Side, Square } from "./game.ts";
export { pgnDate, readPgn, writePgn } from "./pgn.ts";
export type { Annotation, GameRecord, RecordedMove } from "./record.ts";
