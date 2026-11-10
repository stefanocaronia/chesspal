// The AI's review of a game over (D-69): a badge on each move that matters, as chess.com marks them, with a note when it needs one, and its word on the
// whole game, kept in the game's PGN for the board page. The judgment is the AI's alone: Chesspal gives no criteria (D-6, D-43).
import { z } from "zod";
import { annotatorOf, badges, Game, type GameRecord, leadOf, reviewed, reviewOf, withAnnotator, withGameReview, withLead } from "../core/index.ts";
import { gameInAnalysis, rewriteGame, startAnalysis } from "../games/index.ts";
import { analystAgent } from "../host-files/index.ts";
import { gameFolder } from "../profiles/index.ts";
import { analystRuns } from "./agents.ts";
import type { Context } from "./context.ts";
import { arrowsInput, drawingsOf, noteInput, squaresInput } from "./drawings.ts";
import { leadFrom, leadInput } from "./lead-input.ts";
import { defineCommand } from "./registry.ts";
import { moveIndex, moveNumbers, namedGame, noGameGoingOn, type Studied } from "./study.ts";

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
    /** How many moves took who is ahead after them, and those still without it, as analyse_game numbers them (D-90). */
    estimated: number;
    unestimated: string[];
    /** The moves whose note the chat corrected with the player, told the analyst at each call: its notes leave them as they are (D-101). */
    left: string[];
}

// How many moves still without who is ahead the answer names; the rest it counts.
const unestimatedShown = 10;

/** The AI's badges and notes on a game over, and its word on the whole game, written into the game's PGN (D-69). */
export const annotateGame = defineCommand({
    name: "annotate_game",
    description: "Keeps your review of a game that is over for the board page: on each move that matters a badge, as chess.com has them, with a short note "
        + "when it needs one, or a note alone on a move worth a word without a badge; your word on the whole game; and a last short word on how it ended, "
        + "its win or loss; and who is ahead after every move as ahead, for the page's bar and chart. The judgment is yours: mark the moves you would point out, not every move. A note can draw arrows and colour squares on the board to show what it says. The opening book's moves have their book badge already: give each a short note too, what it is for, in the player's words; without one the page shows the opening's name from the book, in English. A move marked again takes its new badge and note. Notes in the player's language and in words, as in the chat; **two asterisks** put the few words that matter in bold, a square or a file too (**g7**, the **h** pawn). Without game, the game analyse_game gave last. Never "
        + 'while a game goes on. Example: annotate_game {notes: [{move: "12...", badge: "blunder", note: "leaves the queen to the knight"}], ahead: {"1.": 0.3, "1...": 0.2, "12...": 3.5, "13.": "#4"}, '
        + 'summary: "…", closing: "…"}.',
    input: z.object({
        game: z.string().optional().describe("the game's name, as analyse_game writes it; without it, the game analysed last"),
        notes: z.array(z.object({
            move: z.string().describe("the move, as analyse_game numbers it: 12. for White's, 12... for Black's"),
            badge: z.enum(badges).optional(),
            note: noteInput.optional().describe("why, in a few sentences, with the better move when there was one"),
            arrows: arrowsInput,
            squares: squaresInput,
        })).optional().describe("the moves that matter, each with its badge, its note, or both"),
        ahead: z.record(z.string(), leadInput).optional().describe(
            "who is ahead after each move, by the move as analyse_game numbers it: pawns from White's side as chess.com shows it, 1.5 for White, -3 for Black, 0 for "
                + 'even, or a mate you see in moves of the side that mates, "#3" for White\'s, "#-3" for Black\'s; every move, in one call or a few; a move given again '
                + "takes its new figure",
        ),
        summary: z.string().max(summaryLimit).optional().describe("your word on the whole game: a short paragraph, with a few points as lines starting with - if it helps; the moves have their own notes"),
        closing: z.string().max(closingLimit).optional().describe("your last word on how the game ended, its win or loss, in a sentence or two: the page shows it at the end"),
    }),
    sharedWith: [analystAgent],
    run: async ({ game, notes = [], ahead = {}, summary, closing }, context): Promise<Annotated> => {
        noGameGoingOn(context);
        const estimates = Object.entries(ahead);

        if (notes.length === 0 && estimates.length === 0 && summary === undefined && closing === undefined) {
            throw new Error(
                "Give notes on the moves that matter, who is ahead after each move as ahead, your word on the whole game as summary, your last word on the ending as "
                    + "closing, or all of them. Nothing changed.",
            );
        }

        // Who reviews it, before the game is read: no wait between reading and writing it, in which the coach's judgment or another review written meanwhile
        // would be lost (Federico).
        const caller = await context.caller?.();
        const studied = game === undefined ? gameAnalysed(context) : namedGame(context, game);
        const folder = gameFolder(context.home());
        const numbers = moveNumbers(studied.record);
        // Where the analyst reviews the games, the chat's notes are corrections it made with the player: the analyst, at work then or later, leaves those notes
        // and is told of them at each call, and the chat is not asked for the analyst's work (D-101, Priya). Only a call the host ties to the chat is its own.
        const correction = context.chat === true && analystRuns(context) && estimates.length === 0 && summary === undefined && closing === undefined;
        const analysis = gameInAnalysis(folder);
        const corrected = context.chat !== true && analysis?.game === studied.name ? analysis.corrected ?? [] : [];
        let skipped = 0;
        // Every move is checked before the game is written: all or nothing.
        const moves = [...studied.record.moves];

        for (const { move, badge, note, arrows = [], squares = [] } of notes) {
            if (badge === undefined && note === undefined) {
                throw new Error(`Give ${move} a badge, a note, or both: arrows and squares go with them. Nothing changed.`);
            }

            const index = indexIn(studied.record, move, "notes");

            if (corrected.includes(numbers[index]!)) {
                skipped += 1;
                continue;
            }

            // A note alone on a move of the book keeps its book badge: a fact Chesspal put there, not the AI's judgment.
            const kept = badge ?? (reviewOf(moves[index]!.comment)?.badge === "book" ? "book" : undefined);
            moves[index] = reviewed(moves[index]!, { ...(kept === undefined ? {} : { badge: kept }), ...(note === undefined ? {} : { note }), ...drawingsOf(arrows, squares) });
        }

        for (const [move, lead] of estimates) {
            const index = indexIn(studied.record, move, "ahead");
            moves[index] = withLead(moves[index]!, leadFrom(lead));
        }

        // Who reviewed it, as far as the host says it for certain (D-81): on the command line, or by a host that names no model over one that did, as it was.
        const kept = caller === undefined || (caller.hostOnly === true && annotatorOf(studied.record) !== undefined);
        const marked: GameRecord = { ...(kept ? studied.record : withAnnotator(studied.record, caller)), moves };
        rewriteGame(
            folder,
            studied.name,
            summary === undefined && closing === undefined ? marked : withGameReview(marked, { ...(summary === undefined ? {} : { summary }), ...(closing === undefined ? {} : { closing }) }),
        );
        startAnalysis(folder, studied.name, context.now(), false, correction ? notes.map(({ move }) => numbers[indexIn(studied.record, move, "notes")]!) : []);
        const bookUnnoted = moves.flatMap((move, index) => {
            const review = reviewOf(move.comment);
            return review?.badge === "book" && review.note === undefined ? [numbers[index]!] : [];
        });
        return {
            game: studied.name,
            marked: notes.length - skipped,
            summary: summary !== undefined,
            closing: closing !== undefined,
            bookUnnoted: correction ? [] : bookUnnoted,
            estimated: estimates.length,
            // Asked every time, of an older review too: an analyst whose instructions predate the estimates learns of them here.
            unestimated: correction ? [] : unestimatedMoves(marked, numbers),
            left: [...corrected],
        };
    },
    format: ({ game, marked, summary, closing, bookUnnoted, estimated, unestimated, left }) => {
        const kept = [
            marked === 0 ? undefined : `${marked} ${marked === 1 ? "move" : "moves"} marked`,
            estimated === 0 ? undefined : `who is ahead after ${estimated} ${estimated === 1 ? "move" : "moves"}`,
            summary ? "your word on the game" : undefined,
            closing ? "your last word" : undefined,
        ].filter((part) => part !== undefined);
        const book = bookUnnoted.length === 0
            ? []
            : [
                `${bookUnnoted.length === 1 ? "The book's move" : "The book's moves"} ${bookUnnoted.join(" ")} ${bookUnnoted.length === 1 ? "has" : "have"} no note of yours: `
                + "the page shows the book's English name there. A short note on each, in the player's words, takes its place.",
            ];
        const shown = unestimated.slice(0, unestimatedShown).join(" ");
        const more = unestimated.length > unestimatedShown ? ` and ${unestimated.length - unestimatedShown} more` : "";
        const ahead = unestimated.length === 0 ? [] : [`Who is ahead is still missing after ${shown}${more}: give it with ahead, for the page's bar and chart.`];
        const one = left.length === 1;
        const corrected = left.length === 0
            ? []
            : [`${left.join(" ")} ${one ? "keeps the note" : "keep the notes"} the AI wrote with the player: leave ${one ? "it" : "them"}, and don't contradict ${one ? "it" : "them"} in your summary${
                summary ? "; if this one does, give it again" : ""
            }.`];
        const head = kept.length === 0 ? `Nothing new kept in ${game}.` : `Kept in ${game}: ${[kept.slice(0, -1).join(", "), kept.at(-1)].filter((part) => part !== "").join(" and ")}. The board page shows them.`;
        return [head, ...corrected, ...book, ...ahead].join("\n");
    },
});

/** The moves without who is ahead after them, as analyse_game numbers them: all but the last when the board ended the game there, which says it. */
function unestimatedMoves(record: GameRecord, numbers: readonly string[]): string[]
{
    const ended = new Game(record).outcome.over;
    return record.moves.flatMap((move, index) => leadOf(move.comment) !== undefined || (ended && index === record.moves.length - 1) ? [] : [numbers[index]!]);
}

/** A move given in notes or in ahead, as analyse_game numbers it, refused with where it was given (Priya). */
function indexIn(record: GameRecord, move: string, field: "notes" | "ahead"): number
{
    try {
        return moveIndex(record, move);
    } catch (error) {
        const message = (error as Error).message;
        throw new Error(`In ${field}, ${message.charAt(0).toLowerCase()}${message.slice(1)} Nothing changed.`);
    }
}

function gameAnalysed(context: Context): Required<Studied>
{
    // The game in analysis follows the board page, which the player may turn to another game while an agent works (Federico).
    if (context.agent !== undefined) {
        throw new Error("Give the game's name as game, as analyse_game named it: the board page may have opened another game since. Nothing changed.");
    }

    const analysis = gameInAnalysis(gameFolder(context.home()));

    if (analysis === undefined) {
        throw new Error("No game is in analysis: call analyse_game first, or give the game's name as game. Nothing changed.");
    }

    return namedGame(context, analysis.game);
}
