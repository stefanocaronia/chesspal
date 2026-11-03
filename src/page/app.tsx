// The page: the game of the player's folder, replayed with the chess core from its PGN (D-17), kept up to date as it changes, the player's moves (D-47) and
// words (T-65), in Zoe's three columns (D-53): the talk, the board, the game.
import { useEffect, useMemo, useState } from "preact/hooks";
import { Game, materialOf, readPgn, type Side } from "../core/index.ts";
import { Board, piecesOf } from "./board.tsx";
import { GameColumn, rememberFolded, startFolded } from "./game-column.tsx";
import { Header } from "./header.tsx";
import { Avatar, PlayerCard } from "./player-card.tsx";
import { aiWords, playerWords, pliesOf, type TalkLine } from "./plies.ts";
import { AiWords, Compose } from "./talk.tsx";
import type { Text } from "./text.ts";
import { Torretta } from "./torretta.tsx";

/** The page: the board of the game in the player's folder, where the player moves on their turn, the talk with the AI beside it, and the game's column. */
export function App({ text }: { text: Text; })
{
    const [served, setServed] = useState<Served | undefined>(undefined);
    const [problem, setProblem] = useState<string | undefined>(undefined);
    const [selected, setSelected] = useState<string | undefined>(undefined);
    const [refusal, setRefusal] = useState<string | undefined>(undefined);
    const [flipped, setFlipped] = useState(false);
    const [folded, setFolded] = useState(startFolded);
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

    if (problem !== undefined) {
        return <p class="problem">{problem}</p>;
    }

    if (served === undefined || game === undefined) {
        return <Header text={text} flipped={flipped} onFlip={() => setFlipped(!flipped)} />;
    }

    const player = game === null || game.ai === "black" ? "white" : "black";
    const ai = player === "white" ? "black" : "white";
    const result = live.outcome.over ? live.outcome.result : live.record.tags.Result;
    const ended = result !== undefined && result !== "*";
    const playerToMove = game !== null && !ended && live.position.turn === player;
    const ahead = (side: Side): number => side === "white" ? material.balance : -material.balance;
    const name = served.opponent ?? text.ai;
    const talk = game?.talk ?? [];

    // Words sent leave the box; what the player wrote on while they went stays.
    const clearSent = (refused: string | undefined, words: string): void => {
        if (refused === undefined) {
            setDraft((now) => now.startsWith(words) ? now.slice(words.length).trimStart() : now);
        }
    };

    const choose = (square: string): void => {
        const piece = pieces.get(square);
        const own = piece !== undefined && (piece === piece.toUpperCase()) === (player === "white");
        setRefusal(undefined);

        if (own || selected === undefined) {
            setSelected(own ? square : undefined);
            return;
        }

        // The words written and not sent go with the move (D-53).
        const words = draft;
        setSelected(undefined);
        void sendMove(`${selected}${square}${promotion(pieces.get(selected), square)}`, words).then((refused) => {
            setRefusal(refused);
            clearSent(refused, words);
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

    const fold = (away: boolean): void => {
        setFolded(away);
        rememberFolded(away);
    };

    return (
        <>
            <Header text={text} flipped={flipped} onFlip={() => setFlipped(!flipped)} />
            <main class={`app${flipped ? " flipped" : ""}${folded ? " folded" : ""}`}>
                <div class="talk">
                    <section class="ai-block" aria-label={name}>
                        <PlayerCard place="ai" picture={<Torretta size={48} />} name={name} side={ai} taken={material.taken[ai]} ahead={ahead(ai)} text={text} />
                        <AiWords words={aiWords(plies, ai, talk)} />
                    </section>
                    <section class="you-block" aria-label={text.you}>
                        {game === null ? null : (
                            <Compose
                                lines={playerWords(plies, ai, talk)}
                                waiting={talk.filter((line) => line.who === "player" && line.heard !== "answered").length}
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
                <div class="board-wrap">
                    <Board
                        fen={live.position.fen}
                        bottom={flipped ? ai : player}
                        lastMove={live.lastMove}
                        selected={selected}
                        onSquare={playerToMove ? choose : undefined}
                        text={text}
                    />
                    {refusal === undefined ? null : <p class="toast" role="alert">{refusal}</p>}
                </div>
                <GameColumn
                    plies={plies}
                    result={ended ? result : undefined}
                    started={game?.started}
                    move={live.position.moveNumber}
                    folded={folded}
                    onFold={fold}
                    text={text}
                />
            </main>
        </>
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

async function post(path: string, body: object): Promise<string | undefined>
{
    try {
        const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        return response.ok ? undefined : ((await response.json()) as { error?: string; }).error ?? response.statusText;
    } catch (error) {
        return String(error);
    }
}

/** A pawn that reaches the last rank becomes a queen, until the page lets the player choose (T-11). */
function promotion(piece: string | undefined, to: string): string
{
    return (piece === "P" && to.endsWith("8")) || (piece === "p" && to.endsWith("1")) ? "q" : "";
}
