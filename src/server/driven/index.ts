// The chat the table drives itself, without a terminal: its host's program by its driver, its commands at its place in the table's process, its turns given by
// the doorbell. The command line hands it to the table, which never imports it, nor does the MCP server.
export { chatInPage, drivenChats, type DrivenOptions } from "./driven.ts";
export { failureCode, failureOf } from "./failure.ts";
export { keepChat, type KeptChat, keptChat } from "./kept.ts";
