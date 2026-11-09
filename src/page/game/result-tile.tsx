// The result of a game as a little board: the winner's king standing over the loser's, laid down, or both standing in a draw; the game's card and the
// list of the analyses show it.
import { Piece } from "../pieces/pieces.tsx";

/** The tile of a game's result, 1-0, 0-1 or 1/2-1/2; a star for a game without one. */
export function ResultTile({ result }: { result: string; })
{
    const winner = result === "1-0" ? "white" : result === "0-1" ? "black" : undefined;

    if (winner !== undefined) {
        return (
            <span class="tile over win" aria-hidden="true">
                <span class="down">
                    <Piece letter={winner === "white" ? "k" : "K"} />
                </span>
                <span class="up">
                    <Piece letter={winner === "white" ? "K" : "k"} />
                </span>
            </span>
        );
    }

    return result === "1/2-1/2"
        ? (
            <span class="tile over draw" aria-hidden="true">
                <Piece letter="K" />
                <Piece letter="k" />
            </span>
        )
        : <span class="tile open" aria-hidden="true">*</span>;
}
