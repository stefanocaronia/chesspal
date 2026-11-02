// The page: the game of the player's folder, replayed with the chess core from its PGN (D-17), kept up to date as it changes, and the player's moves (D-47),
// laid out as Zoe's Salotto (D-46): the board, the AI's card with its last comment, the moves, the player's card.
import { useEffect, useMemo, useState } from "preact/hooks";
import { Game, materialOf, readPgn, type Side } from "../core/index.ts";
import { Board, piecesOf } from "./board.tsx";
import { Header } from "./header.tsx";
import { MoveList } from "./move-list.tsx";
import { Avatar, PlayerCard } from "./player-card.tsx";
import { pliesOf } from "./plies.ts";
import type { Text } from "./text.ts";
import { Torretta } from "./torretta.tsx";

/** The page: the board of the game in the player's folder, where the player moves on their turn, and the two players beside it. */
export function App({ text }: { text: Text; })
{
    const [served, setServed] = useState<Served | undefined>(undefined);
    const [problem, setProblem] = useState<string | undefined>(undefined);
    const [selected, setSelected] = useState<string | undefined>(undefined);
    const [refusal, setRefusal] = useState<string | undefined>(undefined);
    const [flipped, setFlipped] = useState(false);

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

    const choose = (square: string): void => {
        const piece = pieces.get(square);
        const own = piece !== undefined && (piece === piece.toUpperCase()) === (player === "white");
        setRefusal(undefined);

        if (own || selected === undefined) {
            setSelected(own ? square : undefined);
            return;
        }

        setSelected(undefined);
        void sendMove(`${selected}${square}${promotion(pieces.get(selected), square)}`).then(setRefusal);
    };

    return (
        <>
            <Header text={text} flipped={flipped} onFlip={() => setFlipped(!flipped)} />
            <main class={flipped ? "app flipped" : "app"}>
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
                <PlayerCard
                    place="ai"
                    picture={<Torretta size={46} />}
                    name={served.opponent ?? text.ai}
                    side={ai}
                    taken={material.taken[ai]}
                    ahead={ahead(ai)}
                    comment={plies.findLast((ply) => ply.side === ai)?.comment}
                    text={text}
                />
                <section class="side" aria-label={text.game}>
                    {game === null ? <p class="card empty">{text.noGame}</p> : <MoveList plies={plies} result={ended ? result : undefined} text={text} />}
                </section>
                <PlayerCard place="you" picture={<Avatar />} name={text.you} side={player} taken={material.taken[player]} ahead={ahead(player)} text={text} />
            </main>
        </>
    );
}

/** What the server sends: the game, its PGN for the player and the AI's side, null before the first game; and the AI's name, when the host gave it. */
interface Served
{
    readonly game: { readonly pgn: string; readonly ai: Side; } | null;
    readonly opponent?: string;
}

/** Sends the player's move to the server, which plays it as the chat would: the reason it was refused, or undefined once played. */
async function sendMove(move: string): Promise<string | undefined>
{
    try {
        const response = await fetch("/api/move", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ move }) });
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
