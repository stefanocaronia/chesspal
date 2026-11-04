// The page: the game of the player's folder, replayed with the chess core from its PGN (D-17), kept up to date as it changes, the player's moves (D-47) and
// words (T-65), in Zoe's three columns (D-53): the talk, the board, the game, the side ones folded as the player likes (T-84).
import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { type Clock, Game, materialOf, openingOf, type PieceLetter, type Promotion, readPgn, type Side, type Square } from "../core/index.ts";
import { Board, type Notice, piecesOf } from "./board.tsx";
import { flipKeys, type Step, stepKeys, stepped } from "./browse.ts";
import { howEnded, useJustEnded } from "./ending.ts";
import { explain } from "./explain.ts";
import { FoldTab } from "./fold-tab.tsx";
import { type Column, foldKeys, gameUnderBoard, nextFold, oneColumn, rememberFold, startFolds } from "./folds.ts";
import { GameColumn } from "./game-column.tsx";
import { Header } from "./header.tsx";
import { useOpeningBook } from "./opening-book.ts";
import { ChosenSet } from "./pieces.tsx";
import { Avatar, ClockFace, PlayerCard } from "./player-card.tsx";
import { aiSpoke, aiWords, playerSpent, playerWords, pliesOf, type TalkLine } from "./plies.ts";
import { SettingsPanel } from "./settings-panel.tsx";
import { languagesOf, saveSettings, type Settings, showSettings } from "./settings.ts";
import { playSound, soundOf, wakeSounds } from "./sounds.ts";
import { AiWords, Compose, TalkFaces } from "./talk.tsx";
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

    const change = (next: Settings): void => {
        setSettings(next);
        saveSettings(next);
        showSettings(next);
    };

    const [served, setServed] = useState<Served | undefined>(undefined);
    const [problem, setProblem] = useState<string | undefined>(undefined);
    const [selected, setSelected] = useState<string | undefined>(undefined);
    const [refusal, setRefusal] = useState<Notice | undefined>(undefined);
    // A pawn taken to the last rank waits for the player to choose what it becomes (T-11).
    const [promoting, setPromoting] = useState<{ from: string; to: string; } | undefined>(undefined);
    const [flipped, setFlipped] = useState(false);
    const [folds, setFolds] = useState(startFolds);
    const [draft, setDraft] = useState("");
    const [unsent, setUnsent] = useState<string | undefined>(undefined);
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
        reload.current = load;
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
    // A game read again ends what the player was doing on the one before: the move sent, the look back, the choice of a promotion.
    useEffect(() => {
        setPending(undefined);
        setViewing(undefined);
        setPromoting(undefined);
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
        void post("/api/new", {}, text).then((refused) => setRefusal(refused === undefined ? undefined : { text: refused.text }));
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
    const clock = game?.clock;
    const clockOf = (side: Side): ComponentChildren =>
        clock === undefined ? undefined : (
            <ClockFace
                clock={clock}
                side={side}
                toMove={!ended && live.position.turn === side}
                held={pending !== undefined}
                onFlag={() => reload.current()}
                text={text}
            />
        );

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

        // The words written and not sent go with the move (D-53): the box holds no more than the move has left (D-54).
        const words = draft;
        const move = `${from}${to}${piece ?? ""}`;
        setPromoting(undefined);
        setPending(move);
        void sendMove(move, words, text).then((refused) => {
            setRefusal(refused === undefined || refused.words ? undefined : { text: refused.text, square: from });
            setUnsent(refused?.words === true ? refused.text : undefined);
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
        setUnsent(undefined);
        void sendMessage(words, text).then((refused) => {
            setUnsent(refused?.text);
            clearSent(refused?.text, words);
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
                        <PlayerCard place="ai" picture={<Torretta size={48} />} name={name} side={ai} taken={material.taken[ai]} ahead={ahead(ai)} clock={clockOf(ai)} text={text} />
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
                            clock={clockOf(player)}
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
                        notice={viewing === undefined ? refusal : undefined}
                        promotion={promoting === undefined || viewing !== undefined || !playerToMove ? undefined : { ...promoting, side: player }}
                        onPromote={(piece) => piece === undefined ? setPromoting(undefined) : play(promoting!.from, promoting!.to, piece)}
                        onSelect={select}
                        onMove={play}
                        onRefuse={refuse}
                        text={text}
                    />
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
 * What the server sends: the game, its PGN for the player, the AI's side, when it started, the talk on the page, each line with the moves the game had
 * then, and its clock in a game with one, null before the first game; and the AI's name, when the host gave it.
 */
interface Served
{
    readonly game: { readonly pgn: string; readonly ai: Side; readonly started: string; readonly talk: readonly TalkLine[]; readonly clock?: Clock; } | null;
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
function sendMove(move: string, words: string, text: Text): Promise<Refused | undefined>
{
    const message = words.trim();
    return post("/api/move", message === "" ? { move } : { move, message }, text);
}

/** Sends the player's words alone: the reason they were refused, or undefined. */
function sendMessage(words: string, text: Text): Promise<Refused | undefined>
{
    return post("/api/message", { text: words.trim() }, text);
}

/** A request the server refused: why, and whether the player's words were the cause, which the talk says rather than the board (T-11). */
interface Refused
{
    readonly text: string;
    readonly words: boolean;
}

/** Sends a request to the server: the reason it was refused, in the player's language when the page knows the refusal (T-11, D-57), or undefined. */
async function post(path: string, body: object, text: Text): Promise<Refused | undefined>
{
    try {
        const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

        if (response.ok) {
            return undefined;
        }

        const refused = (await response.json()) as { error?: string; refusal?: string; most?: number; };
        const known = refused.refusal === undefined ? undefined : text.refused[refused.refusal as ServerRefusal] as ((most: number) => string) | undefined;
        return { text: known?.(refused.most ?? 0) ?? refused.error ?? response.statusText, words: refused.refusal?.startsWith("words-") === true };
    } catch (error) {
        return { text: String(error), words: false };
    }
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
