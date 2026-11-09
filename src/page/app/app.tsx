// The page: the game of the player's folder, replayed with the chess core from its PGN (D-17), kept up to date as it changes, the player's moves (D-47) and
// words, in Zoe's three columns (D-53): the talk, the board, the game, the side ones folded as the player likes.
import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
    aiHostIn,
    aiModelIn,
    aiNameOf,
    annotatorOf,
    closingOf,
    Game,
    gameReviewOf,
    materialOf,
    type Mood,
    moodAt,
    movesOnly,
    openingOf,
    type PieceLetter,
    type Promotion,
    readPgn,
    type Side,
    type Square,
    suggestedLevel,
    timeControlText,
    writePgn,
} from "../../core/index.ts";
import { PlayerPicture } from "../avatars/avatars.tsx";
import { Thinker, Thought } from "../avatars/thought.tsx";
import { Torretta } from "../avatars/torretta.tsx";
import { Board, type BoardEnd, type Notice } from "../board/board.tsx";
import { explain } from "../board/explain.ts";
import { kingSigns } from "../board/signs.ts";
import { piecesOf } from "../board/squares.ts";
import { type NewGameChoice, NewGameDialog } from "../dialogs/new-game.tsx";
import { NameButton, PictureButton, PictureDialog, ProfilesDialog, Wizard } from "../dialogs/profiles.tsx";
import { SettingsPanel } from "../dialogs/settings.tsx";
import { playerIn, type StudiedSide, studiedSides } from "../dialogs/studied.ts";
import { type Studied, StudyDialog } from "../dialogs/study.tsx";
import { BadgeCounts } from "../game/badges.tsx";
import { type Step, stepped } from "../game/browse.ts";
import { GameColumn } from "../game/column.tsx";
import { howEnded, useDeclined, useJustEnded, useSawEnd } from "../game/ending.ts";
import { Steps } from "../game/move-list.tsx";
import { useOpeningBook } from "../game/opening-book.ts";
import { aiSpoke, aiWords, type CoachShown, judgmentsOf, playerSpent, playerWords, pliesOf, withBook, withJudgments, withoutReviews } from "../game/plies.ts";
import { BareButton, HelpsCard, HintLine, MapButton } from "../helps/helps.tsx";
import { helpsOf } from "../helps/view.ts";
import { FoldTab } from "../layout/fold-tab.tsx";
import { type Column, nextFold, rememberFold, startFolds } from "../layout/folds.ts";
import { type GameActions, Header } from "../layout/header.tsx";
import { standingsOf } from "../lead/view.ts";
import { MarksLegend } from "../legend/legend.tsx";
import { legendOf } from "../legend/view.ts";
import { ChosenSet } from "../pieces/pieces.tsx";
import { ClockFace, PlayerCard } from "../players/card.tsx";
import { signature } from "../players/model-name.ts";
import { keepSettings, type ProfileShown } from "../profile/profile.ts";
import { languagesOf, saveSettings, type Settings, settingsFrom, showSettings } from "../profile/settings.ts";
import { endSoundOf, playSound, soundOf, wakeSounds } from "../sounds/sounds.ts";
import { AiNote, AiWords, Compose, PointSquare, TalkFaces } from "../talk/talk.tsx";
import { textFor } from "../text.ts";
import { anchorName, useAnchor } from "./anchor.ts";
import { useBrowseKeys, useFoldKeys, useLegendKey, useMapKey, useWheelSteps } from "./keys.ts";
import { phaseOf, verdictOf } from "./phase.ts";
import { type PageData, post, sendMessage, sendMove, useServed } from "./served.ts";

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

    const [dialog, setDialog] = useState<"picture" | "profiles" | "new-game" | "study" | undefined>(undefined);
    const { data: served, problem, offline, reload } = useServed(() => setDialog("new-game"));
    const [selected, setSelected] = useState<string | undefined>(undefined);
    const [refusal, setRefusal] = useState<Notice | undefined>(undefined);
    // A pawn taken to the last rank waits for the player to choose what it becomes.
    const [promoting, setPromoting] = useState<{ from: string; to: string; } | undefined>(undefined);
    const [flipped, setFlipped] = useState(false);
    const [folds, setFolds] = useState(startFolds);
    const [draft, setDraft] = useState("");
    const [unsent, setUnsent] = useState<string | undefined>(undefined);

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
    const sawEnd = useSawEnd(studied !== undefined || game === undefined || game === null ? undefined : over ? "over" : "going");
    const phase = phaseOf(studied !== undefined, game, over, sawEnd);
    const going = phase === "going";
    const between = phase === "over" || phase === "idle";
    const idle = phase === "idle";
    const tableSet = useMemo(() => new Game(), []);
    const live = idle ? tableSet : replayed;
    // In analysis the AI is who played that game, as its PGN says, and the review's words are of who wrote them: never the chat open now (D-97).
    const annotator = studied === undefined ? undefined : annotatorOf(live.record);
    const playedAs = studied === undefined ? name : aiNameOf(aiHostIn(live.record), aiModelIn(live.record)?.model) ?? text.ai;
    const analyst = annotator === undefined ? name : aiNameOf(annotator.annotator, annotator.annotator) ?? text.ai;
    const material = useMemo(() => materialOf(live.position.fen), [live]);
    const pieces = useMemo(() => piecesOf(live.position.fen), [live]);
    // While the game goes on, the book's first moves carry its badge, when the player wants it, as the AI's review gives it after (D-69).
    const inBook = studied === undefined && settings.book ? game?.book ?? 0 : 0;
    // The judgments of the player's moves, and the AI's drawings, show during a game only with the helps on, always once it is over (D-78); during it the
    // coach's come from its own file, never in the PGN the opponent may read (D-88).
    const judged = !going || settings.helps;
    const coached = going ? game?.coach : undefined;
    const plies = useMemo(() => {
        const read = pliesOf(replayed.record);
        return withBook(!judged ? withoutReviews(read) : coached === undefined ? read : withJudgments(read, coached), inBook);
    }, [replayed, inBook, judged, coached]);
    const book = useOpeningBook(live.record.moves.length > 0);
    const opening = useMemo(() => book === undefined ? undefined : openingOf(live.record, book), [live, book]);
    // The player's move shows at once, before the server has it: the game it sends next takes its place.
    const [pending, setPending] = useState<string | undefined>(undefined);
    // The coach's hint for the position on the board, none once the player has moved, folded until they open it; a new hint comes folded (Zoe).
    const hint = pending === undefined && coached?.hint?.position === replayed.record.moves.length ? coached.hint : undefined;
    const hintKey = hint === undefined ? undefined : `${hint.position} ${hint.text}`;
    const [openHint, setOpenHint] = useState<string | undefined>(undefined);
    const hintOpen = hintKey !== undefined && openHint === hintKey;
    const openTheHint = (open: boolean): void => setOpenHint(open ? hintKey : undefined);
    // The player may look back through the moves played: `viewing` how many are shown, undefined for the game as it is; a new move brings it back.
    const [viewing, setViewing] = useState<number | undefined>(undefined);
    // The squares the player points at in the AI's words or the helps' card, lit on the board; the control map while it is held (D-78).
    const [pointed, setPointed] = useState<readonly string[]>(noSquares);
    const pointSquare = useMemo(() => (square: string | undefined) => setPointed(square === undefined ? noSquares : [square]), []);
    const [mapping, setMapping] = useState(false);
    // The board without its drawings while their button is held (Stefano).
    const [bare, setBare] = useState(false);
    // The legend of the marks on the board, open until the player closes it (D-99).
    const [legendOpen, setLegendOpen] = useState(false);
    useLegendKey(() => setLegendOpen((open) => !open));
    const past = useMemo(() => viewing === undefined ? undefined : new Game({ tags: live.record.tags, moves: live.record.moves.slice(0, viewing) }), [live, viewing]);
    const next = useMemo(() => viewing === undefined ? undefined : new Game({ tags: live.record.tags, moves: live.record.moves.slice(0, viewing + 1) }).lastMove, [live, viewing]);
    const shown = useMemo(() => past ?? (pending === undefined ? live : withMove(live, pending)), [live, pending, past]);
    // A square lit from the AI's words goes off with the position: a touch keeps it lit until then, a mouse until it leaves the word.
    useEffect(() => setPointed(noSquares), [shown]);
    // With the helps on, the player sees all of Chesspal's facts, whatever the AI's level (D-79), in a game and in the analysis of one (Stefano).
    const analysing = studied !== undefined;
    // Seen from the player's side (D-91): theirs in a game, in analysis the side the game names theirs, none when it names neither.
    const you = analysing ? playerIn(studiedSides(live.record.tags, served?.profile.name ?? "", playedAs, text.sides, served?.profile.accounts)) : game?.ai === undefined ? undefined : game.ai === "white" ? "black" : "white";
    const helps = useMemo(() => (going || analysing) && settings.helps ? helpsOf(shown, you) : undefined, [shown, going, analysing, settings.helps, you]);
    // Who the AI saw ahead, the coach's with the helps on in a game and the analyst's in analysis, for the bar and the chart (D-90).
    const drawnOnBoard = live.outcome.over && live.outcome.result === "1/2-1/2";
    const standings = useMemo(() => (going && settings.helps) || analysing ? standingsOf(plies, drawnOnBoard) : undefined, [plies, drawnOnBoard, going, analysing, settings.helps]);
    useMapKey(helps !== undefined, setMapping);
    // A new move or a new game ends what the player was doing on the one before: the move sent, the look back, the choice of a promotion. The same game
    // sent again, for the talk, the coach's words or the settings, leaves them where they are (Zoe); so does a review written on the game in analysis.
    const gameKey = studied !== undefined ? studied.name : game === undefined || game === null ? game : `${game.started} ${game.pgn}`;
    useEffect(() => {
        setPending(undefined);
        setViewing(undefined);
        setPromoting(undefined);
    }, [gameKey]);
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

        // The hint folds away with the game's column, so that its drawings never stay on the board without its words (Zoe).
        if (column === "game" && next !== "open") {
            setOpenHint(undefined);
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
    // The move shown stays in the page's address, for a reload and a link to it; after the reset on a new game, which would undo the move it goes to. A
    // game a link opens is there to look at: the analyst starts on the player's yes alone (D-89; Zoe and Federico).
    const playedName = game === undefined || game === null ? undefined : anchorName(game.name);
    useAnchor(
        { ready: served !== undefined, shown: studied !== undefined ? anchorName(studied.name) : idle ? undefined : playedName, played: playedName, going },
        viewing,
        (plies) => goTo(plies ?? total),
        async (wanted) => await post("/api/study", { game: wanted, look: true }, text, name) === undefined,
    );

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

    const { kind, verdict } = verdictOf(phase, how, winner, offer, declined, text);
    const header = (
        <Header
            text={text}
            kind={kind}
            verdict={verdict}
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
            {...(served === undefined ? {} : { profile: served.profile, onProfile: () => setDialog("profiles") })}
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
        return <Wizard text={text} hasGame={served.game !== null} account={served.profile.name} dataFolder={served.dataFolder} onMade={reload} />;
    }

    const profile = served.profile;
    const picture = <PlayerPicture profile={profile} />;
    // In analysis the cards name the players of the game, the player's side at the bottom when they played it (D-69).
    const sides = studied === undefined ? undefined : studiedSides(live.record.tags, profile.name, playedAs, text.sides, profile.accounts);

    const player = sides?.bottom ?? (game === null || game.ai === "black" ? "white" : "black");
    const ai = player === "white" ? "black" : "white";
    // The Torretta's face on the move shown: the mood the AI gave, while it lasts (D-70); in analysis, of the side the AI played.
    const mood = moodAt(live.record, sides?.white.who === "ai" ? "white" : sides?.black.who === "ai" ? "black" : ai, at).mood;
    const playerToMove = going && live.position.turn === player;
    const ahead = (side: Side): number => side === "white" ? material.balance : -material.balance;
    const reviewed = judged || at <= inBook ? plies[at - 1] : undefined;
    // With the helps on, the coach's judgments of the player's last move, once the AI has answered it, and of one a held note let go only now (D-78, D-88).
    const judgments = going && settings.helps ? judgmentsOf(plies, player, coached ?? noCoach) : [];
    const review = reviewed?.review;
    // An open hint draws on the board as it is, in place of the last move's drawings.
    const drawn = hintOpen && hint !== undefined && viewing === undefined && (hint.arrows !== undefined || hint.squares !== undefined) ? hint : review;
    const drawnByCoach = hint !== undefined && drawn === hint;
    // The game over, when this is its last position: the kings' signs, on the board and in the legend.
    const boardEnd: BoardEnd | undefined = ended && viewing === undefined && pending === undefined ? { how, winner, player, fresh: justEnded } : undefined;
    // The legend has the marks the board shows: none of the helps' or the drawings while the board is bare (D-99).
    const shownBare = bare && helps !== undefined;
    const legendRows = legendOf({
        ...(review?.badge === undefined || shown.lastMove === undefined ? {} : { badge: { badge: review.badge, square: shown.lastMove.to } }),
        ...(helps === undefined || shownBare ? {} : { helps }),
        ...(drawn === undefined || shownBare ? {} : { drawn }),
        control: mapping && helps !== undefined,
        ...(boardEnd === undefined ? {} : { ends: kingSigns(piecesOf(shown.position.fen), shown.position.turn, boardEnd) }),
    });
    // In a game the coach draws on the player's moves, the AI on its own.
    const drawer = drawnByCoach || (going && reviewed?.side === player) ? text.legend.drawnByCoach : text.legend.drawnBy(analyst);
    const legendAt = (under: boolean) => (
        <MarksLegend
            rows={legendRows}
            open={legendOpen}
            onOpen={setLegendOpen}
            drawn={{ words: drawnByCoach ? text.helpsCard.drawn : text.drawn, by: drawer }}
            onPoint={setPointed}
            under={under}
            text={text}
        />
    );
    const legend = legendAt(false);
    const summary = studied === undefined ? undefined : gameReviewOf(live.record);
    const closing = studied === undefined ? undefined : closingOf(live.record);
    // In analysis the AI's card says who played that game, as its PGN keeps it (D-82), not who plays now.
    const playedBy = studied === undefined ? undefined : aiModelIn(live.record);
    const talk = game?.talk ?? served.talk ?? [];
    const said = playerWords(talk);
    // The clocks only in a game going on: between games the player's card holds the next one in their place (D-77).
    const clock = going ? game?.clock : undefined;
    // No chat hears the player: the page says where to wake it, and the AI's clock waits, as the server holds it.
    const asleep = served.listening === false && !offline;
    // What the AI thinks on, a cloud at the Torretta's corner (Zoe): only in a game going on, and never while no chat hears the player, which the note says.
    const thinking = going && !asleep && !offline && studied === undefined ? served.thinking : undefined;
    const thinker = (size: number): ComponentChildren => (
        <Thinker thinking={thinking} words={text.thinking}>
            <Torretta size={size} mood={mood} />
        </Thinker>
    );
    // The clocks wait for the player from the game's start: when the AI moves first, a button gives it the start; else the player's first move does (Stefano).
    const clockWaits = clock?.waiting === true && !ended && studied === undefined && viewing === undefined && live.position.turn === ai;
    const clockOf = (side: Side): ComponentChildren =>
        clock === undefined ? undefined : (
            <ClockFace
                clock={clock}
                side={side}
                toMove={!ended && live.position.turn === side}
                held={pending !== undefined || (asleep && side === ai)}
                onFlag={reload}
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

    // The new game starts from the choices of the game before; the first, from the level that suits the player.
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
                // The player changes their picture in analysis too, from their own side's card.
                picture={sides[side].who === "player" ? <PictureButton profile={profile} onOpen={() => setDialog("picture")} text={text} /> : pictureOf(sides[side], profile, 48, mood)}
                name={sides[side].name}
                signed={sides[side].who === "ai" && playedBy !== undefined ? signature(playedBy.model, playedBy.effort) : undefined}
                side={side}
                taken={material.taken[side]}
                ahead={ahead(side)}
                badges={<BadgeCounts plies={plies} side={side} names={text.badges} />}
                text={text}
            />
        );

    // A game brought to analyse: the page shows it once the server has it in analysis; a refusal stays in the dialog.
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
                    locked={going ? text.profile.whilePlaying : undefined}
                    dataFolder={served.dataFolder}
                    onClose={() => setDialog(undefined)}
                    text={text}
                />
                <NewGameDialog open={dialog === "new-game"} choice={choice} going={going} onStart={startNewGame} onClose={() => setDialog(undefined)} text={text} />
                <StudyDialog open={dialog === "study"} onStudy={studyGame} onClose={() => setDialog(undefined)} you={profile.name} accounts={profile.accounts} ai={name} text={text} />
                {offline ? <p class="offline" role="alert">{text.offline(name)}</p> : null}
                {served.outdated === true ? <p class="outdated" role="status">{text.outdated(name)}</p> : null}
                <main class={`app${flipped ? " flipped" : ""}${folds.talk === "open" ? "" : ` talk-${folds.talk}`}${folds.game === "folded" ? " folded" : ""}`} inert={offline}>
                    {header}
                    {sides === undefined
                        ? (
                            <TalkFaces
                                name={name}
                                aiPicture={thinker(40)}
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
                    <FoldTab
                        column="talk"
                        folded={folds.talk === "folded"}
                        label={thinking === undefined || folds.talk !== "folded" ? text.talk : `${text.talk}: ${text.thinking[thinking]}`}
                        unread={(unread || asleep) && folds.talk === "folded"}
                        {...(thinking === undefined || folds.talk !== "folded" ? {} : { mark: <Thought thinking={thinking} words={text.thinking} /> })}
                        onFold={fold}
                    />
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
                                            {...(summary === undefined ? { reviewing: true } : {})}
                                            name={analyst}
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
                                            picture={thinker(48)}
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
                            bare={bare && helps !== undefined}
                            {...(review?.badge === undefined ? {} : { badge: { badge: review.badge, name: text.badges[review.badge] } })}
                            {...(drawn === undefined ? {} : { drawn })}
                            nextMove={next}
                            jumped={jumped}
                            check={shown.position.check}
                            end={boardEnd}
                            player={playerToMove && pending === undefined && viewing === undefined ? player : undefined}
                            selected={selected}
                            targets={selected === undefined || viewing !== undefined ? [] : live.legalMoves(selected as Square)}
                            dots={settings.dots}
                            names={settings.squareNames}
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
                    {/* On a phone the steps of a game in analysis sit under the board, by the thumb (Zoe) */}
                    {studied === undefined ? null : (
                        <div class="board-steps">
                            <Steps shown={at} total={total} onStep={step} text={text} />
                        </div>
                    )}
                    {/* On a phone the helps' map sits under the board too, turned on and off by a touch (D-78), and the coach's hint beside it, its drawings in sight (Zoe) */}
                    {helps === undefined ? null : (
                        <div class="board-map">
                            {legendAt(true)}
                            <BareButton bare={bare} onBare={setBare} text={text} />
                            <MapButton mapping={mapping} onMap={setMapping} text={text} />
                            {hint === undefined || viewing !== undefined ? null : <HintLine hint={hint} open={hintOpen} onOpen={openTheHint} text={text} />}
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
                                judged={judgments}
                                hint={viewing === undefined ? hint : undefined}
                                hintOpen={hintOpen}
                                onHint={openTheHint}
                                onPoint={setPointed}
                                onMap={setMapping}
                                mapping={mapping}
                                onBare={setBare}
                                bare={bare}
                                legend={legend}
                                text={text}
                            />
                        )}
                        {...(helps === undefined && legendRows.length > 0 ? { legend } : {})}
                        {...(standings === undefined ? {} : { standings })}
                        {...(studied === undefined ? {} : { analysis: summary === undefined ? { by: analyst } : { by: analyst, summary } })}
                        shownPlies={at}
                        onShow={goTo}
                        onStep={step}
                        {...(studied === undefined ? {} : { onDownload: () => download(studied.pgn, pgnName(live.record.tags, "analysis")) })}
                        {...(total === 0 ? {} : { onSaveMoves: () => download(writePgn(movesOnly(live.record)), pgnName(live.record.tags)) })}
                        {...(between && game !== null ? { onAnalyse: () => void studyGame({ last: true }) } : {})}
                        text={text}
                    />
                </main>
            </PointSquare.Provider>
        </ChosenSet.Provider>
    );
}

/** The picture of a player of the game in analysis: the player's own, the AI's Torretta with its mood, or the plain face of someone else. */
function pictureOf({ who }: StudiedSide, profile: ProfileShown, size: number, mood: Mood): ComponentChildren
{
    return who === "ai" ? <Torretta size={size} mood={mood} /> : <PlayerPicture profile={who === "player" ? profile : undefined} size={size} />;
}

/**
 * Plays the sound of each move the game gains while the page watches it, the AI's and the player's, of its end without a move and of a draw offered:
 * none for a game loaded or begun again.
 */
function useGameSounds(game: PageData["game"] | undefined, live: Game, on: boolean): void
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

const noSquares: readonly string[] = [];

const noCoach: CoachShown = { judgments: [] };

/** Whether the words are a command for Claude's app, such as /clear, rather than words for the AI. */
function isCommand(words: string): boolean
{
    return /^\s*\/[a-z]/i.test(words);
}

/** Saves a PGN file in the player's downloads: a game in analysis with its review, which the board page loads back ready, or the moves alone. */
function download(pgn: string, name: string): void
{
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([pgn], { type: "application/x-chess-pgn" }));
    link.download = name;
    link.click();
    URL.revokeObjectURL(link.href);
}

/** The file's name from the game's tags and what it holds: Ann-Bob-2026.11.02-analysis.pgn, without characters a file's name cannot hold. */
function pgnName(tags: Readonly<Record<string, string>>, kind?: string): string
{
    const parts = [tags.White, tags.Black, tags.Date?.includes("?") === true ? undefined : tags.Date, kind].filter((part) => part !== undefined && part !== "");
    return `${(parts.length === 0 ? ["game"] : parts).join("-").replace(/[\\/:*?"<>|\s]+/g, "_")}.pgn`;
}

/** The game with the player's move played on a copy, for the board to show before the server answers; the game itself when the move is not legal. */
function withMove(game: Game, move: string): Game
{
    const copy = new Game(game.record);
    return copy.play(move).played ? copy : game;
}

/** Whether a pawn's move takes it to the last rank, where the player chooses what it becomes. */
function promotes(piece: string | undefined, to: string): boolean
{
    return (piece === "P" && to.endsWith("8")) || (piece === "p" && to.endsWith("1"));
}
