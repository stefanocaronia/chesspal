# Chesspal: la guida

Con **Chesspal** giochi a scacchi contro un'**AI**, su una scacchiera vera, e impari con lei. Questa guida è per chi gioca: non serve saper programmare.

## Come funziona

![La pagina con la scacchiera e la finestra della chat dell'AI, unite da un filo](how-it-works)

| Chi | Cosa fa |
|---|---|
| **Tu** | Muovi sulla scacchiera e parli con l'AI. |
| **L'AI** | Gioca, ragiona, giudica le mosse e ti risponde, nella sua chat. |
| **Chesspal** | Tiene le regole, la scacchiera, l'orologio e le tue partite, e passa all'AI i fatti della posizione. |

Le finestre sono due: questa **pagina**, con la scacchiera, e la **chat** dell'AI, in una finestra a parte. L'AI gioca da lì, e Chesspal la collega alla pagina.

Nessun motore di scacchi gioca al posto dell'AI: ogni mossa e ogni giudizio sono suoi. Chesspal controlla che ogni mossa sia legale e dice all'AI cosa c'è sulla scacchiera: i pezzi attaccati e difesi, le inchiodature, il nome dell'apertura.

### Per cominciare

1. Clicca il **nome dell'AI**, in alto a sinistra, e scegli la chat fra quelle che hai sul computer: **Claude Code** o **Codex**. Si apre in una finestra sua: tienila aperta mentre giochi. La prima volta fa qualche domanda. Se ti fidi della cartella: **Sì** (in Claude Code è già scelto No: scendi su Yes con le frecce, poi Invio). Con Codex, sugli hook, i due aiutanti di Chesspal: **Trust all and continue**. Su Windows Codex chiede anche se preparare la sua sandbox, lo spazio protetto dove lavora: scegli la prima opzione, e sì quando Windows chiede il permesso.
2. Premi **Nuova partita**, scegli il colore, l'orologio e il livello dell'AI, e premi **Inizia**.
3. Muovi: l'AI risponde sulla scacchiera, e con qualche parola sotto il suo nome.

## La partita

![La scacchiera coi pallini delle mosse legali e un pezzo che si sposta](game)

- **Muovi** trascinando un pezzo, o cliccando il pezzo e poi la sua casa. I pallini segnano le mosse legali; quando una mossa è vietata, la pagina dice perché.
- **L'orologio**, se ne hai scelto uno, parte con **Inizia**. Anche l'AI ha il suo, e sa quanto tempo le resta.
- **Proponi patta** nel tuo turno, dopo una mossa a testa; **Abbandona** chiude la partita.
- **Gira** volta la scacchiera; **PGN** salva le mosse nel file che leggono tutti i siti di scacchi, da aprire su Lichess o Chess.com.

## Parlare con l'AI

![La casella per scrivere sotto il nome dell'AI, e la sua risposta](talk)

- Parli con l'AI nella **casella sotto il suo nome**, qualche parola a ogni mossa: le legge con la tua mossa. Puoi scriverle anche nella sua finestra.
- Anche una **mossa scritta** nella chat vale: `e4`, `Nf3`, con le lettere inglesi dei pezzi (K Q R B N), o a parole.
- **Il nome dell'AI** apre la scelta della chat: Claude Code o Codex, il modello (quale AI: alcune sono più veloci, altre più forti) e quanto ragiona. Più ragiona, più gioca lenta. Se cambi, la chat riparte da capo nella stessa finestra: l'AI dimentica la chiacchierata di prima, la partita resta com'è.
- A ogni **nuova partita** la chat aperta dalla pagina riparte da capo da sola, se l'AI ha finito di pensare: una chat lunga rende l'AI più lenta.

## Gli aiuti e i segni

![Frecce colorate e bollini sulla scacchiera, accanto alla scheda degli aiuti](helps)

- Con **«L'AI ti insegna mentre giochi»**, nelle impostazioni, la scheda **Aiuti** mostra i pezzi in pericolo, le inchiodature e i pedoni, e l'AI, da allenatore, ti dà un'idea.
- L'AI disegna **frecce colorate** sulla scacchiera: il **?** accanto alle mosse spiega ogni segno.
- Nel ripasso, un **bollino** su una mossa dice il giudizio dell'AI: un'ottima mossa, un'imprecisione, un errore grave.

## Il ripasso e l'analisi

![La barra per scorrere le mosse e i giudizi sulle mosse](analysis)

- A partita finita premi **Analizza la partita**: l'AI la ripassa e mette sulle mosse i suoi giudizi e le sue note. Le leggi scorrendo le mosse con le frecce in fondo alla colonna, o cliccando una mossa.
- **Analisi**, nell'intestazione, apre le tue analisi e carica una partita giocata altrove: incolla il suo PGN, o scegli un file .pgn.
- Con i tuoi nomi su Lichess e Chess.com nel profilo, **Carica una partita** elenca le tue ultime partite là: clicca su una per analizzarla.
- Chiedi all'AI della partita nella casella sotto il suo nome.
- **PGN annotato** salva la partita coi commenti.

## I giocatori e il profilo

![La tua immagine in alto a destra e la finestra Chi gioca?](players)

- **Chi gioca?**: la tua immagine in alto a destra, o il tuo nome accanto alla scacchiera, apre l'elenco dei giocatori: lì ne scegli uno o ne aggiungi uno. Ognuno ha le sue partite e le sue impostazioni.
- **Il tuo profilo**: in **Chi gioca?**, la matita accanto al tuo nome cambia la tua immagine, il nome, come giochi, i tuoi nomi su Lichess e Chess.com e il tuo punteggio FIDE.
- **Il tuo punteggio**: dai tuoi nomi lì, Chesspal legge il tuo punteggio pubblico, quello delle partite rapide se le giochi, e lo dice all'AI. Niente password: quel punteggio lo vede chiunque sul sito. Senza un nome lì, l'AI sa come giochi da **Come giochi?**
- **Il punteggio FIDE**, se giochi tornei, lo scrivi tu: nessun sito lo dà a Chesspal. L'AI lo legge accanto a quello del sito, ognuno per sé.
- Se carichi una partita giocata su Lichess o Chess.com, Chesspal sa da che colore giocavi tu.

## Domande e problemi

- **L'AI non risponde, e il suo orologio corre**: guarda la sua finestra, che può essere finita dietro le altre: cercala nella barra in basso. Se ti sta chiedendo qualcosa, rispondi lì; se l'hai chiusa, clicca il nome dell'AI e aprine un'altra.
- **L'AI è lenta**: ogni mossa la pensa davvero. Dal suo nome scegli un modello più veloce, o meno ragionamento.
- **Un pezzo non si muove**: non è il tuo turno, o la mossa è vietata; la pagina dice perché.
- **Hai chiuso la pagina?** Riaprila dall'icona di Chesspal, sul desktop o nel menu: la partita lasciata a metà è ancora lì.
- **Le tue partite** stanno in una cartella sul tuo computer: **Chi gioca?**, dalla tua immagine in alto a destra, dice dove, e **Apri la cartella** la apre. Per tenerne una copia di sicurezza, copia la cartella, con la chat e la pagina chiuse.
- **Una versione nuova di Chesspal**: una freccia in alto te lo dice e la installa, fra una partita e l'altra.
- **Quanto costa**: Chesspal è gratis; l'AI usa il tuo abbonamento, e non paghi niente in più.
- **L'AI può fare una mossa illegale?** No: Chesspal controlla ogni mossa. I suoi giudizi però sono suoi, e un'AI può sbagliare, come una persona.
- **Qualcosa non va?** Raccontacelo su [GitHub](https://github.com/stefanocaronia/chesspal/issues): cosa hai fatto, cosa ti aspettavi, cosa è successo. GitHub è il sito dove si fa Chesspal: ci scrivi con un account gratuito, e chiunque può leggere.
