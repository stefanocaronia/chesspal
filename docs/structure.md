# Structure

Where things are in the repository, what each module depends on, and where new code goes. The development rules are in [AGENTS.md](../AGENTS.md). This page changes in the same commit that adds, moves or removes a folder.

## 1. The repository

| Path | What it holds |
|---|---|
| [src/](../src/) | The chess core, the games and profiles on disk, the commands, the command line, the MCP server, the table and the board page |
| [instructions/](../instructions/) | The instructions for the AI: the opponent's, which the MCP server gives, the lines that start a chat, and the analyst's, coach's and ponderer's, which `chesspal init` installs in a player's folder |
| [data/openings/](../data/openings/) | Lichess's openings (CC0), which the build turns into an index by position |
| [scripts/](../scripts/) | The build's scripts: [build-openings.ts](../scripts/build-openings.ts) |
| [test/](../test/) | The tests, one file a module or command; [bench/](../test/bench/), the commands timed against their budgets; [smoke/](../test/smoke/), the package installed and run as a player would; [demo/](../test/demo/), the board page served to look at it (`npm run page`, `npm run endings`); [concurrent/](../test/concurrent/), the writers of two processes at once |
| [docs/](.) | This page and the README's screenshot |

The build (`npm run build`) compiles `src/` into `dist/`, the page apart with its own `tsconfig.json`, copies the page's other files (styles, pictures, sounds) as they are, and writes the openings' index.

## 2. Inside `src/`

Each folder is a module with one job, which exposes its API from its `index.ts`: the others import only from there, and a folder never imports the files of the one above it, but for `version.ts`, which must sit at the root to find `package.json` (ESLint enforces both). Three folders have no `index.ts`: `cli/`, the binary, which nothing imports; `server/`, which only groups its modules, so that each command loads only the one it needs; the page, one app built on its own (see below). The tests may import any file. The last column says what a module may import; ESLint enforces the rules marked ✓.

| Path | What it holds | Depends on |
|---|---|---|
| [core/](../src/core/) | The chess core: the game on chess.js, the facts of a position, its profile and possibilities, the clock, the material, the levels and moods, the review, PGN and the record, the openings. It runs in the browser too | chess.js only ✓ |
| [games/](../src/games/) | The player's games on disk: the current one in `game.json`, the finished ones in `games/`, the ones kept to study, the talk, the analysis, the AI's thoughts and plans; files written whole or not at all | core; never profiles, commands, server or CLI ✓ |
| [profiles/](../src/profiles/) | The profiles in `profiles/<id>/`: `profile.md` with its front matter, the picture, the page's settings, the ratings read from the sites in `ratings.json` and the one that counts, the one in use | games; never commands, server or CLI ✓ |
| [sites/](../src/sites/) | The sites the player plays on: their public ratings on Lichess and Chess.com, read from the names in the profile, without a key, within one timeout; which speed counts | profiles (their types and the speeds), the version; never commands, server or CLI ✓ |
| [home/](../src/home/) | Where the player's data is: `Documents\My Games\Chesspal`, or `CHESSPAL_HOME`; opening it in the file manager | Node only |
| [host-files/](../src/host-files/) | What `chesspal init` writes for each AI host: the MCP server, the instructions, the hooks, the agents | core, games, and the files of `instructions/` |
| [commands/](../src/commands/) | The commands, the only way the AI, the command line and the page change a game, in folders by area: [registry/](../src/commands/registry/) defines a command and what it runs with (folders, time, randomness, the network); [answers/](../src/commands/answers/) holds what the commands share to answer the AI; [game/](../src/commands/game/), [talk/](../src/commands/talk/), [analysis/](../src/commands/analysis/), [profiles/](../src/commands/profiles/) and [setup/](../src/commands/setup/) the commands themselves. They depend one way only, by steps: registry; answers; setup, profiles and talk; game and analysis. A folder imports only the steps below its own ✓; [index.ts](../src/commands/index.ts) lists them all | core, games, profiles, sites, home, host-files |
| [cli/](../src/cli/) | The `chesspal` binary: the commands from the arguments, the table's words (`open`, `table`, `icon`, `play`), `mcp`, `listen`, `chat`; each loads the module it needs when it runs | commands, server's modules, and the modules below them |
| [server/mcp/](../src/server/mcp/) | The MCP server, every command as a tool, with the MCP SDK; who makes a tool call | commands, server/bell, server/page, server/table, and the modules below them |
| [server/bell/](../src/server/bell/) | The doorbell that wakes a chat when the player acts on the page, and the ports where a folder's page answers | games, home |
| [server/page/](../src/server/page/) | The board page's server: its files, its routes for the game, the profiles and the analyses, the events the pages listen to, the chat attached to the table, a newer Chesspal on npm | commands, server/bell, and the modules below them |
| [server/table/](../src/server/table/) | The table, the page in a process of its own (D-104): started by `chesspal` alone, opened in the browser, attached to by the chats; it updates Chesspal with npm and starts again (D-108) | server/page, server/bell, commands, and the modules below them |
| [server/table/hosts/](../src/server/table/hosts/) | The chats the table opens: Claude Code and Codex found on this computer, the terminal they open in, `chesspal play` and its seat | server/page, server/bell, commands, and the modules below them |
| [server/table/icon/](../src/server/table/icon/) | Chesspal's icon on the desktop and in the menu, on Windows, macOS and Linux | games, home |
| [page/](../src/page/) | The board page, in Preact: [main.tsx](../src/page/main.tsx) starts it, [text.ts](../src/page/text.ts) holds its words in Italian and English | the chess core alone ✓; the rest it asks the server for |
| [index.ts](../src/index.ts), [version.ts](../src/version.ts) | The package's public API, and its version | commands |

### The page's folders

The page's folders have no `index.ts`: they import each other's files directly, as one Preact app built on its own.

| Path | What it holds |
|---|---|
| [app/](../src/page/app/) | The app: what the server sends, the phase (game, analysis), the keys, the move kept in the address |
| [layout/](../src/page/layout/) | The header, the side columns and their drawers, the foot under the board with the version, the window the table opens, the icons of the app |
| [board/](../src/page/board/) | The board: squares, pieces in motion, the pointer, the marks and arrows |
| [pieces/](../src/page/pieces/) | The sets of pieces, one vector map each |
| [players/](../src/page/players/) | A player's card: picture, name, clock, pieces taken, the AI's model |
| [game/](../src/page/game/) | The game's column: move list, badges, opening, result, browsing a game |
| [talk/](../src/page/talk/) | The talk with the AI on the page, and the voice that reads it |
| [table/](../src/page/table/) | The chat at the table (D-104, D-107): its window, from the AI's name, that opens one or starts it again with another model or host, and what the page says while it does; the mark and the window of a newer Chesspal, and on a chat's own page its strip (D-108) |
| [dialogs/](../src/page/dialogs/) | The windows: who plays and the wizard, new game, settings, the analyses, a game to study |
| [guide/](../src/page/guide/) | The guide from the header's book, a page at a time with its index: its text in `it.md` and `en.md`, with the same headings, the markdown drawn as the page's elements, its drawings in `drawings/` (named in the markdown as `![what it shows](name)`), and the credits as its last page |
| [profile/](../src/page/profile/) | The profile and the settings as the server sends them, and the requests that change them |
| [helps/](../src/page/helps/), [legend/](../src/page/legend/), [lead/](../src/page/lead/) | The helps' card, the legend of the board's marks, who is ahead |
| [avatars/](../src/page/avatars/) | The player's drawn avatars and the AI's, the Torretta |
| [sounds/](../src/page/sounds/) | The board's sounds |

## 3. Where new code goes

- **A new operation** is a command in its area's folder of `commands/`, exported by that folder's `index.ts` and listed in `commands/index.ts`: the CLI and the MCP server get it from there. The page reaches it through a route in `server/page/` that calls the same command.
- **A rule or a fact of chess** goes in `core/`, browser-safe, so the page uses the same code.
- **Something kept on disk** goes in `games/` or `profiles/`, behind their index, written whole or not at all; the AI and the page change it only through a command.
- **Something from outside** (the time, randomness, folders, the network) comes in through `Context`, so the tests inject it.
- **Something on the page** goes in the folder of its part, or a new folder for a new part; it asks the server for anything that is not chess.
- **A new folder** gets its `index.ts`, outside the page, and a line on this page.
