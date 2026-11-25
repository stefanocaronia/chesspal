// The table's places for the chats it opens, a place each, whose commands run in the table's process. The command line hands them to the table,
// which never imports this module: server/mcp imports server/table, and this one server/mcp.
export { type ChatRole, type Place, type PlacesOptions, type TablePlaces, tablePlaces } from "./places.ts";
