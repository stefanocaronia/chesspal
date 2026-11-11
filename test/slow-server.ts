// The MCP server with one slow tool, started by mcp.test.ts as a host would start chesspal mcp, with a data folder of its own.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startMcpServer } from "../src/server/mcp/mcp.ts";
import { slow, testContext } from "./commands.ts";

await startMcpServer(testContext(mkdtempSync(join(tmpdir(), "chesspal-slow-"))), [slow]);
