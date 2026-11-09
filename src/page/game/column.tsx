// The game's column on the right of the board (D-53): the game's card with who is ahead (D-90), the chart of the game in analysis, its opening (D-16), the
// helps (D-78), the moves, the saves and the buttons that step through them.
import type { ComponentChildren } from "preact";
import { type Opening, outOfBookMove, type Side } from "../../core/index.ts";
import { LeadBar, LeadChart } from "../lead/lead.tsx";
import { type Standing, standingAt } from "../lead/view.ts";
import { Piece } from "../pieces/pieces.tsx";
import type { Text } from "../text.ts";
import type { Step } from "./browse.ts";
import { FoldButton, useCardFold } from "./card-fold.tsx";
import type { HowEnded } from "./ending.ts";
import { MoveList, Steps } from "./move-list.tsx";
import type { Ply } from "./plies.ts";

/**
 * The column, which the player folds with its tab; under the board, where three columns would leave the board small, always open. A game in analysis
 * (D-69) says above the moves that the AI is going over it, until its word on the whole game comes, which the talk shows.
 */
export function GameColumn({ plies, result, how, lit, started, move, toMove, opening, helps, standings, analysis, shownPlies, onShow, onStep, onDownload, onSaveMoves, onAnalyse, text }: {
    plies: readonly Ply[];
    result?: string;
    how?: HowEnded;
    /** Whether the game ended a moment ago, which lights its card. */
    lit: boolean;
    started?: string;
    move: number;
    toMove: Side;
    opening?: Opening;
    /** The helps' card, under the opening, while the helps are on (D-78). */
    helps?: ComponentChildren;
    /** Who the AI saw ahead after the moves, with the helps on in a game and in analysis (D-90): the bar shows it, and in analysis the chart. */
    standings?: readonly Standing[];
    /** The game in analysis: who reviews it, and their word on the whole game, once written. */
    analysis?: { by: string; summary?: string; };
    shownPlies: number;
    onShow: (plies: number) => void;
    onStep: (step: Step) => void;
    /** In analysis: saves the game with its review as a PGN. */
    onDownload?: () => void;
    /** Saves the moves alone as a PGN, for Lichess or chess.com. */
    onSaveMoves?: () => void;
    /** Once the game is over: opens it in analysis, also from the table set for the next (D-77). */
    onAnalyse?: () => void;
    text: Text;
})
{
    const bar = standings === undefined ? undefined : <LeadBar standing={standingAt(standings, shownPlies)} shown={shownPlies} text={text} />;

    return (
        <aside class="side" id="game" aria-label={text.game}>
            {started === undefined && analysis === undefined
                ? (
                    <>
                        <p class="card empty">{text.noGame}</p>
                        {onAnalyse === undefined ? null : <AnalyseButton label={text.study.analyseLast} onAnalyse={onAnalyse} />}
                    </>
                )
                : (
                    <>
                        <GameCard plies={plies} result={result} how={how} lit={lit} started={started} move={move} toMove={toMove} bar={bar} text={text} />
                        {analysis === undefined || standings === undefined ? null : <LeadChart plies={plies} standings={standings} shown={shownPlies} onShow={onShow} text={text} />}
                        {opening === undefined ? null : <OpeningCard opening={opening} text={text} />}
                        {helps}
                        {analysis === undefined || analysis.summary !== undefined ? null : (
                            <p class="card review waiting" role="status">
                                <span class="spinner" aria-hidden="true" />
                                {text.reviewing(analysis.by)}
                            </p>
                        )}
                        <MoveList plies={plies} result={result} shown={shownPlies} onShow={onShow} text={text} />
                        {/* The saves and the analysis under the moves, over the buttons that step through them (Stefano). */}
                        {onDownload === undefined && onSaveMoves === undefined ? null : (
                            <div class="card analysis-actions">
                                {onDownload === undefined ? null : <SaveButton label={text.study.download} hint={text.study.downloadHint} onSave={onDownload} />}
                                {onSaveMoves === undefined ? null : <SaveButton label={text.saveMoves} hint={text.saveMovesHint} onSave={onSaveMoves} />}
                            </div>
                        )}
                        {onAnalyse === undefined ? null : <AnalyseButton label={text.study.analyseIt} onAnalyse={onAnalyse} />}
                        <Steps shown={shownPlies} total={plies.length} onStep={onStep} text={text} />
                    </>
                )}
        </aside>
    );
}

/** A button that saves the game as a file in the player's downloads, its tooltip saying what the file holds. */
function SaveButton({ label, hint, onSave }: { label: string; hint: string; onSave: () => void; })
{
    return (
        <button type="button" title={hint} onClick={onSave}>
            <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 4V15M7 10L12 15L17 10M5 19H19" />
            </svg>
            {label}
        </button>
    );
}

/** The button that opens the game over in analysis. */
function AnalyseButton({ label, onAnalyse }: { label: string; onAnalyse: () => void; })
{
    return (
        <div class="card analysis-actions">
            <button type="button" onClick={onAnalyse}>
                <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 4V20M8 20H16M5 7H19M5 7L2.5 13A2.5 2 0 0 0 7.5 13ZM19 7L16.5 13A2.5 2 0 0 0 21.5 13Z" />
                </svg>
                {label}
            </button>
        </div>
    );
}

/**
 * The game's card, as tall as a player's: a little board of four squares with the king to move, the move and when the game started; at the end, the result on the
 * square, the winner's king standing over the loser's, laid down, or both standing in a draw, how it ended and how many moves it lasted; lit up a moment when the
 * game ends under the player's eyes.
 */
function GameCard({ plies, result, how, lit, started, move, toMove, bar, text }: {
    plies: readonly Ply[];
    result?: string;
    how?: HowEnded;
    lit: boolean;
    /** When the game started; not known for a game in analysis played elsewhere. */
    started?: string;
    move: number;
    toMove: Side;
    /** The bar of who the AI saw ahead in the position shown (D-90). */
    bar?: ComponentChildren;
    text: Text;
})
{
    const when = started === undefined ? undefined : new Date(started).toLocaleString(text.language, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

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
                    {when === undefined ? null : <p class="when">{text.started(when)}</p>}
                    {bar}
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
                {bar}
            </div>
        </section>
    );
}

/**
 * The opening by Lichess's book: a book, crossed out once the game left it, and the family, which fold the card to them (Stefano); the variation under them,
 * and the move the game left the book at.
 */
function OpeningCard({ opening, text }: { opening: Opening; text: Text; })
{
    const [folded, toggleFold] = useCardFold("opening");
    const book = opening.inBook ? text.inBook : `${text.outOfBook} ${outOfBookMove(opening)}`;

    return (
        <section class={`card opening${folded ? " folded" : ""}`} aria-label={text.opening}>
            <h3 class="family">
                <FoldButton folded={folded} onFold={toggleFold} text={text}>
                    <span class={`book${opening.inBook ? "" : " out"}`} title={book} role="img" aria-label={book}>
                        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M12 6.5C10 5 7 4.5 4 5V18C7 17.5 10 18 12 19.5C14 18 17 17.5 20 18V5C17 4.5 14 5 12 6.5ZM12 6.5V19.5" />
                            {opening.inBook ? null : <path d="M3.5 3.5L20.5 20.5" />}
                        </svg>
                    </span>
                    <b>{opening.family}</b>
                </FoldButton>
            </h3>
            {folded || opening.variation === undefined ? null : <p class="variation">{opening.variation}</p>}
            {folded || opening.inBook ? null : <p class="out">{text.outOfBook} {outOfBookMove(opening)}</p>}
        </section>
    );
}
