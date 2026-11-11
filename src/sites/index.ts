// The sites the player plays on (D-24, D-105): their public ratings on Lichess and chess.com, read from the names in their profile, without a key. Below
// the commands, beside the profiles, whose types it fills; never asked by a tool of the AI's (D-106).
export { type Fetch } from "./request.ts";
export { readingsStale, readSites } from "./sites.ts";
