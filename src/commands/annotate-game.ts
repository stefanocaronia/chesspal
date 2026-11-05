// The AI's review of a game over (D-69): a badge on each move that matters, as chess.com marks them, with a note when it needs one, and its word on the
// whole game, kept in the game's PGN for the board page. The judgment is the AI's alone: Chesspal gives no criteria (D-6, D-43).
import { z } from "zod";
import { badges, type GameRecord, reviewed, reviewOf, withGameReview } from "../core/index.ts";
import { gameInAnalysis, rewriteGame, startAnalysis } from "../games/index.ts";
import { gameFolder } from "../profiles/index.ts";
import type { Context } from "./context.ts";
import { arrowsInput, drawingsOf, noteLimit, squaresInput } from "./drawings.ts";
import { defineCommand } from "./registry.ts";
import { folderOf, moveIndex, moveNumbers, namedGame, noGameGoingOn, type Studied } from "./study.ts";

const summaryLimit = 1500;
const closingLimit = 400;

/** What the review kept: the game's name, how many moves it marked, and whether it holds a word on the whole game. */
interface Annotated
{
    game: string;
    marked: number;
    summary: boolean;
    closing: boolean;
    /** The opening book's moves still without a note of the AI's, as analyse_game numbers them. */
    bookUnnoted: string[];
}

/** The AI's badges and notes on a game over, and its word on the whole game, written into the game's PGN (D-69). */
export const annotateGame = defineCommand({
    name: "annotate_game",
    description: "Keeps your review of a game that is over for the board page: on each move that matters a badge, as chess.com has them, with a short note "
        + "when it needs one, or a note alone on a move worth a word without a badge; your word on the whole game; and a last short word on how it ended, "
        + "its win or loss. The judgment is yours: mark the moves you would point out, not every move. A note can draw arrows and colour squares on the board to show what it says. The opening book's moves have their book badge already: give each a short note too, what it is for, in the player's words; without one the page shows the opening's name from the book, in English. A move marked again takes its new badge and note. Notes in the player's language and in words, as in the chat; **two asterisks** put the few words that matter in bold, a square or a file too (**g7**, the **h** pawn). Without game, the game analyse_game gave last. Never "
        + 'while a game goes on. Example: annotate_game {notes: [{move: "12...", badge: "blunder", note: "leaves the queen to the knight"}], summary: "…", closing: "…"}.',
    input: z.object({
        game: z.string().optional().describe("the game's name, as analyse_game writes it; without it, the game analysed last"),
        notes: z.array(z.object({
            move: z.string().describe("the move, as analyse_game numbers it: 12. for White's, 12... for Black's"),
            badge: z.enum(badges).optional(),
            note: z.string().max(noteLimit).optional().describe("why, in a few sentences, with the better move when there was one"),
            arrows: arrowsInput,
            squares: squaresInput,
        })).optional().describe("the moves that matter, each with its badge, its note, or both"),
        summary: z.string().max(summaryLimit).optional().describe("your word on the whole game: a short paragraph, with a few points as lines starting with - if it helps; the moves have their own notes"),
        closing: z.string().max(closingLimit).optional().describe("your last word on how the game ended, its win or loss, in a sentence or two: the page shows it at the end"),
    }),
    run: ({ game, notes = [], summary, closing }, context): Annotated => {
        noGameGoingOn(context);

        if (notes.length === 0 && summary === undefined && closing === undefined) {
            throw new Error("Give notes on the moves that matter, your word on the whole game as summary, your last word on the ending as closing, or all of them. Nothing changed.");
        }

        const studied = game === undefined ? gameAnalysed(context) : namedGame(context, game);
        // Every move is checked before the game is written: all or nothing.
        const moves = [...studied.record.moves];

        for (const { move, badge, note, arrows = [], squares = [] } of notes) {
            if (badge === undefined && note === undefined) {
                throw new Error(`Give ${move} a badge, a note, or both: arrows and squares go with them. Nothing changed.`);
            }

            const index = moveIndex(studied.record, move);
            // A note alone on a move of the book keeps its book badge: a fact Chesspal put there, not the AI's judgment.
            const kept = badge ?? (reviewOf(moves[index]!.comment)?.badge === "book" ? "book" : undefined);
            moves[index] = reviewed(moves[index]!, { ...(kept === undefined ? {} : { badge: kept }), ...(note === undefined ? {} : { note }), ...drawingsOf(arrows, squares) });
        }

        const marked: GameRecord = { ...studied.record, moves };
        rewriteGame(
            folderOf(context, studied.name),
            studied.name,
            summary === undefined && closing === undefined ? marked : withGameReview(marked, { ...(summary === undefined ? {} : { summary }), ...(closing === undefined ? {} : { closing }) }),
        );
        startAnalysis(gameFolder(context.folder), studied.name, context.now());
        const numbers = moveNumbers(marked);
        const bookUnnoted = moves.flatMap((move, index) => {
            const review = reviewOf(move.comment);
            return review?.badge === "book" && review.note === undefined ? [numbers[index]!] : [];
        });
        return { game: studied.name, marked: notes.length, summary: summary !== undefined, closing: closing !== undefined, bookUnnoted };
    },
    format: ({ game, marked, summary, closing, bookUnnoted }) => {
        const kept = [marked === 0 ? undefined : `${marked} ${marked === 1 ? "move" : "moves"} marked`, summary ? "your word on the game" : undefined, closing ? "your last word" : undefined].filter((part) => part !== undefined);
        const book = bookUnnoted.length === 0
            ? []
            : [
                `${bookUnnoted.length === 1 ? "The book's move" : "The book's moves"} ${bookUnnoted.join(" ")} ${bookUnnoted.length === 1 ? "has" : "have"} no note of yours: `
                + "the page shows the book's English name there. A short note on each, in the player's words, takes its place.",
            ];
        return [`Kept in ${game}: ${[kept.slice(0, -1).join(", "), kept.at(-1)].filter((part) => part !== "").join(" and ")}. The board page shows them.`, ...book].join("\n");
    },
});

function gameAnalysed(context: Context): Required<Studied>
{
    const analysis = gameInAnalysis(gameFolder(context.folder));

    if (analysis === undefined) {
        throw new Error("No game is in analysis: call analyse_game first, or give the game's name as game. Nothing changed.");
    }

    return namedGame(context, analysis.game);
}
