// The board as text for the player in the chat (D-36); never the AI's view (D-26).

/** The board of a FEN as text: White at the bottom, White's pieces in capitals, a dot for an empty square, the files and ranks on every side. */
export function boardText(fen: string): string
{
    const ranks = (fen.split(" ")[0] ?? "").split("/").map((rank) => rank.replace(/\d/g, (empty) => ".".repeat(Number(empty))));
    const files = "  a b c d e f g h";
    return [files, ...ranks.map((rank, index) => `${8 - index} ${[...rank].join(" ")} ${8 - index}`), files].join("\n");
}
