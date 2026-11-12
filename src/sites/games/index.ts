// The player's latest games on Lichess and Chess.com (D-110), asked from the names in their profile to study one of them: never kept on disk.
export { isSiteGameName, pointsAtSite, type SiteGame, siteGameName } from "./game.ts";
export { readSiteGames, type SiteGames, siteOfGameName } from "./games.ts";
