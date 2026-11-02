import type { AnyCommand } from "./registry.ts";
import { status } from "./status.ts";

/** Every command of Chesspal, in the order the command line lists them and the MCP server offers them. */
export const commands: AnyCommand[] = [status];
