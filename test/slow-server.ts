// The MCP server with one slow tool, started by mcp.test.ts as a host would start chesspal mcp.
import { startMcpServer } from "../src/server/mcp.ts";
import { slow } from "./commands.ts";

await startMcpServer({ folder: "." }, [slow]);
