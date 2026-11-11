# Chesspal: the guide

With **Chesspal** you play chess against an **AI**, on a real board in your browser, and learn with it. This guide is for players: you do not need to know how to program.

## How it works

| Who | What they do |
|---|---|
| **You** | You move on the board and talk with the AI. |
| **The AI** | Plays, reasons, judges the moves and answers you, in its chat. |
| **Chesspal** | Keeps the rules, the board, the clock and your games, and hands the AI the facts of the position. |

There are two windows: this **page**, with the board, and the AI's **chat**, in a window of its own. The AI plays from there, and Chesspal connects it to the page.

No chess engine plays for the AI: every move and every judgment is its own. Chesspal checks that each move is legal and tells the AI what is on the board: the pieces attacked and defended, the pins, the opening's name.

## Quick start

1. Install **Node.js** from [nodejs.org](https://nodejs.org), the recommended (LTS) version, and an AI with your own subscription: **Claude Code** or **Codex**.
2. Open a terminal, the window where you type commands (on Windows, Command Prompt: press Start, type `cmd`, press Enter; on macOS, Terminal), and type `npm install -g chesspal`, then `chesspal`: this page opens. The first time it offers an icon on your desktop, to open it with a double click.
3. Press **Claude Code** or **Codex**: the AI's chat opens in a window of its own. Keep it open while you play.
4. Press **New game**, choose your colour, the clock and the AI's level, and press **Start**.

## If you are lost

- **The AI does not answer**: look at its window. If it is asking you something, answer there; if you closed it, press **Claude Code** or **Codex** again.
- **The page does not open**: double-click Chesspal's icon, or open it as in the [Quick start](#quick-start).
- **Your games** are in a folder on your computer: **Who's playing?**, from your picture at the top right, shows where, and **Open the folder** opens it.

## The AI's chat

- The page opens the AI's **chat** with its buttons, in a window of its own: there the AI thinks and writes. Beside the buttons you choose its model (the version of the AI) and how much it reasons: the more it reasons, the slower it plays.
- You talk with the AI in the box under its name, a few words with each move: it reads them with your move. You can also write to it in its window.
- A **move written** in the chat counts too: `e4`, `Nf3`, with the English letters of the pieces (K Q R B N), or in words.
- At each **new game**, the chat the page opened starts again clean by itself, once the AI has stopped thinking: a long chat makes the AI slower.

## The game

- **Move** by dragging a piece, or by clicking the piece and then its square. The dots show the legal moves; when a move is not allowed, the page says why.
- **The clock**, if you chose one, starts with **Start**. The AI has its own and knows how much time it has left.
- **Offer a draw** on your turn, once each side has moved; **Resign** ends the game.
- **The helps**: with "The AI teaches as you play", in the settings, the **Helps** card shows the pieces in danger, the pins and the pawns, and the AI, as your coach, gives you an idea. The AI draws coloured arrows on the board: the **?** beside the moves explains every mark.
- **Flip** turns the board round; **PGN** saves the moves in the file every chess site reads, to open on Lichess or Chess.com.

## Review and analysis

- When the game is over, press **Analyse the game**: the AI goes over it and puts its judgments and notes on the moves. Read them by stepping through the moves with the arrows.
- **Analyses**, in the header, opens your analyses, and loads a game played elsewhere: paste its PGN, or choose a .pgn file.
- Ask the AI about the game in the box under its name.
- **Annotated PGN** saves the game with its comments.

## Players and profile

- **Who's playing?**: your picture at the top right chooses a player or adds one. Each has their own games and settings.
- **Your profile**: a click on your picture beside the board, or the pencil in **Who's playing?**, changes your picture, your name, how you play and your names on Lichess and Chess.com.
- **Your rating**: from your names there, Chesspal reads your public rating, the one of your rapid games if you play them, and tells the AI. No passwords: anyone can see that rating on the site. Without a name there, the AI knows how you play from **How do you play?**
- If you load a game played on Lichess or Chess.com, Chesspal knows which colour you played.

## Questions and problems

- **The AI is slow**: it really thinks over each move. Choose a faster model, or less reasoning, beside the chat's buttons.
- **What it costs**: Chesspal is free; the AI uses your own subscription, and you pay nothing more.
- **Can the AI play an illegal move?** No: Chesspal checks every move. Its judgments are its own, though, and an AI can be wrong, like a person.
- **A backup**: copy the folder of your games, with the chat and the page closed.
- **Something does not work?** Tell us on [GitHub](https://github.com/stefanocaronia/chesspal/issues): what you did, what you expected, what happened. GitHub is the site where Chesspal is made: you write there with a free account, and anyone can read it.
