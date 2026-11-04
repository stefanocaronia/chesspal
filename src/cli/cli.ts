#!/usr/bin/env node
import { runCommandLine } from "./command-line.ts";

const args = process.argv.slice(2);

// "chesspal mcp" turns the process into a server for an AI host, "chesspal listen" into the doorbell of Claude Code, or of Codex with --codex,
// "chesspal chat" notes how the chat started; everything else is a command.
if (args.length === 1 && args[0] === "mcp") {
    // The server and its SDK load only here: every other command starts faster without them.
    const { startMcpServer } = await import("../server/mcp.ts");
    await startMcpServer();
} else if (args[0] === "listen" && (args.length === 1 || (args.length === 2 && args[1] === "--codex"))) {
    const { listen } = await import("../server/bell.ts");
    await listen(args[1] === "--codex");
} else if (args.length === 1 && args[0] === "chat") {
    const { recordChatStart } = await import("./chat-hook.ts");
    await recordChatStart();
} else {
    const { output, exitCode } = await runCommandLine(args);

    if (exitCode === 0) {
        console.log(output);
    } else {
        console.error(output);
    }

    process.exitCode = exitCode;
}
