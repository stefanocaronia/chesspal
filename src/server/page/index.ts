// The board page's server (D-8, D-47): its files, its routes, the events the pages listen to, the chat attached to the table and the seat of the one the
// table drives. Below the table and the MCP server.
export type { ChatAttach } from "./chat.ts";
export { jsonOf } from "./http.ts";
export { chatHasRead, type Page, startPage } from "./page.ts";
export type { ChatSeat, SeatHooks } from "./seat.ts";
export type { ChatFailure, ChatHost, FailureCode, HeldChat, OllamaState, TableChats } from "./table.ts";
