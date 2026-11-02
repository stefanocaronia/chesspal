// The board: eight ranks of squares from a FEN, one side at the bottom, Zoe's pieces (T-9), the ranks and files on the edge squares.
import type { Move, PieceLetter, Side } from "../core/index.ts";
import { Piece } from "./pieces.tsx";
import type { Text } from "./text.ts";

/** The board of a position, seen from one side, with the last move's squares marked; its squares answer clicks while the player may move. */
export function Board({ fen, bottom, lastMove, selected, onSquare, text }: {
    fen: string;
    bottom: Side;
    lastMove?: Move;
    selected?: string;
    onSquare?: (square: string) => void;
    text: Text;
})
{
    const pieces = piecesOf(fen);
    const ranks = bottom === "white" ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
    const columns = bottom === "white" ? [...files] : [...files].reverse();

    return (
        <div class={onSquare === undefined ? "board" : "board playable"} role="grid" aria-label={text.board}>
            {ranks.flatMap((rank, row) =>
                columns.map((file, column) => {
                    const square = `${file}${rank}`;
                    const piece = pieces.get(square);
                    const dark = (files.indexOf(file) + rank) % 2 === 1;
                    const marked = lastMove !== undefined && (lastMove.from === square || lastMove.to === square);
                    const classes = ["square", dark ? "dark" : "light", marked ? "last" : "", selected === square ? "selected" : ""].filter((name) => name !== "").join(" ");
                    const label = piece === undefined ? square : `${square}, ${text.piece(piece.toUpperCase() as PieceLetter, piece === piece.toUpperCase() ? "white" : "black")}`;
                    return (
                        <div key={square} class={classes} role="gridcell" aria-label={label} onClick={onSquare === undefined ? undefined : () => onSquare(square)}>
                            {column === 0 ? <span class="coordinate rank">{rank}</span> : null}
                            {row === 7 ? <span class="coordinate file">{file}</span> : null}
                            {piece === undefined ? null : <Piece letter={piece} />}
                        </div>
                    );
                })
            )}
        </div>
    );
}

/** The pieces of a FEN by square, as its letters: uppercase for White. */
export function piecesOf(fen: string): Map<string, string>
{
    const pieces = new Map<string, string>();
    const rows = (fen.split(" ")[0] ?? "").split("/");

    rows.forEach((row, index) => {
        let file = 0;

        for (const letter of row) {
            if (/\d/.test(letter)) {
                file += Number(letter);
            } else {
                pieces.set(`${files[file]}${8 - index}`, letter);
                file += 1;
            }
        }
    });

    return pieces;
}

const files = "abcdefgh";
