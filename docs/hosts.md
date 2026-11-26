# The chat in the page, host by host

What the chat the table drives (the switch "The chat with the AI in the page", off by default) has done with a real host, on Windows. Everything else is tested on fake hosts only.

✅ proven live · 🟡 works with a known limit · ❌ fails · ❔ not tried live

| | Claude Code | Codex 0.172.0 | OpenCode 2.3.0 | Antigravity 1.5.18 |
|---|---|---|---|---|
| Model in the trials | haiku, sonnet | gpt-6-luna, low | deepseek-v4-pro | gemini-3.8-flash |
| Open the chat, the table's server and key | ✅ | ✅ | ✅ | ✅ through the player's own chesspal server |
| The player's other servers kept out | ✅ | ✅ | ✅ | 🟡 they start in every chat |
| Instructions read once | ✅ | ✅ | ✅ | ✅ |
| A game from the page | ✅ | ✅ one request a move | ✅ one request a move | ✅ two requests a move |
| The turn ended after the move | ✅ | ✅ | ✅ | ✅ ends by itself in 1.5–2.6 s |
| Stop, words, a move written alone | ✅ | ✅ | ✅ | ✅ |
| New game, another model or effort | ✅ | ✅ | ✅ | ❔ |
| Table reopened, the chat taken up | ✅ | ✅ | ✅ | ✅ |
| Closed without a program stopped | ✅ | ✅ | ✅ | ✅ |
| Ponderer's thoughts reach the opponent at 7 s a move | 🟡 rarely | ❌ | ❌ | 🟡 1 in 10 |
| Coach's judgements | ✅ | 🟡 few | 🟡 late on a slow model | 🟡 no badge yet |
| Analyst, from the chat and the page | ✅ | ✅ | ✅ 9 min on deepseek-v4-pro | ❔ |
| A usage limit or sign-in error shown with its code | ❔ | ❔ | ❔ | ❔ |
| macOS and Linux | ❔ | ❔ | ❔ | ❔ |

Known limits:

- Models sometimes write an arrow in `ai_move` with a piece letter instead of a colour; the move is refused and asked again.
- Antigravity starts every server of the player's global configuration in each chat; the table seats the player's own `chesspal`, which `chesspal init` writes there.
- In Codex and OpenCode the helpers reach their first tool in 2–5 s, too late for a game at a few seconds a move.
- OpenCode's own tools (shell, files, subagents, the web from its `execute`) are denied through `OPENCODE_CONFIG_CONTENT` and missing from its tools, through `opencode acp`, the table's way, and `opencode run --standalone`; `opencode run` without it talks to OpenCode's service in the background, which ignores that configuration and lets them all run. Its `skill` stays, with no shell to use.
- Codex's model searches its tools with `ALL_TOOLS` before the first call, though the turn names it: at 1.6–2 s a request, the ponderer keeps its first thought at about 6 s at best, with its position given in its turn's message.
