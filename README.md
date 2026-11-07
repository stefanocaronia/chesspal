# Chesspal

Play chess against an AI, or learn with one.

You can already play chess with an AI in a chat, but it forgets the position, plays illegal moves, sees no board and remembers nothing of yesterday's
game. Chesspal is what it lacks: it **keeps the rules, the board, the clock, the games and the memory**; the AI **plays, reasons, judges and talks**. A
move is legal because Chesspal checked it, not because the AI says so.

Chesspal does not use a chess engine such as Stockfish, in any way: every judgment of a move or a position is the AI's own. Chesspal hands it facts
instead, which a program finds in microseconds and an AI only by reasoning at length: the legal moves, the pieces attacked and defended, the pins and
the checks, the positional facts, the opening's name.

## What you can do

- **Play against the AI** on the board page in your browser, and talk with it there or in the chat.
- **Choose its level**, from beginner to master: the higher, the more facts of the position the AI sees, and the master knows the opening book.
- **Play with a clock**, with an AI that knows how much time it has left; offer a draw, resign, export the game as PGN.
- **Keep a profile** for each player at the same computer, with their games.

Coming later: an AI coach that helps you grow, the discursive analysis of your games, exercises chosen on your weak points, a rating worked out from your
games, and an opponent with a character and moods of its own.

## Status

Chesspal is in early development: the version on npm only holds its name. It works with any AI agent that uses MCP tools and can work with the files on your computer;
we develop it with Claude Code, and Codex is connected too. Chesspal never uses an API key: the AI runs on your agent's own plan, or on your computer
with a local model.

## Play

Chesspal is not on npm yet ([Status](#status)): these steps are for its first release.

**What you need**

- [Node.js](https://nodejs.org) 22.13 or newer: download the version marked LTS and install it like any program.
- An AI agent on your computer: [Claude Code](https://code.claude.com/docs/en/setup), in a terminal or in the Code tab of the Claude desktop app, or
  [Codex](https://developers.openai.com/codex). The AI runs on what you already pay for your agent, such as your Claude or ChatGPT subscription:
  Chesspal asks for no API key.
- A terminal, opened after installing Node.js: on Windows, Command Prompt (press Start, type `cmd`, press Enter), since PowerShell refuses npm's
  commands until its scripts are allowed (there, `npm.cmd` and `chesspal.cmd` work in their place); on a Mac, Terminal, in Applications › Utilities.

**Your first game**

1. **Install Chesspal**:

   ```bash
   npm install -g chesspal
   ```

2. **Make a folder to play in**: this makes the folder `chess`, with the few files that tell your agent where Chesspal is and how to play. Any name
   will do; your games are not kept there but in [one folder for all](#where-your-games-are).

   ```bash
   chesspal init chess
   ```

3. **Open your agent in that folder**: type `cd chess`, which takes the terminal into it, then `claude` or `codex`; in the Claude desktop app, choose
   the folder in the Code tab. The first time, it asks whether to trust the folder: say yes. In Codex, also type `/hooks` and allow Chesspal's two
   hooks: small helpers that let it notice your moves on the board page.

4. **Say hello**: the AI gives you the link to the board page, a page on your own computer; open it in your browser. No link? Ask the AI for the
   board. The first time, the page asks who you are: your name, a picture, how well you play.

5. **Ask for a game**: the New game window opens on the page, where you choose your colour, the clock and the AI's level. Play on the board: that is
   where the game is. A move written in the chat counts too, `e4`, `Nf3`, with your language's letters (`Cf3` in Italian) or in words. The page's
   settings can keep English letters in any language.

6. **For the next game**, type `/clear` in the chat, or start a new chat: a long chat makes the AI slower and costs you more.

When a game is over, ask the AI to go over it with you: its notes show on the board page, in Analyses. A game you played on another site comes in
there too: download it from that site as a PGN file and open it in Analyses.

**To update Chesspal**, close the chat, run `npm install -g chesspal` again, then `chesspal init` in your folder: it updates its own lines and keeps
what you wrote there. In Codex, when `chesspal init` says so, allow Chesspal's hooks again in `/hooks`.

## How it works

Chesspal is an MCP server, a command line, `chesspal`, and a board page, all made from the same commands. `chesspal init` sets up a folder to play in:
the few files that tell the AI agent where Chesspal is, and its instructions as an opponent. Your profiles, games and analyses live in one folder for
every folder you play in ([where your games are](#where-your-games-are)), or in the folder `CHESSPAL_HOME` names, for tests. Only Chesspal's commands
change them: they check every move with [chess.js](https://github.com/jhlywa/chess.js) and write atomically.

## Where your games are

Your players and their games are in one folder, the same whatever folder you open the chat in:

- on Windows, `Documents › My Games › Chesspal`. Explorer may show Documents in your language, such as Documenti. With OneDrive, it is inside
  OneDrive, which also keeps a copy online;
- on macOS, `Documents › Chesspal`; on Linux, `Chesspal` in your Documents folder, whatever its name in your language.

The board page says where it is, on its welcome page and in "Who's playing?", and its **Open the folder** button opens it.

**A backup** is a copy of the whole `Chesspal` folder, on a USB stick for example. **To move to another computer**, install Chesspal there and put the
copied `Chesspal` folder in the same place, replacing the one Chesspal may have made already: your players, their games and a game left unfinished all
come with it. Copy it with the chat and the board page closed.

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
- `npm run page -- <folder>` serves the board page of a player's folder, with the data of `CHESSPAL_HOME` or Documents, to look at it while it is built.
- `npm run endings` shows the ends of a game on the board: checkmate, resignation, a flag fallen, the draws.
- `npm run bench` times the commands against their budgets.
- `npm run smoke`, after the build, packs the package, installs it in a temporary folder and runs it as a player would: its version, `chesspal init`
  and its MCP server, as CI does.

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
