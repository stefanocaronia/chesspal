# Chesspal: la guida

Con **Chesspal** giochi a scacchi contro un'**AI**, su una scacchiera vera nel browser, e impari con lei. Questa guida è per chi gioca: non serve saper programmare.

## Come funziona

| Chi | Cosa fa |
|---|---|
| **Tu** | Muovi sulla scacchiera e parli con l'AI. |
| **L'AI** | Gioca, ragiona, giudica le mosse e ti risponde, nella sua chat. |
| **Chesspal** | Tiene le regole, la scacchiera, l'orologio e le tue partite, e passa all'AI i fatti della posizione. |

Le finestre sono due: questa **pagina**, con la scacchiera, e la **chat** dell'AI, in una finestra a parte. L'AI gioca da lì, e Chesspal la collega alla pagina.

Nessun motore di scacchi gioca al posto dell'AI: ogni mossa e ogni giudizio sono suoi. Chesspal controlla che ogni mossa sia legale e dice all'AI cosa c'è sulla scacchiera: i pezzi attaccati e difesi, le inchiodature, il nome dell'apertura.

## Avvio rapido

1. Installa **Node.js** da [nodejs.org](https://nodejs.org), la versione consigliata (LTS), e un'AI col tuo abbonamento: **Claude Code** o **Codex**.
2. Apri un terminale, la finestra dove si scrivono i comandi (su Windows il Prompt dei comandi: tasto Start, scrivi `cmd`, Invio; su macOS il Terminale), e scrivi `npm install -g chesspal`, poi `chesspal`: si apre questa pagina. La prima volta ti propone un'icona sul desktop, per aprirla con un doppio clic.
3. Premi **Claude Code** o **Codex**: la chat dell'AI si apre in una finestra sua. Tienila aperta mentre giochi.
4. Premi **Nuova partita**, scegli il colore, l'orologio e il livello dell'AI, e premi **Inizia**.

## Se ti sei perso

- **L'AI non risponde**: guarda la sua finestra. Se ti sta chiedendo qualcosa, rispondi lì; se l'hai chiusa, premi di nuovo **Claude Code** o **Codex**.
- **La pagina non si apre**: fai doppio clic sull'icona di Chesspal, o aprila come nell'[Avvio rapido](#quick-start).
- **Le tue partite** stanno in una cartella sul tuo computer: **Chi gioca?**, dalla tua immagine in alto a destra, dice dove, e **Apri la cartella** la apre.

## La chat dell'AI

- La pagina apre la **chat** dell'AI coi suoi pulsanti, in una finestra a parte: lì l'AI pensa e scrive. Accanto ai pulsanti scegli il modello (la versione dell'AI) e quanto ragiona: più ragiona, più gioca lenta.
- Parli con l'AI nella casella sotto il suo nome, qualche parola a ogni mossa: le legge con la tua mossa. Puoi scriverle anche nella sua finestra.
- Anche una **mossa scritta** nella chat vale: `e4`, `Nf3`, con le lettere inglesi dei pezzi (K Q R B N), o a parole.
- A ogni **nuova partita** la chat aperta dalla pagina riparte pulita da sola, se l'AI ha finito di pensare: una chat lunga rende l'AI più lenta.

## La partita

- **Muovi** trascinando un pezzo, o cliccando il pezzo e poi la sua casa. I pallini segnano le mosse legali; quando una mossa è vietata, la pagina dice perché.
- **L'orologio**, se ne hai scelto uno, parte con **Inizia**. Anche l'AI ha il suo, e sa quanto tempo le resta.
- **Proponi patta** nel tuo turno, dopo una mossa a testa; **Abbandona** chiude la partita.
- **Gli aiuti**: con «L'AI ti insegna mentre giochi», nelle impostazioni, la scheda **Aiuti** mostra i pezzi in pericolo, le inchiodature e i pedoni, e l'AI, da allenatore, ti dà un'idea. L'AI disegna frecce colorate sulla scacchiera: il **?** accanto alle mosse spiega ogni segno.
- **Gira** volta la scacchiera; **PGN** salva le mosse nel file che leggono tutti i siti di scacchi, da aprire su Lichess o Chess.com.

## Il ripasso e l'analisi

- A partita finita premi **Analizza la partita**: l'AI la ripassa e mette sulle mosse i suoi giudizi e le sue note. Le leggi scorrendo le mosse con le frecce.
- **Analisi**, nell'intestazione, apre le tue analisi e carica una partita giocata altrove: incolla il suo PGN, o scegli un file .pgn.
- Chiedi all'AI della partita nella casella sotto il suo nome.
- **PGN annotato** salva la partita coi commenti.

## I giocatori e il profilo

- **Chi gioca?**: la tua immagine in alto a destra sceglie un giocatore o ne aggiunge uno. Ognuno ha le sue partite e le sue impostazioni.
- **Il tuo profilo**: un clic sulla tua immagine accanto alla scacchiera, o la matita in **Chi gioca?**, cambia la tua immagine, il nome, come giochi e i tuoi nomi su Lichess e Chess.com.
- **Il tuo punteggio**: dai tuoi nomi lì, Chesspal legge il tuo punteggio pubblico, quello delle partite rapide se le giochi, e lo dice all'AI. Niente password: quel punteggio lo vede chiunque sul sito. Senza un nome lì, l'AI sa come giochi da **Come giochi?**
- Se carichi una partita giocata su Lichess o Chess.com, Chesspal sa da che colore giocavi tu.

## Domande e problemi

- **L'AI è lenta**: ogni mossa la pensa davvero. Scegli un modello più veloce, o meno ragionamento, accanto ai pulsanti della chat.
- **Quanto costa**: Chesspal è gratis; l'AI usa il tuo abbonamento, e non paghi niente in più.
- **L'AI può fare una mossa illegale?** No: Chesspal controlla ogni mossa. I suoi giudizi però sono suoi, e un'AI può sbagliare, come una persona.
- **Un backup**: copia la cartella delle tue partite, con la chat e la pagina chiuse.
- **Qualcosa non va?** Raccontacelo su [GitHub](https://github.com/stefanocaronia/chesspal/issues): cosa hai fatto, cosa ti aspettavi, cosa è successo. GitHub è il sito dove si fa Chesspal: ci scrivi con un account gratuito, e chiunque può leggere.
