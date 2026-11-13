# Chesspal: the guide

With **Chesspal** you play chess against an **AI**, on a real board, and learn with it. This guide is for players: you do not need to know how to program.

## How it works

![The page with the board and the AI's chat window, joined by a thread](how-it-works)

| Who | What they do |
|---|---|
| **You** | You move on the board and talk with the AI. |
| **The AI** | Plays, reasons, judges the moves and answers you, in its chat. |
| **Chesspal** | Keeps the rules, the board, the clock and your games, and hands the AI the facts of the position. |

There are two windows: this **page**, with the board, and the AI's **chat**, in a window of its own. The AI plays from there, and Chesspal connects it to the page.

No chess engine plays for the AI: every move and every judgment is its own. Chesspal checks that each move is legal and tells the AI what is on the board: the pieces attacked and defended, the pins, the opening's name.

### Getting started

1. Click the **AI's name**, at the top left, and choose its chat among those on your computer: **Claude Code** or **Codex**. It opens in a window of its own: keep it open while you play. The first time it asks some questions. Whether you trust the folder: **Yes** (in Claude Code No is chosen already: go down to Yes with the arrow keys, then Enter). With Codex, about the hooks, Chesspal's two helpers: **Trust all and continue**. On Windows Codex also asks whether to set up its sandbox, the protected space it works in: choose the first option, and yes when Windows asks for permission.
2. Press **New game**, choose your colour, the clock and the AI's level, and press **Start**.
3. Move: the AI answers on the board, and with a few words under its name.

## The game

![The board with the dots of the legal moves and a piece moving](game)

- **Move** by dragging a piece, or by clicking the piece and then its square. The dots show the legal moves; when a move is not allowed, the page says why.
- **The clock**, if you chose one, starts with **Start**. The AI has its own and knows how much time it has left.
- **Offer a draw** on your turn, once each side has moved; **Resign** ends the game.
- **Flip** turns the board round; **PGN** saves the moves in the file every chess site reads, to open on Lichess or Chess.com.

## Talking with the AI

![The box to write in under the AI's name, and its answer](talk)

- You talk with the AI in the **box under its name**, a few words with each move: it reads them with your move. You can also write to it in its window.
- A **move written** in the chat counts too: `e4`, `Nf3`, with the English letters of the pieces (K Q R B N), or in words.
- **The AI's name** opens the choice of its chat: Claude Code or Codex, the model (which AI: some are faster, others stronger) and how much it reasons. The more it reasons, the slower it plays. If you change them, the chat starts afresh in the same window: the AI forgets what you talked about, and the game stays as it is.
- At each **new game**, the chat the page opened starts afresh by itself, once the AI has stopped thinking: a long chat makes the AI slower.

## Helps and marks

![Coloured arrows and badges on the board, beside the helps' card](helps)

- With **"The AI teaches as you play"**, in the settings, the **Helps** card shows the pieces in danger, the pins and the pawns, and the AI, as your coach, gives you an idea.
- The AI draws **coloured arrows** on the board: the **?** beside the moves explains every mark.
- In the review, a **badge** on a move gives the AI's judgment: a great move, an inaccuracy, a blunder.

## Review and analysis

![The bar that steps through the moves, and the judgments on the moves](analysis)

- When the game is over, press **Analyse the game**: the AI goes over it and puts its judgments and notes on the moves. Read them by stepping through the moves with the arrows at the foot of the column, or by clicking a move.
- **Analyses**, in the header, opens your analyses, and loads a game played elsewhere: paste its PGN, or choose a .pgn file.
- With your names on Lichess and Chess.com in your profile, **Load a game** lists your latest games there: click one to analyse it.
- Ask the AI about the game in the box under its name.
- **Annotated PGN** saves the game with its comments.

## Players and profile

![Your picture at the top right and the Who's playing? window](players)

- **Who's playing?**: your picture at the top right, or your name beside the board, opens the list of the players: there you choose one or add one. Each has their own games and settings.
- **Your profile**: in **Who's playing?**, the pencil beside your name changes your picture, your name, how you play, your names on Lichess and Chess.com and your FIDE rating.
- **Your rating**: from your names there, Chesspal reads your public rating, the one of your rapid games if you play them, and tells the AI. No passwords: anyone can see that rating on the site. Without a name there, the AI knows how you play from **How do you play?**
- **Your FIDE rating**, if you play tournaments, you type yourself: no site gives it to Chesspal. The AI reads it beside the site's, each on its own.
- If you load a game played on Lichess or Chess.com, Chesspal knows which colour you played.

## Questions and problems

- **The AI does not answer, and its clock runs**: look at its window, which may have gone behind the others: find it in the bar at the bottom. If it is asking you something, answer there; if you closed it, click the AI's name and open another.
- **The AI is slow**: it really thinks over each move. From its name, choose a faster model, or less reasoning.
- **A piece does not move**: it is not your turn, or the move is not allowed; the page says why.
- **Closed the page?** Open it again from Chesspal's icon, on the desktop or in the menu: the game you left halfway is still there.
- **Your games** are in a folder on your computer: **Who's playing?**, from your picture at the top right, shows where, and **Open the folder** opens it. For a backup copy it, with the chat and the page closed.
- **A new version of Chesspal**: an arrow at the top tells you, and installs it between games.
- **What it costs**: Chesspal is free; the AI uses your own subscription, and you pay nothing more.
- **Can the AI play an illegal move?** No: Chesspal checks every move. Its judgments are its own, though, and an AI can be wrong, like a person.
- **Something does not work?** Tell us on [GitHub](https://github.com/stefanocaronia/chesspal/issues): what you did, what you expected, what happened. GitHub is the site where Chesspal is made: you write there with a free account, and anyone can read it.
