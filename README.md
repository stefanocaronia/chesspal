# Chesspal

Play chess against an AI on a real board, or learn with one.

![The board page during a game: the AI's words on the left, the board in the middle, the opening's name and the moves on the right](https://raw.githubusercontent.com/stefanocaronia/chesspal/main/docs/screenshot.png)

## Get started

Five steps, done once, in about 15 minutes. You need a paid Claude plan or a ChatGPT account. After these steps you open the board with a double click.

**1. Install Node.js.** Download it from [nodejs.org](https://nodejs.org): take the version marked **LTS**, the steady one (22.13 or newer). Install it like any program, keeping every choice as it is; on Windows, leave the box "Automatically install the necessary tools" unticked.

**2. Open a terminal**, the window where you type commands. Open it after installing Node.js: one opened before does not find it.

- **Windows:** press Start, type `cmd` and press Enter. This opens Command Prompt. Use it rather than PowerShell: on a new computer PowerShell refuses these commands with "running scripts is disabled on this system".
- **macOS:** press ⌘ and Space, type `Terminal` and press Enter.

In the steps below, copy each command, paste it in the terminal (Ctrl+V or right-click; on macOS ⌘V) and press Enter. Wait for the terminal to finish before the next one. Lines with "WARN" are normal: go on.

**3. Install the AI and sign in.** Choose one of the two. You need your own subscription: Chesspal never uses an API key, which is paid by the call.

- **Claude Code**, with a paid Claude plan (Pro or higher; the free plan does not include it):

  ```bash
  npm install -g @anthropic-ai/claude-code
  claude
  ```

  `claude` asks a few questions first, such as the colours you prefer: press Enter to keep the first choice. Then it opens your browser: sign in with your Claude account and go back to the terminal.
- **Codex**, with a ChatGPT account:

  ```bash
  npm install -g @openai/codex
  codex
  ```

  Choose **Sign in with ChatGPT** and sign in in your browser.

Once you are signed in, close that terminal window with its × and open a new one, as in step 2.

**4. Install Chesspal and open it.**

```bash
npm install -g chesspal
chesspal
```

The board page opens in your browser, and you can close this terminal. The first time, Chesspal offers an icon on your desktop and in your menu of programs: accept it, and from then on you open the board with a double click on it, with no terminal.

**5. Start the AI.** The first time, the board page asks who you are: fill it in and press **Start playing**. Then press **Claude Code** or **Codex**: the AI opens in a terminal of its own. Keep that window open while you play. The first time it asks some questions:

- whether you trust the folder: choose **Yes** with the arrow keys and press Enter;
- with Codex, about Chesspal's two hooks, the small programs that tell the AI when you move on the board: choose **Trust all and continue**;
- with Codex on Windows, whether to set up its sandbox, a safe space where it works: choose the first option, and answer yes when Windows asks for permission.

Now press **New game**: choose your colour, the clock and the AI's level, and play on the board. Talk with the AI on the board page or in its terminal.

**If a command fails:**

- "npm is not recognized" or "command not found": close the terminal and open a new one; if it still fails, install Node.js again.
- On macOS, "EACCES" or "permission denied": npm cannot write where Node.js put it. Follow [npm's guide](https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally), not `sudo`: with `sudo`, Chesspal and Claude Code cannot update themselves.
- Anything else in red, or with "ERR!": copy the last lines and [tell us](#try-it-and-tell-us).

## What it does

An AI in a plain chat forgets the position, plays illegal moves and sees no board. Chesspal is what it lacks: it **keeps the rules, the board, the clock and your games**; the AI **plays, reasons and talks**. Every move is checked by Chesspal, and no chess engine plays for the AI: every judgment is its own, made from the facts Chesspal hands it, such as the legal moves, the pieces attacked and defended, the pins and the opening's name.

- **Play on a board** in your browser, and talk with the AI there or in the chat.
- **Choose its level**, from beginner to master: the higher, the more of the position the AI sees.
- **Play with a clock**, against an AI that knows how much time it has left; offer a draw, resign, save the game as PGN.
- **Go over a game** with the AI when it is over: its notes show on the board page, in Analyses. Games from other sites come in as PGN files.
- **Keep a profile** for each player at the same computer, with their games.

Coming later: an AI coach that helps you grow, exercises chosen on your weak points, a rating worked out from your games, an opponent with a character and moods of its own, and local models.

## What you need

- **Node.js 22.13** or newer.
- **An AI agent** with your own subscription: [Claude Code](https://code.claude.com/docs/en/setup), with a paid Claude plan, or [Codex](https://developers.openai.com/codex), with a ChatGPT account.
- **A web browser**, for the board page.

Chesspal works with any agent that can use Chesspal's tools (MCP) and the files on your computer: we develop it with Claude Code, and Codex is connected too.

## Good to know

- **For the next game**, press New game: the AI the board page opened starts again with a clean chat by itself, once it has stopped working. In a chat you opened yourself, type `/clear` first: a long chat makes the AI slower and costs you more.
- **To play in a folder of your own**, as with the Claude desktop app, type `chesspal init chess`, then open your agent in the folder `chess` and say hello: the AI answers with the link to the board page. Any name will do; your games are kept [elsewhere](#where-your-games-are).
- **A move written in the chat** counts too: `e4`, `Nf3`, in the international notation (K Q R B N in every language), or in words.
- **To update**, when a new version is out the table's page shows an arrow at the top: press it between games, and the table installs it and starts again, with its chat. By hand: close the AI's terminal, run `npm install -g chesspal` again, then `chesspal`. In a folder of your own, run `chesspal init` there too: it updates its own lines and keeps what you wrote there. In Codex, allow the hooks again when it says so.

## Where your games are

In one folder for every folder you play in:

- Windows: `Documents › My Games › Chesspal`, inside OneDrive if you use it;
- macOS: `Documents › Chesspal`; Linux: `Chesspal` in your Documents folder.

The board page shows where, and its **Open the folder** button opens it. To back up your games, copy that whole folder; to move them to another computer, put the copy in the same place there. Do it with the chat and the board page closed.

## Try it, and tell us

Chesspal is in early development: the version on npm is a first one to try, and it may change from one release to the next. When something breaks, confuses you or could work better, open an [issue on GitHub](https://github.com/stefanocaronia/chesspal/issues): what you did, what you expected, what happened.

## Development

Chesspal is an MCP server, a command line and a board page, all made from the same commands, which check every move with [chess.js](https://github.com/jhlywa/chess.js) and write the games atomically.

```bash
git clone https://github.com/stefanocaronia/chesspal.git
cd chesspal
npm install
npm run build
npm test
```

[The guide for development](https://github.com/stefanocaronia/chesspal/blob/main/AGENTS.md), for people and AI coding agents alike, holds the other scripts, the layout, the architecture's rules and the coding guidelines.

## Credits

- The rules: [chess.js](https://github.com/jhlywa/chess.js), under the BSD 2-Clause license.
- The openings' names: Lichess's [chess-openings](https://github.com/lichess-org/chess-openings), under CC0.
- The pieces: Nitida, Torretta and Capablanca are Chesspal's own, the last after the diagrams of Capablanca's *Chess Fundamentals* (1921), in the public domain; they are free to use under CC BY 4.0, crediting "Stefano Caronia, Chesspal". [The piece sets' credits](https://github.com/stefanocaronia/chesspal/blob/main/src/page/pieces/CREDITS.md).

Chesspal ships only original or open-licensed content, and no GPL dependency.

## License

[MIT](https://github.com/stefanocaronia/chesspal/blob/main/LICENSE).

## Development notes

Developed with the help of AI coding agents. Everything is designed, reviewed and tested by the project's human maintainer.

**We encourage everyone to use AI for their own purposes.**\
The means of production should belong to the people.\
Fight corporate control of technology, not our right to use it.

---

© 2026 [Stefano Caronia](https://stefanocaronia.it) · [GitHub](https://github.com/stefanocaronia/chesspal) · [npm](https://www.npmjs.com/package/chesspal)
