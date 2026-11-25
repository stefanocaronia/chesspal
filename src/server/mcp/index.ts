// The MCP server an AI host starts, every command as a tool (D-5); it loads the MCP SDK, so only `chesspal mcp` imports it, and the table, late, for the
// chats it opens.
export { callsAnswered, createMcpServer, startMcpServer, type TableSeat } from "./mcp.ts";
