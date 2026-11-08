// The board as text for the player in the chat (D-36), with the pieces' figurines (D-83); never the AI's view (D-26).

/** The pieces' figurines by their FEN letters; the black pawn's asks for its text form, since alone it shows as an emoji. */
export const figurines: Readonly<Record<string, string>> = { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙", k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟︎" };

/**
 * The board of a FEN as text: White at the bottom, the pieces as Unicode figurines, the empty squares and the files as signs a browser draws as wide as the
 * figurines and a terminal in one cell each, so that the columns stay in line in Claude's desktop app and in a terminal alike.
 */
export function boardText(fen: string): string
{
    const ranks = (fen.split(" ")[0] ?? "").split("/").map((rank) => rank.replace(/\d/g, (empty) => ".".repeat(Number(empty))));
    const files = `  ${fileSigns.join(" ")}`;
    return [files, ...ranks.map((rank, index) => `${8 - index} ${[...rank].map((square) => figurines[square] ?? emptySquare).join(" ")} ${8 - index}`), files].join("\n");
}

const emptySquare = "⊙";
const fileSigns = [..."ⓐⓑⓒⓓⓔⓕⓖⓗ"];
