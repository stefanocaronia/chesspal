# Recorded flows

The exchanges between a driver and a real host program, one JSON message a line, which the fakes of `test/hosts/` play back. They were recorded in rpg-engine from 2026-11-24 to 2026-11-26 with its own MCP server, and copied from its commits 66b60310, b9816504 and 38505a2b.

In the copies the names of that server were rewritten mechanically so that the replays match Chesspal's drivers: the tools `mcp__rpg__*` are `mcp__chesspal__*`, the server `rpg` is `chesspal` (with OpenCode's `chesspal.*` and `tools.chesspal`, Antigravity's `ServerName` and its folder `mcp/chesspal`), and the bare word `rpg` in the models' prose became `chesspal` too, with the pieces of streamed text that cut it in two (`rp`+`g`, `r`+`pg`) rewritten to join into the same word. `rpg-character` stays, as the name of a plain subagent, and so do `rpg-bench` and `rpg-engine` (with its title `RPG Engine`), the recorders' own names.
