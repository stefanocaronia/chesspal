// A game as plain data: the form it takes on disk (D-27) and in a PGN.

/** A judgment on a move: NAGs ($1 good move, $2 mistake, $3 brilliant…) and a comment. */
export interface Annotation
{
    readonly nags?: readonly number[];
    readonly comment?: string;
}

/** A move of a recorded game: its SAN and its judgment. */
export interface RecordedMove extends Annotation
{
    readonly san: string;
}

/** A game as plain data: its PGN tags (a FEN tag when it starts from another position), the comment before its first move, its moves. */
export interface GameRecord
{
    readonly tags: Readonly<Record<string, string>>;
    readonly comment?: string;
    readonly moves: readonly RecordedMove[];
}

/** The game with its tags and moves alone, without comments, plans or judgments: for Lichess or chess.com to load (T-59). */
export function movesOnly(record: GameRecord): GameRecord
{
    return { tags: record.tags, moves: record.moves.map((move) => ({ san: move.san })) };
}

/** A recorded move, frozen, with only the annotations it has. */
export function recordedMove(san: string, nags: readonly number[] = [], comment = ""): RecordedMove
{
    const wrong = nags.find((nag) => !Number.isInteger(nag) || nag < 0 || nag > 255);

    if (wrong !== undefined) {
        throw new RangeError(`${wrong} is not a NAG: NAGs are whole numbers from 0 to 255.`);
    }

    const text = cleanComment(comment);
    const move: { san: string; nags?: readonly number[]; comment?: string; } = { san };

    if (nags.length > 0) {
        move.nags = Object.freeze([...nags]);
    }

    if (text !== "") {
        move.comment = text;
    }

    return Object.freeze(move);
}

/** A comment as PGN can hold it: on one line, without a closing brace. */
export function cleanComment(text: string): string
{
    return text.replaceAll("}", "").replace(/\s+/g, " ").trim();
}
