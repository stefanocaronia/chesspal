# Chesspal — guide for development agents

Chesspal lets you play chess against an AI, or learn with one: Chesspal keeps the rules, the board, the games and the memory; the AI plays, reasons and talks. This guide grows with the code (T-4).

## Read first

The project's docs live in `project/`, a private repo of their own: the GDD, the architecture, the decisions, the plan and the backlog. Without access to it, this file and the README are the whole picture.

## Colleagues

Six experts review the work and discuss it with the maintainer: subagents with a profile, a memory and a todo. The [Crew](https://github.com/stefanocaronia/claude-crew) plugin runs them: its skill holds the method (hiring and firing, portraits, the round, conversations and meetings), its commands hand the chat over ("voglio parlare con Anatolij", "torna Claude"), and it draws the Crew panel. Each colleague is `.claude/agents/<id>.md`, their profile, and `.claude/agent-memory/<id>/`, with `MEMORY.md`, `todo.md`, their portrait and `notes/`.

| Who | Field | `<id>` |
|---|---|---|
| Anatolij Sorokin | chess: the AI's judgments and comments, tactical facts, teaching, time controls, playing styles | `anatolij-sorokin` |
| Priya Raman | AI agents: tools, MCP, instructions, the doorbell, hosts, inference time and tokens | `priya-raman` |
| Federico Marini | code: architecture, review, tests, CI | `federico-marini` |
| Zoe Whitaker | the page: UX, board and SVG pieces, themes, the avatars | `zoe-whitaker` |
| Julián Ferraro | the AI opponent's character: personalities, voice, moods | `julian-ferraro` |
| Rosa Pellegrino | the player who does not program: install, first run, clarity | `rosa-pellegrino` |

Portraits: in the look of 1980s–90s TV anime, head and shoulders on a plain background in each colleague's color, made by Codex.

- **Rounds**: when a step of the plan is done, a feature finished or a playtest played, Claude runs a review round with the colleagues the work touches (the crew skill), before calling the step done.
- **Tasks**: when a question or a check falls in a colleague's field and needs more than a glance, Claude gives it to them as a subagent, within the permissions of their `tools`.
- **Never an engine**: no colleague proposes Stockfish or any other chess engine, not even as an option (D-6).
- **Ideas wait**: until phase 1 is playable, a new idea goes into `project/IDEE.md` and is discussed at the end of the phase; only one that touches the next work becomes a decision at once (D-33).
