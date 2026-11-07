// The page: the game of the player's folder, replayed with the chess core from its PGN (D-17), kept up to date as it changes, the player's moves (D-47) and
// words (T-65), in Zoe's three columns (D-53): the talk, the board, the game, the side ones folded as the player likes (T-84).
import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
    type AiModel,
    aiModelIn,
    annotatorOf,
    type Clock,
    closingOf,
    Game,
    gameReviewOf,
    materialOf,
    type Mood,
    moodAt,
    openingOf,
    type PieceLetter,
    type Promotion,
    readPgn,
    type Side,
    type Square,
    suggestedLevel,
    timeControlText,
} from "../core/index.ts";
import { PlayerPicture } from "./avatars.tsx";
import { BadgeCounts } from "./badges.tsx";
import { Board, type Notice, piecesOf } from "./board.tsx";
import { flipKeys, type Step, stepKeys, stepped } from "./browse.ts";
import { howEnded, useDeclined, useJustEnded, useSawEnd } from "./ending.ts";
import { explain } from "./explain.ts";
import { FoldTab } from "./fold-tab.tsx";
import { type Column, foldKeys, gameUnderBoard, nextFold, oneColumn, rememberFold, startFolds } from "./folds.ts";
import { GameColumn } from "./game-column.tsx";
import { type GameActions, Header } from "./header.tsx";
import { helpsOf } from "./helps-view.ts";
import { HelpsCard, MapButton } from "./helps.tsx";
import { signature } from "./model-name.ts";
import { Steps } from "./move-list.tsx";
import { type NewGameChoice, NewGameDialog } from "./new-game-dialog.tsx";
import { useOpeningBook } from "./opening-book.ts";
import { ChosenSet } from "./pieces.tsx";
import { ClockFace, PlayerCard } from "./player-card.tsx";
import { aiSpoke, aiWords, judgmentOf, playerSpent, playerWords, pliesOf, type TalkLine, withBook, withoutReviews } from "./plies.ts";
import { NameButton, PictureButton, PictureDialog, ProfilesDialog, Wizard } from "./profile-dialogs.tsx";
import { keepSettings, type Profile } from "./profile.ts";
import { SettingsPanel } from "./settings-panel.tsx";
import { languagesOf, saveSettings, type Settings, settingsFrom, showSettings } from "./settings.ts";
import { endSoundOf, playSound, soundOf, wakeSounds } from "./sounds.ts";
import { type StudiedSide, studiedSides } from "./studied.ts";
import { type Studied, StudyDialog } from "./study-dialog.tsx";
import { AiNote, AiWords, Compose, PointSquare, TalkFaces } from "./talk.tsx";
import { type ServerRefusal, type Text, textFor } from "./text.ts";
import { Torretta } from "./torretta.tsx";

/**
 * The page: the board of the game in the player's folder, where the player moves on their turn, the talk with the AI beside it, and the game's column; in the
 * settings the player chose, `start` as this browser remembered them (D-56).
 */
export function App({ start }: { start: Settings; })
{
    const [settings, setSettings] = useState(start);
    const [setting, setSetting] = useState(false);
    const text = useMemo(() => textFor(languagesOf(settings)), [settings.language]);
    const sound = settings.sound;
    useEffect(() => void (document.documentElement.lang = text.language), [text]);

    const apply = (next: Settings): void => {
        setSettings(next);
        saveSettings(next);
        showSettings(next);
    };

    // A choice of the player's is kept in the profile in use too, so that it follows them (D-56).
    const change = (next: Settings): void => {
        apply(next);

        if (served !== undefined) {
            keepSettings(served.profile.id, next);
        }
    };

    const [served, setServed] = useState<Served | undefined>(undefined);
    const [problem, setProblem] = useState<string | undefined>(undefined);
    const [offline, setOffline] = useState(false);
    const [selected, setSelected] = useState<string | undefined>(undefined);
    const [refusal, setRefusal] = useState<Notice | undefined>(undefined);
    // A pawn taken to the last rank waits for the player to choose what it becomes (T-11).
    const [promoting, setPromoting] = useState<{ from: string; to: string; } | undefined>(undefined);
    const [flipped, setFlipped] = useState(false);
    const [folds, setFolds] = useState(startFolds);
    const [draft, setDraft] = useState("");
    const [unsent, setUnsent] = useState<string | undefined>(undefined);
    const [dialog, setDialog] = useState<"picture" | "profiles" | "new-game" | "study" | undefined>(undefined);
    // Reads the game again: when the server says it changed, and when a clock runs out on the page (T-37).
    const reload = useRef(() => {});

    useEffect(() => {
        let latest = 0;

        const load = (): void => {
            // Two reads in flight may answer out of order: only the last one asked counts.
            const asked = ++latest;
            fetch("/api/game")
                .then((response) => response.json() as Promise<Served & { error?: string; }>)
                .then((body) => {
                    if (asked !== latest) {
                        return;
                    }

                    setProblem(body.error);

                    if (body.error === undefined) {
                        setServed(body);
                    }
                })
                .catch((error: unknown) => setProblem(String(error)));
        };

        // The server says when the game changes, whoever changed it: the page reads it again, and as it connects, the first time or to a new chat's server.
        // The server lives in the chat's MCP server: when the chat ends, after /clear in Claude's app too, the page waits for the next one and says so.
        reload.current = load;
        const events = new EventSource("/api/events");

        events.onopen = () => {
            setOffline(false);
            load();
        };

        // The chat asks for a new game: the player chooses it in the New game window, which opens here.
        events.onmessage = (event) => event.data === "new-game" ? setDialog("new-game") : load();
        events.onerror = () => setOffline(events.readyState !== EventSource.OPEN);
        return () => events.close();
    }, []);

    // The profile in use brings its settings, as it comes and each time another comes in its place; one without any takes this browser's.
    const profileId = served?.profile.id;
    useEffect(() => {
        if (served === undefined || profileId === undefined) {
            return;
        }

        if (served.settings === undefined) {
            keepSettings(profileId, settings);
        } else {
            apply(settingsFrom(served.settings));
        }
    }, [profileId]);

    // The AI as the host names it (Claude, Codex), also where the page sends the player to write; the last known while the page is offline.
    const name = served?.opponent ?? text.ai;
    // Under it, the model and effort the AI played its last move with (D-82).
    const signed = served?.aiModel === undefined ? undefined : signature(served.aiModel.model, served.aiModel.effort);

    // The game is replayed from its PGN once for each one the server sends, not at every click. Once no game goes on, the game in analysis shows in its place
    // (D-69), with the AI's badges and notes: replayed again only when its review changed.
    const game = served?.game;
    const studied = served?.analysis;
    const replayed = useMemo(
        () => studied !== undefined ? new Game(readPgn(studied.pgn)[0]) : game === undefined || game === null ? new Game() : new Game(readPgn(game.pgn)[0]),
        [studied === undefined ? game : studied.pgn],
    );
    // Between games the board shows the table set for the next (D-77): before the first, and on a game over the page did not see end; one it saw end keeps
    // its final position until the next starts. The talk keeps the game's words all the same.
    const over = isOver(resultOf(replayed));
    const going = studied === undefined && game !== undefined && game !== null && !over;
    const between = studied === undefined && game !== undefined && !going;
    const sawEnd = useSawEnd(studied !== undefined || game === undefined || game === null ? undefined : over ? "over" : "going");
    const idle = between && !sawEnd;
    const tableSet = useMemo(() => new Game(), []);
    const live = idle ? tableSet : replayed;
    const material = useMemo(() => materialOf(live.position.fen), [live]);
    const pieces = useMemo(() => piecesOf(live.position.fen), [live]);
    // While the game goes on, the book's first moves carry its badge, when the player wants it, as the AI's review gives it after (D-69).
    const inBook = studied === undefined && settings.book ? game?.book ?? 0 : 0;
    // The AI's judgments of the player's moves, and its drawings, show during a game only with the helps on, always once it is over (D-78).
    const judged = !going || settings.helps;
    const plies = useMemo(() => withBook(judged ? pliesOf(replayed.record) : withoutReviews(pliesOf(replayed.record)), inBook), [replayed, inBook, judged]);
    const book = useOpeningBook(live.record.moves.length > 0);
    const opening = useMemo(() => book === undefined ? undefined : openingOf(live.record, book), [live, book]);
    // The player's move shows at once, before the server has it: the game it sends next takes its place (T-70).
    const [pending, setPending] = useState<string | undefined>(undefined);
    // The player may look back through the moves played (T-88): `viewing` how many are shown, undefined for the game as it is; a new move brings it back.
    const [viewing, setViewing] = useState<number | undefined>(undefined);
    // The squares the player points at in the AI's words or the helps' card, lit on the board (T-111); the control map while it is held (D-78).
    const [pointed, setPointed] = useState<readonly string[]>(noSquares);
    const pointSquare = useMemo(() => (square: string | undefined) => setPointed(square === undefined ? noSquares : [square]), []);
    const [mapping, setMapping] = useState(false);
    const past = useMemo(() => viewing === undefined ? undefined : new Game({ tags: live.record.tags, moves: live.record.moves.slice(0, viewing) }), [live, viewing]);
    const next = useMemo(() => viewing === undefined ? undefined : new Game({ tags: live.record.tags, moves: live.record.moves.slice(0, viewing + 1) }).lastMove, [live, viewing]);
    const shown = useMemo(() => past ?? (pending === undefined ? live : withMove(live, pending)), [live, pending, past]);
    // A square lit from the AI's words goes off with the position: a touch keeps it lit until then, a mouse until it leaves the word (T-111).
    useEffect(() => setPointed(noSquares), [shown]);
    // With the helps on, the player sees all of Chesspal's facts, whatever the AI's level (D-79).
    const helps = useMemo(() => going && settings.helps ? helpsOf(shown) : undefined, [shown, going, settings.helps]);
    useMapKey(helps !== undefined, setMapping);
    // A game read again ends what the player was doing on the one before: the move sent, the look back, the choice of a promotion. A review written on the
    // game in analysis leaves the player where they are in it.
    useEffect(() => {
        setPending(undefined);
        setViewing(undefined);
        setPromoting(undefined);
    }, [studied === undefined ? game : studied.name]);
    const played = studied === undefined ? game : null;
    useGameSounds(played, replayed, sound);
    // Before the first game the AI speaks in the talk alone (D-77).
    const spoke = played === undefined ? undefined : played === null ? served?.talk?.filter((line) => line.who === "ai").length ?? 0 : aiSpoke(plies, played.ai, played.talk);
    const unread = useUnread(spoke, folds.talk !== "open");

    const fold = (column: Column): void => {
        const next = nextFold(column, folds[column]);

        // The focus in what folds away goes to the column's tab.
        if (next !== "open" && document.getElementById(column)?.contains(document.activeElement) === true) {
            document.getElementById(`fold-${column}`)?.focus();
        }

        setFolds({ ...folds, [column]: next });
        rememberFold(column, next);
    };

    useFoldKeys(fold);

    const total = live.record.moves.length;
    const at = viewing ?? total;
    // In analysis, the opening the move shown has reached, while the book knows the moves (D-69).
    const bookAt = studied === undefined || book === undefined || at === 0 || at > studied.book ? undefined : { tags: live.record.tags, moves: live.record.moves.slice(0, at) };
    const shownOpening = useMemo(() => bookAt === undefined || book === undefined ? undefined : openingOf(bookAt, book), [live, book, bookAt === undefined ? 0 : at]);
    // A jump of more than one move shows the position at once: only a step slides its pieces.
    const shownBefore = useRef(at);
    const jumped = Math.abs(shownBefore.current - at) > 1;
    shownBefore.current = at;

    const goTo = (count: number): void => {
        setSelected(undefined);
        setViewing(count >= total ? undefined : Math.max(0, count));
    };

    const step = (to: Step): void => goTo(stepped(to, at, total));
    useBrowseKeys(step, () => setFlipped(!flipped));
    const wheel = useWheelSteps(step);

    // The header's theme switch picks the other of the two the page shows, leaving the system's.
    const switchTheme = (): void => change({ ...settings, theme: document.documentElement.dataset.theme === "dark" ? "light" : "dark" });

    // An action of the player's on the game: the game the server sends next shows it; a refusal shows on the board.
    const act = (path: string, body: object): void => {
        setSelected(undefined);
        void post(path, body, text, name).then((refused) => setRefusal(refused === undefined ? undefined : { text: refused.text }));
    };

    const result = resultOf(live);
    const ended = isOver(result);
    const how = ended ? howEnded(live.outcome, live.record.tags.Termination) : undefined;
    const winner = result === "1-0" ? "white" : result === "0-1" ? "black" : undefined;
    const justEnded = useJustEnded(played === undefined || played === null ? undefined : over ? "over" : "going");
    const offer = played?.drawOffer;
    const declined = useDeclined(offer, total, ended);

    // In a game going on the player offers a draw on their turn once each side has moved, answers the AI's, or resigns, saying so first (D-65).
    const actions: GameActions | undefined = !going || played === undefined || played === null ? undefined : {
        ...(offer === undefined ? {} : { offer }),
        canOffer: offer === undefined && pending === undefined && live.position.turn !== played.ai && total >= 2,
        onOffer: () => act("/api/draw", { action: "offer" }),
        onAnswer: (accept) => act("/api/draw", { action: accept ? "accept" : "decline" }),
        onResign: () => {
            if (confirm(text.resignGame)) {
                act("/api/resign", {});
            }
        },
    };

    const header = (
        <Header
            text={text}
            kind={studied !== undefined ? "analysis" : idle ? "idle" : ended ? "over" : offer !== undefined || declined ? "offer" : undefined}
            verdict={studied !== undefined
                ? text.analysing
                : idle
                ? text.noGameNow
                : ended
                ? text.verdict(how, winner)
                : offer === "ai"
                ? text.offers
                : offer === "player"
                ? text.drawOffered
                : declined
                ? text.declines
                : undefined}
            {...(!ended && (offer === "ai" || declined) ? { who: name } : {})}
            actions={actions}
            onNewGame={served === undefined ? undefined : () => setDialog("new-game")}
            // Between games the new one stands out in the player's card (D-77): in the header only when the talk, and the card with it, is folded away.
            standOut={studied !== undefined || (between && folds.talk !== "open")}
            onStudy={served === undefined || going ? undefined : () => setDialog("study")}
            flipped={flipped}
            onFlip={() => setFlipped(!flipped)}
            sound={sound}
            onSound={() => change({ ...settings, sound: !sound })}
            onTheme={switchTheme}
            onSettings={() => setSetting(true)}
        />
    );

    const panel = <SettingsPanel open={setting} settings={settings} onChange={change} onClose={() => setSetting(false)} text={text} />;

    if (problem !== undefined) {
        return <p class="problem">{problem}</p>;
    }

    if (served === undefined || game === undefined) {
        return (
            <>
                {header}
                {panel}
            </>
        );
    }

    // At the first start the page asks who plays (D-23), to complete the profile Chesspal made (D-71): the game comes after.
    if (served.profile.new === true) {
        return <Wizard text={text} hasGame={served.game !== null} account={served.profile.name} dataFolder={served.dataFolder} onMade={() => reload.current()} />;
    }

    const profile = served.profile;
    const picture = <PlayerPicture profile={profile} />;
    // In analysis the cards name the players of the game, the player's side at the bottom when they played it (D-69).
    const sides = studied === undefined ? undefined : studiedSides(live.record.tags, profile.name, name, text.sides);

    const player = sides?.bottom ?? (game === null || game.ai === "black" ? "white" : "black");
    const ai = player === "white" ? "black" : "white";
    // The Torretta's face on the move shown: the mood the AI gave, while it lasts (D-70); in analysis, of the side the AI played.
    const mood = moodAt(live.record, sides?.white.who === "ai" ? "white" : sides?.black.who === "ai" ? "black" : ai, at).mood;
    const playerToMove = going && live.position.turn === player;
    const ahead = (side: Side): number => side === "white" ? material.balance : -material.balance;
    const reviewed = judged || at <= inBook ? plies[at - 1] : undefined;
    // With the helps on, the AI's judgment of the player's last move, once it has answered it (D-78).
    const judgment = going && settings.helps ? judgmentOf(plies, player) : undefined;
    const review = reviewed?.review;
    const summary = studied === undefined ? undefined : gameReviewOf(live.record);
    const closing = studied === undefined ? undefined : closingOf(live.record);
    const annotator = studied === undefined ? undefined : annotatorOf(live.record);
    // In analysis the AI's card says who played that game, as its PGN keeps it (D-82), not who plays now.
    const playedBy = studied === undefined ? undefined : aiModelIn(live.record);
    const talk = game?.talk ?? served.talk ?? [];
    const said = playerWords(talk);
    // The clocks only in a game going on: between games the player's card holds the next one in their place (D-77).
    const clock = going ? game?.clock : undefined;
    // No chat hears the player: the page says where to wake it, and the AI's clock waits, as the server holds it.
    const asleep = served.listening === false && !offline;
    // The clocks wait for the player from the game's start: when the AI moves first, a button gives it the start; else the player's first move does (Stefano).
    const clockWaits = clock?.waiting === true && !ended && studied === undefined && viewing === undefined && live.position.turn === ai;
    const clockOf = (side: Side): ComponentChildren =>
        clock === undefined ? undefined : (
            <ClockFace
                clock={clock}
                side={side}
                toMove={!ended && live.position.turn === side}
                held={pending !== undefined || (asleep && side === ai)}
                onFlag={() => reload.current()}
                text={text}
            />
        );
    // Where to wake the chat, under the AI's card (over the board when the talk is folded); the button that starts the clocks, under the player's (Zoe).
    const asleepNote = asleep ? <p class="asleep" role="status">{text.asleep(name)}</p> : null;
    const startClocks = clockWaits
        ? (
            <button type="button" class="command primary start-clocks" onClick={() => act("/api/start", {})}>
                <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M8 5.5v13l10.5-6.5z" />
                </svg>
                {text.startClocks}
            </button>
        )
        : null;
    // Between games the next starts from the player's card, where the clock and the button that starts it stand in a game (D-77).
    const nextGame = between
        ? (
            <button type="button" class="command primary next-game" onClick={() => setDialog("new-game")}>
                <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 5V19M5 12H19" />
                </svg>
                {text.newGame}
            </button>
        )
        : null;

    // Words sent leave the box; what the player wrote on while they went stays.
    const clearSent = (refused: string | undefined, words: string): void => {
        if (refused === undefined) {
            setDraft((now) => now.startsWith(words) ? now.slice(words.length).trimStart() : now);
        }
    };

    const select = (square: string | undefined): void => {
        setRefusal(undefined);
        setSelected(square);
    };

    const play = (from: string, to: string, piece?: Promotion): void => {
        setSelected(undefined);
        setRefusal(undefined);

        if (piece === undefined && promotes(pieces.get(from), to)) {
            setPromoting({ from, to });
            return;
        }

        // The words written and not sent go with the move (D-53): the box holds no more than the move has left (D-54). A command for Claude's app stays here.
        const command = isCommand(draft);
        const words = command ? "" : draft;
        const move = `${from}${to}${piece ?? ""}`;
        setPromoting(undefined);
        setPending(move);
        void sendMove(move, words, text, name).then((refused) => {
            setRefusal(refused === undefined || refused.words ? undefined : { text: refused.text, square: from });
            setUnsent(refused?.words === true ? refused.text : command ? text.commandHere(name) : undefined);
            clearSent(refused?.text, words);

            if (refused !== undefined) {
                setPending(undefined);
            }
        });
    };

    // A move the board refuses says why, without the AI (D-18), unless the player turned it off: the piece goes back, the reason over it.
    const refuse = (from: string, to: string): void => {
        const illegal = settings.explain ? live.whyNot(from as Square, to as Square) : undefined;

        if (illegal !== undefined) {
            const letterOn = (square: string): PieceLetter => pieces.get(square)!.toUpperCase() as PieceLetter;
            const sideOn = (square: string): Side => pieces.get(square) === letterOn(square) ? "white" : "black";
            const by = illegal.by === undefined ? undefined : { letter: letterOn(illegal.by), side: sideOn(illegal.by), square: illegal.by };
            const words = text.illegal({ reason: illegal.reason, piece: letterOn(from), to, takes: pieces.has(to), by, ...(illegal.at === undefined ? {} : { at: illegal.at }) });
            const king = [...pieces].find(([, letter]) => letter === (sideOn(from) === "white" ? "K" : "k"))?.[0];
            setRefusal({ text: words, square: from, piece: pieces.get(from)!, explanation: explain(illegal, to, king) });
        }
    };

    const sendWords = (): void => {
        const words = draft;

        // /clear and the other commands are for Claude's app: written here they would reach the AI as words (Sebastiano's playtest).
        if (isCommand(words)) {
            setUnsent(text.commandHere(name));
            return;
        }

        setUnsent(undefined);
        void sendMessage(words, text, name).then((refused) => {
            setUnsent(refused?.text);
            clearSent(refused?.text, words);
        });
    };

    // The new game starts from the choices of the game before; the first, from the level that suits the player (T-58).
    const level = suggestedLevel(played === null ? undefined : replayed.record, profile.level);
    const lastControl = game?.clock?.control;
    const lastClock = lastControl === undefined ? undefined : timeControlText(lastControl);
    const choice: NewGameChoice = { colour: player, level, ...(lastClock === undefined ? {} : { clock: lastClock }) };

    const startNewGame = ({ colour, level: chosen, clock: control }: NewGameChoice): void => {
        setDialog(undefined);
        act("/api/new", { ai_colour: colour === "random" ? "random" : colour === "white" ? "black" : "white", level: chosen, ...(control === undefined ? {} : { clock: control }) });
    };

    // In analysis the AI's note stays under the card on top and its word on the game over the one below, however the board is turned (D-69).
    const top = flipped ? player : ai;
    const bottom = flipped ? ai : player;

    const studiedCard = (side: Side, place: "ai" | "you"): ComponentChildren =>
        sides === undefined ? null : (
            <PlayerCard
                place={place}
                picture={pictureOf(sides[side], profile, 48, mood)}
                name={sides[side].name}
                signed={sides[side].who === "ai" && playedBy !== undefined ? signature(playedBy.model, playedBy.effort) : undefined}
                side={side}
                taken={material.taken[side]}
                ahead={ahead(side)}
                badges={<BadgeCounts plies={plies} side={side} names={text.badges} />}
                text={text}
            />
        );

    // A game brought to analyse (T-92): the page shows it once the server has it in analysis; a refusal stays in the dialog.
    const studyGame = async (studied: Studied): Promise<string | undefined> => {
        const refused = await post("/api/study", studied, text, name);

        if (refused === undefined) {
            setDialog(undefined);
        }

        return refused?.text;
    };

    return (
        <ChosenSet.Provider value={settings.set}>
            <PointSquare.Provider value={pointSquare}>
                {panel}
                <PictureDialog open={dialog === "picture"} profile={profile} onClose={() => setDialog(undefined)} text={text} />
                <ProfilesDialog
                    open={dialog === "profiles"}
                    profiles={served.profiles}
                    active={profile}
                    playing={going}
                    dataFolder={served.dataFolder}
                    onClose={() => setDialog(undefined)}
                    text={text}
                />
                <NewGameDialog open={dialog === "new-game"} choice={choice} going={going} onStart={startNewGame} onClose={() => setDialog(undefined)} text={text} />
                <StudyDialog open={dialog === "study"} onStudy={studyGame} onClose={() => setDialog(undefined)} you={profile.name} ai={name} text={text} />
                {offline ? <p class="offline" role="alert">{text.offline(name)}</p> : null}
                <main class={`app${flipped ? " flipped" : ""}${folds.talk === "open" ? "" : ` talk-${folds.talk}`}${folds.game === "folded" ? " folded" : ""}`} inert={offline}>
                    {header}
                    {sides === undefined
                        ? (
                            <TalkFaces
                                name={name}
                                aiPicture={<Torretta size={40} mood={mood} />}
                                you={profile.name}
                                picture={picture}
                                {...(idle ? {} : { ai, player })}
                                aiMoves={going && !playerToMove}
                                playerMoves={playerToMove}
                                unread={unread || asleep}
                                text={text}
                            />
                        )
                        : (
                            <TalkFaces
                                name={sides[ai].name}
                                aiPicture={pictureOf(sides[ai], profile, 40, mood)}
                                you={sides[player].name}
                                picture={pictureOf(sides[player], profile, 40, mood)}
                                ai={ai}
                                player={player}
                                aiMoves={false}
                                playerMoves={false}
                                unread={asleep}
                                text={text}
                            />
                        )}
                    <FoldTab column="talk" folded={folds.talk === "folded"} label={text.talk} unread={(unread || asleep) && folds.talk === "folded"} onFold={fold} />
                    <FoldTab column="game" folded={folds.game === "folded"} label={text.game} onFold={fold} />
                    <span class="visually-hidden" aria-live="polite">{unread ? text.wrote(name) : ""}</span>
                    <div class={sides === undefined ? "talk" : "talk studied"} id="talk">
                        {sides !== undefined
                            ? (
                                <>
                                    <section class="ai-block" aria-label={sides[top].name}>
                                        {studiedCard(top, "ai")}
                                        {asleepNote}
                                        <AiNote
                                            {...(reviewed === undefined ? {} : { ply: reviewed })}
                                            {...(shownOpening === undefined ? {} : { opening: shownOpening })}
                                            {...(at === total && closing !== undefined ? { closing } : {})}
                                            {...(at === 0 && summary !== undefined ? { summary } : {})}
                                            name={name}
                                            by={annotator}
                                            mood={mood}
                                            {...(settings.voice ? { voice: text.language } : {})}
                                            text={text}
                                        />
                                    </section>
                                    <section class="you-block" aria-label={sides[bottom].name}>
                                        {studiedCard(bottom, "you")}
                                    </section>
                                </>
                            )
                            : (
                                <>
                                    <section class="ai-block" aria-label={name}>
                                        <PlayerCard
                                            place="ai"
                                            picture={<Torretta size={48} mood={mood} />}
                                            name={name}
                                            signed={signed}
                                            side={idle ? undefined : ai}
                                            {...(idle ? {} : { level: text.start.levels[level] })}
                                            taken={material.taken[ai]}
                                            ahead={ahead(ai)}
                                            clock={clockOf(ai)}
                                            text={text}
                                        />
                                        {asleepNote}
                                        <AiWords
                                            words={aiWords(plies, ai, talk)}
                                            newestFirst={!flipped}
                                            {...(settings.voice ? { voice: text.language } : {})}
                                            {...(judgment === undefined ? {} : { judged: judgment })}
                                            text={text}
                                        />
                                    </section>
                                    <section class="you-block" aria-label={profile.name}>
                                        <Compose
                                            lines={said}
                                            newestFirst={flipped}
                                            // Between games, and before the first, the player writes freely, a line at a time, as the AI does (D-74, D-77).
                                            spent={going ? playerSpent(plies, ai, talk) : 0}
                                            draft={draft}
                                            onDraft={(words) => {
                                                setDraft(words);
                                                setUnsent(undefined);
                                            }}
                                            onSend={sendWords}
                                            canMove={playerToMove}
                                            name={name}
                                            problem={unsent}
                                            text={text}
                                        />
                                        <PlayerCard
                                            place="you"
                                            picture={<PictureButton profile={profile} onOpen={() => setDialog("picture")} text={text} />}
                                            name={<NameButton profile={profile} onOpen={() => setDialog("profiles")} text={text} />}
                                            side={idle ? undefined : player}
                                            taken={material.taken[player]}
                                            ahead={ahead(player)}
                                            turn={playerToMove}
                                            clock={
                                                <>
                                                    {clockOf(player)}
                                                    {startClocks}
                                                    {nextGame}
                                                </>
                                            }
                                            text={text}
                                        />
                                    </section>
                                </>
                            )}
                    </div>
                    <div
                        // Between games the board goes off (D-77): a game the page saw end once its effects are over, its final position less off than the table set.
                        class={between && !justEnded ? "board-wrap off" : "board-wrap"}
                        onWheel={wheel}
                        // A press on the board while the player looks back brings the game as it is: the next one plays.
                        onPointerDownCapture={viewing === undefined || studied !== undefined ? undefined : (event) => event.button === 0 && goTo(total)}
                    >
                        <Board
                            fen={shown.position.fen}
                            bottom={flipped ? ai : player}
                            lastMove={shown.lastMove}
                            pointed={pointed}
                            {...(helps === undefined ? {} : { helps })}
                            {...(mapping && helps !== undefined ? { control: helps.strategy.control } : {})}
                            {...(review?.badge === undefined ? {} : { badge: { badge: review.badge, name: text.badges[review.badge] } })}
                            {...(review === undefined ? {} : { drawn: review })}
                            nextMove={next}
                            jumped={jumped}
                            check={shown.position.check}
                            end={ended && viewing === undefined && pending === undefined ? { how, winner, player, fresh: justEnded } : undefined}
                            player={playerToMove && pending === undefined && viewing === undefined ? player : undefined}
                            selected={selected}
                            targets={selected === undefined || viewing !== undefined ? [] : live.legalMoves(selected as Square)}
                            dots={settings.dots}
                            notice={viewing === undefined ? refusal : undefined}
                            promotion={promoting === undefined || viewing !== undefined || !playerToMove ? undefined : { ...promoting, side: player }}
                            onPromote={(piece) => piece === undefined ? setPromoting(undefined) : play(promoting!.from, promoting!.to, piece)}
                            onSelect={select}
                            onMove={play}
                            onRefuse={refuse}
                            text={text}
                        />
                        {/* With the talk folded, the note on the chat that does not listen (Stefano) and the button that starts the clocks come over the board's far edge */}
                        {folds.talk !== "open" && (asleep || clockWaits)
                            ? (
                                <div class="over-board">
                                    {asleep ? <p class="asleep" role="status">{text.asleep(name)}</p> : null}
                                    {startClocks}
                                </div>
                            )
                            : null}
                    </div>
                    {/* On a phone the steps of a game in analysis sit under the board, by the thumb (Zoe, T-40) */}
                    {studied === undefined ? null : (
                        <div class="board-steps">
                            <Steps shown={at} total={total} onStep={step} text={text} />
                        </div>
                    )}
                    {/* On a phone the helps' map sits under the board too, turned on and off by a touch (D-78) */}
                    {helps === undefined ? null : (
                        <div class="board-map">
                            <MapButton mapping={mapping} onMap={setMapping} held={false} text={text} />
                        </div>
                    )}
                    <GameColumn
                        plies={idle ? [] : plies}
                        result={ended ? result : undefined}
                        how={how}
                        lit={justEnded}
                        started={idle ? undefined : played?.started}
                        move={live.position.moveNumber}
                        toMove={live.position.turn}
                        opening={opening}
                        helps={helps === undefined ? undefined : (
                            <HelpsCard
                                helps={helps}
                                onPoint={setPointed}
                                onMap={setMapping}
                                mapping={mapping}
                                text={text}
                            />
                        )}
                        {...(studied === undefined ? {} : { analysis: summary === undefined ? { by: name } : { by: name, summary } })}
                        shownPlies={at}
                        onShow={goTo}
                        onStep={step}
                        {...(studied === undefined ? {} : { onDownload: () => download(studied.pgn, pgnName(live.record.tags)) })}
                        {...(between && game !== null ? { onAnalyse: () => void studyGame({ last: true }) } : {})}
                        text={text}
                    />
                </main>
            </PointSquare.Provider>
        </ChosenSet.Provider>
    );
}

/**
 * What the server sends: the game, its PGN for the player, the AI's side, when it started, the talk on the page, each line with the moves the game had
 * then, its clock in a game with one and the draw offer that stands (D-65), null before the first game; the AI's name, when the host gave it; and the
 * profile in use with its settings, and all the profiles, none before the first (D-23).
 */
interface Served
{
    readonly game: {
        readonly pgn: string;
        readonly ai: Side;
        readonly started: string;
        readonly talk: readonly TalkLine[];
        readonly clock?: Clock;
        readonly drawOffer?: "player" | "ai";
        /** How many of its first moves are the book's. */
        readonly book?: number;
    } | null;
    /** The talk before the first game (D-77), with no game. */
    readonly talk?: readonly TalkLine[];
    /** The game in analysis, once no game goes on (D-69): its name and its PGN with the AI's review. */
    readonly analysis?: { readonly name: string; readonly pgn: string; readonly book: number; };
    readonly opponent?: string;
    /** The model and effort the AI played its last move with, as the host tied them to it (D-82). */
    readonly aiModel?: AiModel;
    /** Whether a chat hears the player: in a turn, or waiting for the doorbell. */
    readonly listening?: boolean;
    readonly profile: Profile;
    readonly profiles: readonly Profile[];
    readonly settings?: object;
    /** Where the profiles are, folder by folder from the player's own (T-119). */
    readonly dataFolder: readonly string[];
}

/** The picture of a player of the game in analysis: the player's own, the AI's Torretta with its mood, or the plain face of someone else. */
function pictureOf({ who }: StudiedSide, profile: Profile, size: number, mood: Mood): ComponentChildren
{
    return who === "ai" ? <Torretta size={size} mood={mood} /> : <PlayerPicture profile={who === "player" ? profile : undefined} size={size} />;
}

/**
 * Plays the sound of each move the game gains while the page watches it, the AI's and the player's, of its end without a move and of a draw offered:
 * none for a game loaded or begun again (T-71, T-100).
 */
function useGameSounds(game: Served["game"] | undefined, live: Game, on: boolean): void
{
    const seen = useRef<{ started: string; moves: number; over: boolean; offered: boolean; } | undefined>(undefined);

    useEffect(wakeSounds, []);

    useEffect(() => {
        if (game === undefined || game === null) {
            return;
        }

        const moves = live.record.moves.length;
        const over = isOver(resultOf(live));
        const offered = game.drawOffer !== undefined;
        const before = seen.current;
        seen.current = { started: game.started, moves, over, offered };

        if (!on || before?.started !== game.started) {
            return;
        }

        // A move sounds as the board stands after it, and two read together as the last, so a mate that comes with the player's move sounds too; a game
        // ended without a move, by how it ended; a draw offered, with its move or on its own.
        const sound = moves > before.moves ? soundOf(live) : over && !before.over ? endSoundOf(howEnded(live.outcome, live.record.tags.Termination)) : undefined;

        if (sound !== undefined) {
            playSound(sound);
        }

        if (offered && !before.offered) {
            playSound("offer");
        }
    }, [live]);
}

/** The game's result: the board's, else the record's, which a resignation, a draw agreed or a flag write. */
function resultOf(live: Game): string | undefined
{
    return live.outcome.over ? live.outcome.result : live.record.tags.Result;
}

function isOver(result: string | undefined): boolean
{
    return result !== undefined && result !== "*";
}

/** Whether the AI spoke while the talk was folded, by how many times it has spoken (`spoke`, undefined before a game): until the player opens the talk. */
function useUnread(spoke: number | undefined, folded: boolean): boolean
{
    const [unread, setUnread] = useState(false);
    const heard = useRef(spoke);

    useEffect(() => {
        if (!folded) {
            setUnread(false);
        } else if (spoke !== undefined && heard.current !== undefined && spoke > heard.current) {
            setUnread(true);
        }

        heard.current = spoke;
    }, [spoke, folded]);

    return unread;
}

/**
 * `[` and `]` fold the talk and the game, as in editors with two side bars; never while the player types or drags a piece, nor in one column, nor the game
 * under the board.
 */
function useFoldKeys(fold: (column: Column) => void): void
{
    useEffect(() => {
        const press = (event: KeyboardEvent): void => {
            if (!forThePage(event) || oneColumn()) {
                return;
            }

            const column = (Object.keys(foldKeys) as Column[]).find((key) => foldKeys[key] === event.key);

            if (column !== undefined && !(column === "game" && gameUnderBoard())) {
                event.preventDefault();
                fold(column);
            }
        };

        window.addEventListener("keydown", press);
        return () => window.removeEventListener("keydown", press);
    });
}

/** M held shows the control map while the helps are on (D-78); it goes off when M is let go or the page loses the focus. */
function useMapKey(helping: boolean, map: (held: boolean) => void): void
{
    useEffect(() => {
        if (!helping) {
            map(false);
            return;
        }

        const down = (event: KeyboardEvent): void => {
            if (forThePage(event) && event.key.toLowerCase() === "m") {
                event.preventDefault();
                map(true);
            }
        };

        const up = (event: KeyboardEvent): void => {
            if (event.key.toLowerCase() === "m") {
                map(false);
            }
        };

        const away = (): void => map(false);

        window.addEventListener("keydown", down);
        window.addEventListener("keyup", up);
        window.addEventListener("blur", away);

        return () => {
            window.removeEventListener("keydown", down);
            window.removeEventListener("keyup", up);
            window.removeEventListener("blur", away);
        };
    }, [helping]);
}

/** The keys of Lichess and chess.com: the arrows, Home and End step through the moves (T-88), f and x turn the board round. */
function useBrowseKeys(step: (to: Step) => void, flip: () => void): void
{
    useEffect(() => {
        const press = (event: KeyboardEvent): void => {
            const to = stepKeys[event.key];
            const flips = flipKeys.includes(event.key.toLowerCase());

            if (!forThePage(event) || (to === undefined && !flips)) {
                return;
            }

            event.preventDefault();

            if (to === undefined) {
                flip();
            } else {
                step(to);
            }
        };

        window.addEventListener("keydown", press);
        return () => window.removeEventListener("keydown", press);
    });
}

/** The mouse wheel over the board steps through the moves, as on Lichess: down forward, a step a notch, however finely a touchpad turns it. */
function useWheelSteps(step: (to: Step) => void): (event: WheelEvent) => void
{
    const turned = useRef(0);

    return (event) => {
        event.preventDefault();
        turned.current += event.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? event.deltaY : event.deltaY * notch;

        while (Math.abs(turned.current) >= notch) {
            step(turned.current > 0 ? "forward" : "back");
            turned.current -= Math.sign(turned.current) * notch;
        }
    };
}

// How far a wheel turns in one notch, in pixels.
const notch = 100;

const noSquares: readonly string[] = [];

/** Whether a key is the page's: not one the player types into a box or the settings, nor with a modifier, nor while a piece is in the air. */
function forThePage(event: KeyboardEvent): boolean
{
    const typing = (event.target as HTMLElement).closest("input, textarea, select, [contenteditable], dialog") !== null;
    return !(event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey || typing || document.documentElement.classList.contains("dragging"));
}

/** Sends the player's move to the server, which plays it as the chat would, with the words written for the AI: the reason it was refused, or undefined. */
function sendMove(move: string, words: string, text: Text, name: string): Promise<Refused | undefined>
{
    const message = words.trim();
    return post("/api/move", message === "" ? { move } : { move, message }, text, name);
}

/** Sends the player's words alone: the reason they were refused, or undefined. */
function sendMessage(words: string, text: Text, name: string): Promise<Refused | undefined>
{
    return post("/api/message", { text: words.trim() }, text, name);
}

/** Whether the words are a command for Claude's app, such as /clear, rather than words for the AI. */
function isCommand(words: string): boolean
{
    return /^\s*\/[a-z]/i.test(words);
}

/** A request the server refused: why, and whether the player's words were the cause, which the talk says rather than the board (T-11). */
interface Refused
{
    readonly text: string;
    readonly words: boolean;
}

/**
 * Sends a request to the server: the reason it was refused, in the player's language when the page knows the refusal (T-11, D-57), with the host's name where
 * it sends the player, or undefined.
 */
async function post(path: string, body: object, text: Text, name: string): Promise<Refused | undefined>
{
    try {
        const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

        if (response.ok) {
            return undefined;
        }

        const refused = (await response.json()) as { error?: string; refusal?: string; most?: number; };
        const known = refused.refusal === undefined ? undefined : text.refused[refused.refusal as ServerRefusal] as ((most: number, name: string) => string) | undefined;
        return { text: known?.(refused.most ?? 0, name) ?? refused.error ?? response.statusText, words: refused.refusal?.startsWith("words-") === true };
    } catch (error) {
        return { text: String(error), words: false };
    }
}

/** Saves a game in analysis with its review as a PGN file in the player's downloads (T-106): the board page loads it back ready. */
function download(pgn: string, name: string): void
{
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([pgn], { type: "application/x-chess-pgn" }));
    link.download = name;
    link.click();
    URL.revokeObjectURL(link.href);
}

/** The file's name from the game's tags: Ann-Bob-2026.11.02-analysis.pgn, without characters a file's name cannot hold. */
function pgnName(tags: Readonly<Record<string, string>>): string
{
    const parts = [tags.White, tags.Black, tags.Date?.includes("?") === true ? undefined : tags.Date].filter((part) => part !== undefined && part !== "");
    return `${[...parts, "analysis"].join("-").replace(/[\\/:*?"<>|\s]+/g, "_")}.pgn`;
}

/** The game with the player's move played on a copy, for the board to show before the server answers; the game itself when the move is not legal. */
function withMove(game: Game, move: string): Game
{
    const copy = new Game(game.record);
    return copy.play(move).played ? copy : game;
}

/** Whether a pawn's move takes it to the last rank, where the player chooses what it becomes (T-11). */
function promotes(piece: string | undefined, to: string): boolean
{
    return (piece === "P" && to.endsWith("8")) || (piece === "p" && to.endsWith("1"));
}
