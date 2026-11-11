// The board page's server (D-8, D-47): its files, its routes, the events the pages listen to and the chat attached to the table. Below the table and the MCP server.
export { jsonOf } from "./http.ts";
export { chatHasRead, type Page, startPage } from "./page.ts";
export type { ChatHost, TableChats } from "./table.ts";
