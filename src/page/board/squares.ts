// The squares of a board and the pieces on them, read from a FEN.

/** The files' letters, from White's left. */
export const files = "abcdefgh";

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

/** The square of the king whose side is to move in a FEN. */
export function kingToMove(fen: string, pieces: ReadonlyMap<string, string>): string | undefined
{
    const king = fen.split(" ")[1] === "b" ? "k" : "K";
    return [...pieces].find(([, letter]) => letter === king)?.[0];
}
