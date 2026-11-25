# Recorded flows

The exchanges between a driver and a real host program, one JSON message a line, which the fakes of `test/hosts/` play back. They were recorded in rpg-engine on 2026-11-24 with its own MCP server, and copied from its commit 66b60310.

In the copies the names of that server were rewritten mechanically so that the replays match Chesspal's drivers: the tools `mcp__rpg__*` are `mcp__chesspal__*`, the server `rpg` is `chesspal` (with OpenCode's `chesspal.*` and `tools.chesspal`), and the bare word `rpg` in the models' prose became `chesspal` too, with the three pieces of streamed text that cut it in two (`rp`+`g`, `r`+`pg`) rewritten to join into the same word. `rpg-character` stays, as the name of a plain subagent, and so does `rpg-bench`, the recorder's own name.
