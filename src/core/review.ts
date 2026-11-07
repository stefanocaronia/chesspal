// The AI's review of a game (D-69): a badge and a note on the moves that matter, as chess.com marks them, and its word on the whole game. They ride in the
// comments as [%badge …] and [%review …], beside the NAG of the badges that have one, which other programs show.
import { type GameRecord, type RecordedMove, recordedMove } from "./record.ts";

/** The badges of a move, as chess.com has them, from the best to the worst. */
export const badges = ["brilliant", "great", "best", "excellent", "good", "book", "inaccuracy", "mistake", "miss", "blunder"] as const;

/** A move's badge. */
export type Badge = (typeof badges)[number];

/** The colours the AI draws with on the board, by the letters PGN's [%cal] and [%csl] write them with. */
export const drawColours = { G: "green", R: "red", Y: "yellow", B: "blue" } as const;

/** A colour the AI draws with. */
export type DrawColour = (typeof drawColours)[keyof typeof drawColours];

/** An arrow the AI draws to show its note: from a square to another, in a colour. */
export interface DrawnArrow
{
    readonly colour: DrawColour;
    readonly from: string;
    readonly to: string;
}

/** A square the AI colours to show its note. */
export interface DrawnSquare
{
    readonly colour: DrawColour;
    readonly square: string;
}

/** The AI's word on a move: its badge, its note, or both, and the arrows and squares it draws to show it. */
export interface MoveReview
{
    readonly badge?: Badge;
    readonly note?: string;
    readonly arrows?: readonly DrawnArrow[];
    readonly squares?: readonly DrawnSquare[];
}

/** The review a move's comment carries: a badge, a note or both, with the arrows and squares drawn to show it; none without a badge or a note. */
export function reviewOf(comment: string | undefined): MoveReview | undefined
{
    const found = badgePattern.exec(comment ?? "")?.[1];
    const badge = isBadge(found) ? found : undefined;
    const note = notePattern.exec(comment ?? "")?.[1]?.trim() || undefined;
    return badge === undefined && note === undefined ? undefined : { ...(badge === undefined ? {} : { badge }), ...(note === undefined ? {} : { note }), ...drawingsIn(comment) };
}

/** The arrows and squares a move's comment carries, as the AI draws them with its move when the helps are on (D-78); none without any. */
export function drawingsIn(comment: string | undefined): Pick<MoveReview, "arrows" | "squares">
{
    const arrows = drawn(arrowPattern, comment, arrowOf);
    const squares = drawn(squarePattern, comment, squareOf);
    return { ...(arrows.length === 0 ? {} : { arrows }), ...(squares.length === 0 ? {} : { squares }) };
}

/** An arrow as PGN's [%cal] writes it, a colour's letter and two squares (Gf6e4); none when it is not one. */
export function arrowOf(text: string): DrawnArrow | undefined
{
    const [, colour, from, to] = /^([GRYB])([a-h][1-8])([a-h][1-8])$/.exec(text.trim()) ?? [];
    return colour === undefined || from === undefined || to === undefined || from === to ? undefined : { colour: drawColours[colour as keyof typeof drawColours], from, to };
}

/** A square as PGN's [%csl] writes it, a colour's letter and the square (Rf2); none when it is not one. */
export function squareOf(text: string): DrawnSquare | undefined
{
    const [, colour, square] = /^([GRYB])([a-h][1-8])$/.exec(text.trim()) ?? [];
    return colour === undefined || square === undefined ? undefined : { colour: drawColours[colour as keyof typeof drawColours], square };
}

/** What the AI wrote about the whole game, when it wrote something; its points start with " • ". */
export function gameReviewOf(record: GameRecord): string | undefined
{
    return notePattern.exec(record.comment ?? "")?.[1]?.trim() || undefined;
}

/** The AI's last word on how the game ended, when it wrote one. */
export function closingOf(record: GameRecord): string | undefined
{
    return closingPattern.exec(record.comment ?? "")?.[1]?.trim() || undefined;
}

/** The move with the AI's review in place of the one it had: the NAG of its badge, and its badge and note in the comment, beside what the comment held. */
export function reviewed(move: RecordedMove, review: MoveReview): RecordedMove
{
    const nag = review.badge === undefined ? undefined : nagOfBadge[review.badge];
    const nags = (move.nags ?? []).filter((one) => !judgmentNags.has(one));
    const note = review.note === undefined ? "" : noteText(review.note);

    const comment = [
        withoutReview(move.comment),
        review.badge === undefined ? "" : `[%badge ${review.badge}]`,
        note === "" ? "" : `[%review ${note}]`,
        drawingsText(review),
    ].filter((part) => part !== "").join(" ");
    return recordedMove(move.san, nag === undefined ? nags : [nag, ...nags], comment);
}

/** The arrows and squares as PGN's [%cal] and [%csl] write them, for a comment; empty without any. */
export function drawingsText({ arrows = [], squares = [] }: Pick<MoveReview, "arrows" | "squares">): string
{
    const arrowList = arrows.map(({ colour, from, to }) => `${letterOf(colour)}${from}${to}`).join(",");
    const squareList = squares.map(({ colour, square }) => `${letterOf(colour)}${square}`).join(",");
    return [arrowList === "" ? "" : `[%cal ${arrowList}]`, squareList === "" ? "" : `[%csl ${squareList}]`].filter((part) => part !== "").join(" ");
}

/** The record with who reviewed it (D-81): the model, else the host, as PGN's Annotator, and the effort only when known; an effort no longer known goes. */
export function withAnnotator(record: GameRecord, { annotator, effort }: { annotator: string; effort?: string; }): GameRecord
{
    return { ...record, tags: signed(record.tags, ["Annotator", effortTag], annotator, effort) };
}

/** The AI's model, as the host writes it, and its effort when the host gives it (D-82). */
export interface AiModel
{
    readonly model: string;
    readonly effort?: string;
}

/** The record with the model the AI played it with (D-82), and the effort only when known; with none known, as it is. */
export function withAiModel(record: GameRecord, played: AiModel | undefined): GameRecord
{
    return played === undefined ? record : { ...record, tags: signed(record.tags, ["AIModel", "AIEffort"], played.model, played.effort) };
}

/** Who reviewed the game, as its tags say: the Annotator, and the effort when known; undefined without an Annotator. */
export function annotatorOf(record: GameRecord): { annotator: string; effort?: string; } | undefined
{
    const found = signerOf(record.tags, ["Annotator", effortTag]);
    return found === undefined ? undefined : { annotator: found.model, ...(found.effort === undefined ? {} : { effort: found.effort }) };
}

/** The model the AI played the game with, as its tags say (D-82), and the effort when known; undefined without one. */
export function aiModelIn(record: GameRecord): AiModel | undefined
{
    return signerOf(record.tags, ["AIModel", "AIEffort"]);
}

// The effort has no tag of its own in PGN: Chesspal's sits beside the Annotator.
const effortTag = "AnnotatorEffort";

/** A model and its effort as the tags say, each only when not blank; undefined without the model. */
function signerOf(tags: Record<string, string>, [modelTag, modelEffortTag]: [string, string]): AiModel | undefined
{
    const model = tags[modelTag]?.trim();
    const effort = tags[modelEffortTag]?.trim();

    if (model === undefined || model === "") {
        return undefined;
    }

    return effort === undefined || effort === "" ? { model } : { model, effort };
}

/** The tags with a model and its effort, last: an effort no longer known goes. */
function signed(tags: Record<string, string>, [modelTag, modelEffortTag]: [string, string], model: string, effort: string | undefined): Record<string, string>
{
    const others = Object.entries(tags).filter(([name]) => name !== modelTag && name !== modelEffortTag);
    return { ...Object.fromEntries(others), [modelTag]: model, ...(effort === undefined ? {} : { [modelEffortTag]: effort }) };
}

/** The record with the AI's word on the whole game, or its last word on the ending, in place of the one it had: each only when given. */
export function withGameReview(record: GameRecord, { summary, closing }: { summary?: string; closing?: string; }): GameRecord
{
    const summed = summary === undefined ? gameReviewOf(record) : noteText(summary);
    const closed = closing === undefined ? closingOf(record) : noteText(closing);
    const comment = [withoutReview(record.comment), summed ? `[%review ${summed}]` : "", closed ? `[%closing ${closed}]` : ""].filter((part) => part !== "").join(" ");
    return comment === "" ? { tags: record.tags, moves: record.moves } : { tags: record.tags, comment, moves: record.moves };
}

/** Whether a word is one of the badges. */
export function isBadge(word: string | undefined): word is Badge
{
    return (badges as readonly string[]).includes(word ?? "");
}

// The NAGs that judge a move ($1 to $6): a new badge takes their place.
const judgmentNags = new Set([1, 2, 3, 4, 5, 6]);
// The badges PGN has a NAG for: !! ! ?! ? ??.
const nagOfBadge: Partial<Record<Badge, number>> = { brilliant: 3, great: 1, inaccuracy: 6, mistake: 2, blunder: 4 };
const badgePattern = /\[%badge (\w+)\]/;
const notePattern = /\[%review ([^\]]*)\]/;
const closingPattern = /\[%closing ([^\]]*)\]/;
const arrowPattern = /\[%cal ([^\]]*)\]/;
const squarePattern = /\[%csl ([^\]]*)\]/;

/** A comment without the review it carried, its drawings with it. */
function withoutReview(comment: string | undefined): string
{
    return (comment ?? "").replace(/\s*\[%(badge|review|closing|cal|csl) [^\]]*\]/g, "").trim();
}

/** The drawings of one kind a comment carries, those that read. */
function drawn<Drawn>(pattern: RegExp, comment: string | undefined, read: (text: string) => Drawn | undefined): Drawn[]
{
    return (pattern.exec(comment ?? "")?.[1] ?? "").split(",").map(read).filter((one) => one !== undefined);
}

/** A colour's letter in [%cal] and [%csl]. */
function letterOf(colour: DrawColour): string
{
    return Object.entries(drawColours).find(([, name]) => name === colour)![0];
}

/** A note as a comment's command can hold it: on one line, without brackets or braces, a point of a list starting with " • ". */
function noteText(text: string): string
{
    return text.replace(/[[\]{}]/g, "").replace(/^[ \t]*[-*•][ \t]+/gm, " • ").replace(/\s+/g, " ").trim();
}
