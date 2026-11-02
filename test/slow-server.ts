// The MCP server with one slow tool, started by mcp.test.ts as a host would start chesspal mcp.
import { startMcpServer } from "../src/server/mcp.ts";
import { slow, testContext } from "./commands.ts";

await startMcpServer(testContext("."), [slow]);
