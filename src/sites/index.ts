// The sites the player plays on (D-24, D-105): their public ratings on Lichess and chess.com, read from the names in their profile, without a key. Below
// the commands, beside the profiles, whose types it fills; never asked by a tool of the AI's (D-106). Its request asks npm too, for a newer Chesspal (D-108).
export { answerTime, askSite, type Fetch } from "./request.ts";
export { readingsStale, readSites } from "./sites.ts";
