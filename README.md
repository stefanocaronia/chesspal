# Chesspal

Play chess against an AI, or learn with one.

You can already play chess with an AI in a chat, but it forgets the position, plays illegal moves, sees no board and remembers nothing of yesterday's
game. Chesspal is what it lacks: it **keeps the rules, the board, the clock, the games and the memory**; the AI **plays, reasons, judges and talks**. A
move is legal because Chesspal checked it, not because the AI says so.

Chesspal does not use a chess engine such as Stockfish, in any way: every judgment of a move or a position is the AI's own. Chesspal hands it facts
instead, which a program finds in microseconds and an AI only by reasoning at length: the legal moves, the pieces attacked and defended, the pins and
the checks, the positional facts, the opening's name.

## What you can do

- **Play against the AI** in the chat, or on the board page in your browser, with the AI answering in both.
- **Choose its level**, from beginner to master: the higher, the more facts of the position the AI sees, and the master knows the opening book.
- **Play with a clock**, with an AI that knows how much time it has left; offer a draw, resign, export the game as PGN.
- **Keep a profile** for each player at the same computer, with their games.

Coming later: an AI coach that helps you grow, the discursive analysis of your games, exercises chosen on your weak points, a rating worked out from your
games, and an opponent with a character and moods of its own.

## Status

Chesspal is in early development: the version on npm only holds its name. It works with any AI agent that uses MCP tools and can work with the files on your computer;
we develop it with Claude Code, and Codex is connected too. Chesspal never uses an API key: the AI runs on your agent's own plan, or on your computer
with a local model.

## How it works

Chesspal is an MCP server, a command line, `chesspal`, and a board page, all made from the same commands. `chesspal init` sets up a folder to play in:
the few files that tell the AI agent where Chesspal is, and its instructions as an opponent. The game lives in that folder, on disk, and only
Chesspal's commands change it: they check every move with [chess.js](https://github.com/jhlywa/chess.js) and write atomically. In Codex, allow Chesspal's two
hooks in `/hooks` the first time: small helpers that let it notice your moves on the board page.

## Development

You need Node.js 22.13 or newer.

```bash
git clone https://github.com/stefanocaronia/chesspal.git
cd chesspal
npm install
npm run build
npm test
```

- `npm run lint` checks the formatting and the types, as CI does; `npm run format` formats the code.
- `npm run page -- <folder>` serves the board page of a player's folder, to look at it while it is built.
- `npm run endings` shows the ends of a game on the board: checkmate, resignation, a flag fallen, the draws.
- `npm run bench` times the commands against their budgets.

[AGENTS.md](AGENTS.md) is the guide for development: the layout, the architecture's rules, performance, the coding guidelines. It is written for AI
coding agents and people alike.

## Credits

- The rules: [chess.js](https://github.com/jhlywa/chess.js), under the BSD 2-Clause license.
- The openings' names: Lichess's [chess-openings](https://github.com/lichess-org/chess-openings), under CC0.
- The pieces: the Torretta and Nitida sets are Chesspal's own; cburnett is by Colin M.L. Burnett, under the BSD 3-Clause license.
  [The piece sets' credits](src/page/pieces/CREDITS.md) name every author, licence and source.

Chesspal ships only original or open-licensed content, and no GPL dependency.

## License

[MIT](LICENSE).

## Development notes

Developed with the help of AI coding agents. Everything is designed, reviewed and tested by the project's human maintainer.

**We encourage everyone to use AI for their own purposes.**\
The means of production should belong to the people.\
Fight corporate control of technology, not our right to use it.

---

© 2026 [Stefano Caronia](https://stefanocaronia.it) · [GitHub](https://github.com/stefanocaronia/chesspal)
