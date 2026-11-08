# Chesspal — guide for development agents

Chesspal lets you play chess against an AI, or learn with one: Chesspal keeps the rules, the board, the facts of the position, the clock, the games and the memory; the AI plays, reasons, judges and talks.

This file is about **developing** Chesspal. The instructions for **playing** are part of the product: see "Development vs game".

## Read first

- `project/` is the maintainer's private repository, ignored by this one: the project docs (Italian) and the colleagues (`project/.claude/`, which `.claude` links to as a junction). `project/README.md` is the index of the docs; `project/PLAN.md` says what comes next; `project/GDD.md` and `project/ARCHITETTURA.md` are the key documents. If `project/` is missing (e.g. in a fresh clone), ask the maintainer: without it, this file and the README are the whole picture.
- The project docs hold only what the maintainer has decided, written briefly. Proposals go to `project/DECISIONS.md` under "To decide" until the maintainer decides. No premature detail (code, examples, formats) before the work it belongs to.
- `project/IDEE.md`: the maintainer's idea inbox. Until phase 1 is playable, a new idea goes there and is discussed at the end of the phase; only one that touches the next work becomes a decision at once (D-33).
- The backlog (`project/TASKS.md`), the decisions and the plan change only through the `project` plugin's commands ([claude-project](https://github.com/stefanocaronia/claude-project), here `F:/sviluppo/AI/claude-project`): `plugins/project/scripts/backlog.mjs` (`add`, `start`, `done`, `show`, `list`, `comment`…), `decisions.mjs` (`next`, `show`, `find`, `cites`; a new decision takes its number from `next`), `check.mjs` after changing the docs. Its `project` skill says how to use them.
- Commit the private repository with `git -C project` from the root. Never delete through the junction (`rm -rf .claude/`), never `git stash --all`, and `git clean -ffdx` only with `-e project`.

## Layout

| Path | Content | GitHub | npm |
|---|---|---|---|
| `README.md` | what Chesspal is, how to build and test it, the credits | yes | yes |
| `AGENTS.md`, `CLAUDE.md` | this guide (`CLAUDE.md` only imports it) | yes | no |
| `project/` | the maintainer's private repository: project docs and colleagues | no | no |
| `.claude/` | a junction to `project/.claude/`: see "Colleagues" | no | no |
| `src/` | the chess core (`src/core/`, browser-safe), the games on disk (`src/games/`), the commands, the CLI, the MCP server | yes | built into `dist/` |
| `instructions/` | the opponent's instructions, which `chesspal init` installs in a player's folder | yes | yes |
| `data/` | Lichess's openings, which the build turns into an index by position | yes | built into `dist/` |
| `scripts/` | the build's scripts | yes | no |
| `test/` | tests, benches and demos | yes | no |
| `tmp/` | scratch output | no | no |

## Commands

- `npm run build`: compile `src/` into `dist/`.
- `npm test`: run the tests.
- `npm run format`: format the code (ESLint fixes, then dprint).
- `npm run lint`: check the formatting, and the types of the tests too, as CI does.
- `npm run bench`: time the commands against their budgets.
- `npm run smoke`: after the build, pack the package, install it in a temporary folder and run it as a player would (its version, `chesspal init`, its MCP server), as CI does.
- `npm run page -- <folder>`: serve the board page of a player's folder, with the data of `CHESSPAL_HOME` or Documents, to look at it while it is built.
- `npm run endings`: show the ends of a game on the board page.
- Releasing: a tag `v<version>` equal to `package.json`'s version publishes it to npm through GitHub Actions (`.github/workflows/publish.yml`), after lint, build, tests and the smoke; only on the maintainer's word. The repo is public, `project/` stays private.

## Development vs game

1. **No "magic" names for game files in the repo.** The instructions Chesspal installs for the AI opponent, coach and analyst are never called `AGENTS.md` or `CLAUDE.md` in the repo, and never sit in `.agents/` or `.claude/`: hosts load those on their own, and a development agent would take the player's instructions as its own. They get their real names only when `chesspal init` installs them into a player's folder.
2. **Playtests with an AI run in a player's folder outside the repo.** Claude Code also reads the `CLAUDE.md` files of parent folders, so inside the repo development and game instructions would mix.

## Architecture rules

- **Keep it simple.** Chesspal computes only what an AI is weak at: the rules, the board and what it sees, facts about the position, the clock, the files and the memory.
- **Never an engine, never a score.** Chesspal never judges a move or weighs a position: no search, no evaluation, no exchange balance (D-6, D-19). It gives the AI separate facts; the judgment is the AI's. An engine is only a developer's test tool (D-35): it runs in `project/` as a simulated player against the AI and to check the AI's judgments, never in the package, this repo, `package.json` or CI, and never where the playing AI can see it.
- **The game's state is on disk, changed only by commands** (D-27): they validate every move with chess.js and write atomically; the AI, the page and the CLI read and change it only through them.
- Every operation is a command defined once, from which the CLI and the MCP server are generated, and later the page's actions (D-5). Every command validates its input, returns a value and never prints.
- **`src/core` runs in the browser too**: no Node, no console, no imports from commands, server or CLI (ESLint enforces it), so the page uses the same code for legal moves and their reasons (D-17, D-18).

## Performance

Performance is essential: every tool call runs on the AI's clock (D-13), and every word a tool returns is tokens the player pays for. An AI opponent is slow because it reasons through what a program does in microseconds (D-34).
- **Hand the AI everything trivial but long**: scanning the board, listing legal moves, counting attackers and defenders, spotting checks, captures and threats, repetitions, the clock, the opening's name. Chesspal computes it and gives it ready, so the AI spends its time only on judgment.
- **One call per move**: the tool that plays the AI's move answers with all it needs for the next decision (the player's move, the view, the facts), never a second call to see the position.
- **The MCP server keeps what it read for the whole session**: the game in progress as a live game, the profile, the openings index. It reads a file again only when it changed outside the session (the CLI, the page in another process, a hand edit), and a call reads each file at most once.
- **Work on the same position is done once**: legal moves, facts and the view are computed once per position, kept by its key in a bounded cache, and given frozen.
- **Load late**: heavy modules and data load only when a command needs them (the MCP SDK only for `chesspal mcp`, the openings index at its first lookup).
- **Answers are compact**: a tool returns what the AI needs to decide, in the fewest tokens that stay clear; more on request.
- **Measure, don't guess**: a bench times the commands in one process as the MCP server runs them, and from the command line; a budget that a change breaks is a regression.

## Coding guidelines

Clean, compact, ordered code that is easy to understand.

**Design first**
- Think the architecture before writing code: which module owns the change, its public API, its dependencies. For anything non-trivial, propose the design to the maintainer and wait for approval.
- Each module (a folder under `src/`, such as `core/`) does one job, exposes a small API from its `index.ts` and depends only on what is below it: never on commands, the CLI or the server. Commands are the glue between modules.
- SOLID: one responsibility per module and function; add behaviour with new modules and commands instead of bending working ones; inject what comes from outside (randomness, time, folders) through `Context`.
- No over-engineering: the simplest code that solves today's need, with no speculative options, layers or abstractions.

**Formatting** (applied by `npm run format`; checked by `npm run lint` and CI)
- 4-space indentation (2 in JSON and YAML, as npm writes them), lines up to 240 characters, double quotes, semicolons.
- Braces on their own line for classes, interfaces, functions and methods; on the same line for `if`, `else`, loops, `switch`, `try` and arrow functions, with `} else {` on one line.
- Braces always, even around a single statement.
- A blank line before and after every block statement (`if`, loops, `switch`, `try`); never more than one blank line in a row.

**Code**
- Extract a function when a block becomes complex or is needed twice; prefer well-named functions to sections marked by comments.
- Clear, descriptive names; no abbreviations or cryptic names (`context`, not `ctx`; `square`, not `sq`), except loop indexes.
- camelCase for variables, functions and constants; PascalCase for types, interfaces and classes, without an `I` prefix; no underscores or hyphens in identifiers. File names in kebab-case.
- Public API first in a file, private helpers below it.
- Let TypeScript infer local types; annotate parameters and return types of exported functions.
- Relative imports use the `.ts` extension; the build rewrites them to `.js`.
- Comments in English, one or two lines at most: the code should explain itself. A one-line `/** */` on exported functions and types when the name is not enough.
- Error messages say what went wrong and how to fix it: an AI reads them.
- Use our own utilities before writing new helpers.
- Test every module through its public API, with randomness and time injected.

## Tools and checks

- **CodeGraph** (optional, set up per person): when `.codegraph/` exists, use it before Grep/Read chains for structure questions (who calls X, what breaks if Z changes), then confirm in the file. Agents never run `init`, `index` or `uninit` for the maintainer.
- **Jev** (`mcp__jev__*`, optional, set up per person): before a commit, `jev_gate` with the diff, the claims of the commit message and the real test output; before reporting results, `jev_verify` the claims against the evidence. Fix or drop unsupported claims. Without Jev, say so and go on.
- **Regression check after every addition or change**: build and run all tests; check the callers and impact of every changed symbol; review the diff for regressions, unhandled `undefined`, nondeterminism, simplicity and these guidelines, and fix what you find. When it matters, give the maintainer a short checklist to verify the behaviour.

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
- **Never an engine in the product**: no colleague proposes Stockfish or any other chess engine for Chesspal, not even as an option (D-6); as a test tool in `project/` it is allowed (D-35).

## Conventions

- TypeScript on Node ≥ 22.13; chess.js for the rules; zod; the official MCP SDK; Preact for the page; vitest; few dependencies.
- Code, comments, commit messages, public docs, command names, file names and config keys in English (D-32); the project docs in Italian; the page and the messages to the player translated.
- Licensing: the repo and the npm package hold only original or open-licensed content, no GPL dependency (D-2): chess.js (BSD-2), the Lichess openings and puzzles (CC0), our own SVG pieces.
- Never keep the repo under a path containing `&`: on Windows, npm's `.cmd` shims truncate the path and `npm run` fails.
- Credentials never go in the repo or in a player's folder.
