// The game's column on the right of the board (D-53): the game's card, its opening (D-16), the moves and the buttons that step through them (T-88).
import { type Opening, outOfBookMove, type Side } from "../core/index.ts";
import type { Step } from "./browse.ts";
import type { HowEnded } from "./ending.ts";
import { MoveList, Steps } from "./move-list.tsx";
import { Piece } from "./pieces.tsx";
import type { Ply } from "./plies.ts";
import type { Text } from "./text.ts";

/** The column, which the player folds with its tab (T-84); under the board, where three columns would leave the board small, always open. */
export function GameColumn({ plies, result, how, lit, started, move, toMove, opening, shownPlies, onShow, onStep, text }: {
    plies: readonly Ply[];
    result?: string;
    how?: HowEnded;
    /** Whether the game ended a moment ago, which lights its card. */
    lit: boolean;
    started?: string;
    move: number;
    toMove: Side;
    opening?: Opening;
    shownPlies: number;
    onShow: (plies: number) => void;
    onStep: (step: Step) => void;
    text: Text;
})
{
    return (
        <aside class="side" id="game" aria-label={text.game}>
            {started === undefined ? <p class="card empty">{text.noGame}</p> : (
                <>
                    <GameCard plies={plies} result={result} how={how} lit={lit} started={started} move={move} toMove={toMove} text={text} />
                    {opening === undefined ? null : <OpeningCard opening={opening} text={text} />}
                    <MoveList plies={plies} result={result} shown={shownPlies} onShow={onShow} text={text} />
                    <Steps shown={shownPlies} total={plies.length} onStep={onStep} text={text} />
                </>
            )}
        </aside>
    );
}

/**
 * The game's card, as tall as a player's (T-84): a little board of four squares with the king to move, the move and when the game started; at the end, the result on the
 * square, the winner's king standing over the loser's, laid down, or both standing in a draw, how it ended and how many moves it lasted; lit up a moment when the
 * game ends under the player's eyes (T-77).
 */
function GameCard({ plies, result, how, lit, started, move, toMove, text }: {
    plies: readonly Ply[];
    result?: string;
    how?: HowEnded;
    lit: boolean;
    started: string;
    move: number;
    toMove: Side;
    text: Text;
})
{
    const when = new Date(started).toLocaleString(text.language, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

    if (result === undefined) {
        return (
            <section class="card game-card" aria-label={text.game}>
                <span class="tile moving" aria-hidden="true">
                    <Piece letter={toMove === "white" ? "K" : "k"} />
                </span>
                <div class="what">
                    <p class="head">
                        {text.move} <b class="big">{move}</b>
                        <span class="visually-hidden">, {text.toMove(toMove)}</span>
                    </p>
                    <p class="when">{text.started(when)}</p>
                </div>
            </section>
        );
    }

    const winner = result === "1-0" ? "white" : result === "0-1" ? "black" : undefined;
    const first = plies[0];
    const last = plies.at(-1);
    const lasted = first === undefined || last === undefined ? 0 : last.number - first.number + 1;

    return (
        <section class={`card game-card${lit ? " lit" : ""}`} aria-label={text.game}>
            {winner === undefined
                ? (
                    <span class="tile over draw" aria-hidden="true">
                        <Piece letter="K" />
                        <Piece letter="k" />
                    </span>
                )
                : (
                    <span class="tile over win" aria-hidden="true">
                        <span class="down">
                            <Piece letter={winner === "white" ? "k" : "K"} />
                        </span>
                        <span class="up">
                            <Piece letter={winner === "white" ? "K" : "k"} />
                        </span>
                    </span>
                )}
            <div class="what">
                <p class="head">
                    <b class="big">{result === "1/2-1/2" ? "½–½" : result.replace("-", "–")}</b> · {winner === undefined ? text.draw : text.won(winner)}
                </p>
                <p class="when">{how === undefined ? "" : `${text.ended[how]} · `}{text.lasted(lasted)}</p>
            </div>
        </section>
    );
}

/** The opening by Lichess's book: a book, crossed out once the game left it, and the family; the variation under them, and the move the game left the book at. */
function OpeningCard({ opening, text }: { opening: Opening; text: Text; })
{
    const book = opening.inBook ? text.inBook : `${text.outOfBook} ${outOfBookMove(opening)}`;

    return (
        <section class="card opening" aria-label={text.opening}>
            <p class="family">
                <span class={`book${opening.inBook ? "" : " out"}`} title={book} role="img" aria-label={book}>
                    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 6.5C10 5 7 4.5 4 5V18C7 17.5 10 18 12 19.5C14 18 17 17.5 20 18V5C17 4.5 14 5 12 6.5ZM12 6.5V19.5" />
                        {opening.inBook ? null : <path d="M3.5 3.5L20.5 20.5" />}
                    </svg>
                </span>
                <b>{opening.family}</b>
            </p>
            {opening.variation === undefined ? null : <p class="variation">{opening.variation}</p>}
            {opening.inBook ? null : <p class="out">{text.outOfBook} {outOfBookMove(opening)}</p>}
        </section>
    );
}
