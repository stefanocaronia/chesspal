// The page: the game of the player's folder, replayed with the chess core from its PGN (D-17), kept up to date as it changes, the player's moves (D-47) and
// words (T-65), in Zoe's three columns (D-53): the talk, the board, the game, the side ones folded as the player likes (T-84).
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { Game, materialOf, openingOf, readPgn, type Side, type Square } from "../core/index.ts";
import { Board, piecesOf } from "./board.tsx";
import { flipKeys, type Step, stepKeys, stepped } from "./browse.ts";
import { howEnded, useJustEnded } from "./ending.ts";
import { FoldTab } from "./fold-tab.tsx";
import { type Column, foldKeys, gameUnderBoard, nextFold, oneColumn, rememberFold, startFolds } from "./folds.ts";
import { GameColumn } from "./game-column.tsx";
import { Header } from "./header.tsx";
import { useOpeningBook } from "./opening-book.ts";
import { ChosenSet } from "./pieces.tsx";
import { Avatar, PlayerCard } from "./player-card.tsx";
import { aiSpoke, aiWords, playerSpent, playerWords, pliesOf, type TalkLine } from "./plies.ts";
import { SettingsPanel } from "./settings-panel.tsx";
import { languagesOf, saveSettings, type Settings, showSettings } from "./settings.ts";
import { playSound, soundOf, wakeSounds } from "./sounds.ts";
import { AiWords, Compose, TalkFaces } from "./talk.tsx";
import { textFor } from "./text.ts";
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

    const change = (next: Settings): void => {
        setSettings(next);
        saveSettings(next);
        showSettings(next);
    };

    const [served, setServed] = useState<Served | undefined>(undefined);
    const [problem, setProblem] = useState<string | undefined>(undefined);
    const [selected, setSelected] = useState<string | undefined>(undefined);
    const [refusal, setRefusal] = useState<string | undefined>(undefined);
    const [flipped, setFlipped] = useState(false);
    const [folds, setFolds] = useState(startFolds);
    const [draft, setDraft] = useState("");
    const [unsent, setUnsent] = useState<string | undefined>(undefined);

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
        const events = new EventSource("/api/events");
        events.onopen = load;
        events.onmessage = load;
        return () => events.close();
    }, []);

    // The game is replayed from its PGN once for each one the server sends, not at every click.
    const game = served?.game;
    const live = useMemo(() => game === undefined || game === null ? new Game() : new Game(readPgn(game.pgn)[0]), [game]);
    const material = useMemo(() => materialOf(live.position.fen), [live]);
    const pieces = useMemo(() => piecesOf(live.position.fen), [live]);
    const plies = useMemo(() => pliesOf(live.record), [live]);
    const book = useOpeningBook(live.record.moves.length > 0);
    const opening = useMemo(() => book === undefined ? undefined : openingOf(live.record, book), [live, book]);
    // The player's move shows at once, before the server has it: the game it sends next takes its place (T-70).
    const [pending, setPending] = useState<string | undefined>(undefined);
    // The player may look back through the moves played (T-88): `viewing` how many are shown, undefined for the game as it is; a new move brings it back.
    const [viewing, setViewing] = useState<number | undefined>(undefined);
    const past = useMemo(() => viewing === undefined ? undefined : new Game({ tags: live.record.tags, moves: live.record.moves.slice(0, viewing) }), [live, viewing]);
    const next = useMemo(() => viewing === undefined ? undefined : new Game({ tags: live.record.tags, moves: live.record.moves.slice(0, viewing + 1) }).lastMove, [live, viewing]);
    const shown = useMemo(() => past ?? (pending === undefined ? live : withMove(live, pending)), [live, pending, past]);
    useEffect(() => {
        setPending(undefined);
        setViewing(undefined);
    }, [game]);
    useMoveSounds(game, live, sound);
    const unread = useUnread(game === undefined || game === null ? undefined : aiSpoke(plies, game.ai, game.talk), folds.talk !== "open");

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

    // A game going on is archived unfinished: the player says so first (T-64).
    const startNewGame = (): void => {
        const going = game !== null && game !== undefined && !live.outcome.over && (live.record.tags.Result ?? "*") === "*";

        if (going && !confirm(text.abandonGame)) {
            return;
        }

        setSelected(undefined);
        void post("/api/new", {}, text.clearChat).then(setRefusal);
    };

    const result = live.outcome.over ? live.outcome.result : live.record.tags.Result;
    const ended = result !== undefined && result !== "*";
    const how = ended ? howEnded(live.outcome, live.record.tags.Termination) : undefined;
    const winner = result === "1-0" ? "white" : result === "0-1" ? "black" : undefined;
    const justEnded = useJustEnded(game === undefined || game === null ? undefined : ended ? "over" : "going");

    const header = (
        <Header
            text={text}
            verdict={ended ? text.verdict(how, winner) : undefined}
            onNewGame={served === undefined ? undefined : startNewGame}
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

    const player = game === null || game.ai === "black" ? "white" : "black";
    const ai = player === "white" ? "black" : "white";
    const playerToMove = game !== null && !ended && live.position.turn === player;
    const ahead = (side: Side): number => side === "white" ? material.balance : -material.balance;
    const name = served.opponent ?? text.ai;
    const talk = game?.talk ?? [];
    const said = playerWords(plies, ai, talk);

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

    const play = (from: string, to: string): void => {
        // The words written and not sent go with the move (D-53): the box holds no more than the move has left (D-54).
        const words = draft;
        const move = `${from}${to}${promotion(pieces.get(from), to)}`;
        setSelected(undefined);
        setRefusal(undefined);
        setPending(move);
        void sendMove(move, words).then((refused) => {
            setRefusal(refused);
            clearSent(refused, words);

            if (refused !== undefined) {
                setPending(undefined);
            }
        });
    };

    const sendWords = (): void => {
        const words = draft;
        setUnsent(undefined);
        void sendMessage(words).then((refused) => {
            setUnsent(refused);
            clearSent(refused, words);
        });
    };

    return (
        <ChosenSet.Provider value={settings.set}>
            {panel}
            <main class={`app${flipped ? " flipped" : ""}${folds.talk === "open" ? "" : ` talk-${folds.talk}`}${folds.game === "folded" ? " folded" : ""}`}>
                {header}
                <TalkFaces name={name} ai={ai} player={player} aiMoves={!ended && game !== null && !playerToMove} playerMoves={playerToMove} unread={unread} text={text} />
                <FoldTab column="talk" folded={folds.talk === "folded"} label={text.talk} unread={unread && folds.talk === "folded"} onFold={fold} />
                <FoldTab column="game" folded={folds.game === "folded"} label={text.game} onFold={fold} />
                <span class="visually-hidden" aria-live="polite">{unread ? text.wrote(name) : ""}</span>
                <div class="talk" id="talk">
                    <section class="ai-block" aria-label={name}>
                        <PlayerCard place="ai" picture={<Torretta size={48} />} name={name} side={ai} taken={material.taken[ai]} ahead={ahead(ai)} text={text} />
                        <AiWords words={aiWords(plies, ai, talk)} />
                    </section>
                    <section class="you-block" aria-label={text.you}>
                        {game === null ? null : (
                            <Compose
                                lines={said}
                                spent={playerSpent(plies, ai, talk)}
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
                        )}
                        <PlayerCard
                            place="you"
                            picture={<Avatar />}
                            name={text.you}
                            side={player}
                            taken={material.taken[player]}
                            ahead={ahead(player)}
                            turn={playerToMove}
                            text={text}
                        />
                    </section>
                </div>
                <div
                    class="board-wrap"
                    onWheel={wheel}
                    // A press on the board while the player looks back brings the game as it is: the next one plays.
                    onPointerDownCapture={viewing === undefined ? undefined : (event) => event.button === 0 && goTo(total)}
                >
                    <Board
                        fen={shown.position.fen}
                        bottom={flipped ? ai : player}
                        lastMove={shown.lastMove}
                        nextMove={next}
                        jumped={jumped}
                        check={shown.position.check}
                        end={ended && viewing === undefined && pending === undefined ? { how, winner, player, fresh: justEnded } : undefined}
                        player={playerToMove && pending === undefined && viewing === undefined ? player : undefined}
                        selected={selected}
                        targets={selected === undefined || viewing !== undefined ? [] : live.legalMoves(selected as Square)}
                        dots={settings.dots}
                        onSelect={select}
                        onMove={play}
                        text={text}
                    />
                    {refusal === undefined ? null : <p class="toast" role="alert">{refusal}</p>}
                </div>
                <GameColumn
                    plies={plies}
                    result={ended ? result : undefined}
                    how={how}
                    lit={justEnded}
                    started={game?.started}
                    move={live.position.moveNumber}
                    toMove={live.position.turn}
                    opening={opening}
                    shownPlies={at}
                    onShow={goTo}
                    onStep={step}
                    text={text}
                />
            </main>
        </ChosenSet.Provider>
    );
}

/**
 * What the server sends: the game, its PGN for the player, the AI's side, when it started and the talk on the page, each line with the moves the game had
 * then, null before the first game; and the AI's name, when the host gave it.
 */
interface Served
{
    readonly game: { readonly pgn: string; readonly ai: Side; readonly started: string; readonly talk: readonly TalkLine[]; } | null;
    readonly opponent?: string;
}

/** Plays the sound of each move the game gains while the page watches it, the AI's and the player's: none for a game loaded or begun again (T-71). */
function useMoveSounds(game: Served["game"] | undefined, live: Game, on: boolean): void
{
    const seen = useRef<{ started: string; moves: number; } | undefined>(undefined);

    useEffect(wakeSounds, []);

    useEffect(() => {
        if (game === undefined || game === null) {
            return;
        }

        const moves = live.record.moves.length;
        const before = seen.current;
        seen.current = { started: game.started, moves };
        const sound = soundOf(live);

        if (on && before?.started === game.started && moves === before.moves + 1 && sound !== undefined) {
            playSound(sound);
        }
    }, [live]);
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

/** Whether a key is the page's: not one the player types into a box or the settings, nor with a modifier, nor while a piece is in the air. */
function forThePage(event: KeyboardEvent): boolean
{
    const typing = (event.target as HTMLElement).closest("input, textarea, select, [contenteditable], dialog") !== null;
    return !(event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey || typing || document.documentElement.classList.contains("dragging"));
}

/** Sends the player's move to the server, which plays it as the chat would, with the words written for the AI: the reason it was refused, or undefined. */
function sendMove(move: string, words: string): Promise<string | undefined>
{
    const message = words.trim();
    return post("/api/move", message === "" ? { move } : { move, message });
}

/** Sends the player's words alone: the reason they were refused, or undefined. */
function sendMessage(words: string): Promise<string | undefined>
{
    return post("/api/message", { text: words.trim() });
}

/** Sends a request to the server: the reason it was refused, in the player's language when the chat must be cleared first (D-57), or undefined. */
async function post(path: string, body: object, clearChat?: string): Promise<string | undefined>
{
    try {
        const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

        if (response.ok) {
            return undefined;
        }

        const refusal = (await response.json()) as { error?: string; clearChat?: boolean; };
        return refusal.clearChat === true && clearChat !== undefined ? clearChat : refusal.error ?? response.statusText;
    } catch (error) {
        return String(error);
    }
}

/** The game with the player's move played on a copy, for the board to show before the server answers; the game itself when the move is not legal. */
function withMove(game: Game, move: string): Game
{
    const copy = new Game(game.record);
    return copy.play(move).played ? copy : game;
}

/** A pawn that reaches the last rank becomes a queen, until the page lets the player choose (T-11). */
function promotion(piece: string | undefined, to: string): string
{
    return (piece === "P" && to.endsWith("8")) || (piece === "p" && to.endsWith("1")) ? "q" : "";
}
