// The chess core: the game and its rules, the facts of a position, its record, PGN. It runs in the browser too (D-17, D-18).
export { boardText } from "./board-text.ts";
export type { Facts, PieceFacts, PieceLetter, Pin } from "./facts.ts";
export { Game } from "./game.ts";
export type { Ending, Move, Outcome, Played, Position, Promotion, Refusal, Side, Square } from "./game.ts";
export { materialOf } from "./material.ts";
export type { Material } from "./material.ts";
export { pgnDate, readPgn, writePgn } from "./pgn.ts";
export type { Annotation, GameRecord, RecordedMove } from "./record.ts";
