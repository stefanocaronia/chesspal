// The sites the player plays on (D-24, D-105): their public ratings on Lichess and chess.com, read from the names in their profile, without a key, never
// asked by a tool of the AI's (D-106); and their latest games there, which a tool lists too, to study one (D-110). Below the commands, beside the profiles,
// whose types it fills. Its request asks npm too, for a newer Chesspal (D-108).
export { isSiteGameName, pointsAtSite, readSiteGames, type SiteGame, siteGameName, type SiteGames, siteOfGameName } from "./games/index.ts";
export { readingsStale, readSites } from "./ratings/index.ts";
export { answerTime, askSite, type Fetch } from "./request/index.ts";
