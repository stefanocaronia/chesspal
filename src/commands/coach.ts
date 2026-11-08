import { z } from "zod";
import { type Badge, badges, Game, type GameRecord, leadText, levelOf, materialOf, type Move, type Side, withSanLetters } from "../core/index.ts";
import { archiveCoached, coachWaitingSince, coachWords, type CurrentGame, endOf, keepHint, keepJudgment, keepLead, loadGame, startCoach } from "../games/index.ts";
import { coachAgent } from "../host-files/index.ts";
import { activeProfile, gameFolder, helpsIn } from "../profiles/index.ts";
import { clockLine, clockSummaryOf } from "./clock.ts";
import type { Context } from "./context.ts";
import { arrowsInput, drawingsOf, noteInput, squaresInput } from "./drawings.ts";
import { lastMoves, speechLine, speechOf } from "./game-summary.ts";
import { aheadWords, leadFrom, leadInput } from "./lead-input.ts";
import { knownMoves, openingLine } from "./opening-book.ts";
import { waitForPlayer, wordsOf } from "./ponder.ts";
import { profileLines } from "./position.ts";
import { defineCommand } from "./registry.ts";
import { colourName, compactView, materialText, riskLine } from "./view.ts";

/** What coach answers: stop, the moves to work on, the words kept and what comes next, or still the player's move; with the game's key and the position. */
type Coached =
    | { stop: "moved" | "waited" | "helps" | "started"; }
    | { start: string[]; }
    | { kept: Place; then: "wait" | "moved" | "over"; saved: string[]; hintLeft: boolean; }
    | { waiting: Place; };

/** The game, by its key, and the position in it the coach works on. */
interface Place
{
    readonly game: string;
    readonly position: number;
}

// The badges the coach gives: the book's is Chesspal's, never a judgment (D-69).
const judgments = badges.filter((badge) => badge !== "book") as [Exclude<Badge, "book">, ...Exclude<Badge, "book">[]];

/**
 * The coach (D-80, D-88), for the agent that judges the player's moves and gives them hints with the helps on: every fact, never the opponent's plan; its
 * words go to the board page alone, never to the opponent. Its calls are not the chat's, and the server refuses them from the chat. Offered to Claude Code alone.
 */
export const coach = defineCommand({
    name: "coach",
    description: "For the chesspal-coach agent only, never from the chat: Chesspal's answers say when to start it. coach {} gives the player's move to judge and the position "
        + "they are to move in; coach {game, position, ahead, badge, note, hint, arrows, squares} keeps who is ahead there, while the game goes on, and your judgment and your hint, "
        + "each only when there is something to say; coach {game, position, done: true} waits for their move. Whenever it says stop, stop. "
        + 'Example: coach {game: "t3k9qa", position: 24, ahead: -0.8, badge: "mistake", note: "It leaves the d5 pawn without a defender.", hint: "Look at what defends their king now."}.',
    input: z.object({
        game: z.string().optional().describe("the game's key, as coach {} gives it"),
        position: z.int().min(0).optional().describe("the position's number, as coach {} gives it"),
        ahead: leadInput.optional().describe(
            "who is ahead in the position the player is to move in, for the page's bar: pawns from White's side, 1.5 for White, -3 for Black, 0 for even, or a mate "
                + 'you see in moves of the side that mates, "#3" for White\'s, "#-3" for Black\'s',
        ),
        badge: z.enum(judgments).optional().describe("your badge on the player's move, as chess.com names them, only on a move that stands out, never on a routine one"),
        note: noteInput.optional().describe("why, on the player's move, in a sentence or two, in their language"),
        hint: noteInput.optional().describe(
            "a hint for their turn, in a sentence or two, in their language, only when there is something to find: what is on the board (a piece, a square, a file, a "
                + "threat of the opponent's, a goal), never what to play",
        ),
        arrows: arrowsInput.describe(
            "only with a hint: arrows on the board as it is now, never a move the player can play: Rf2e1; R red: a threat of the opponent's; B blue: a plan or a target; "
                + "Y yellow: a line; G green: a good idea",
        ),
        squares: squaresInput.describe("only with a hint: squares to mark on the board as it is now: Rf2; colours as for arrows"),
        done: z.boolean().optional().describe("true once you have kept your words: it waits for the player's move"),
    }),
    byAgents: [coachAgent],
    host: "claude-code",
    run: async ({ game, position, ahead, badge, note, hint, arrows, squares, done = false }, context): Promise<Coached> => {
        const folder = gameFolder(context.home());
        const current = loadGame(folder);
        const words = { ahead, badge, note, hint, arrows, squares };
        const writes = Object.values(words).some((word) => word !== undefined);

        if (!helpsIn(folder)) {
            return { stop: "helps" };
        }

        if (game === undefined || position === undefined) {
            if (writes || done || game !== undefined || position !== undefined) {
                throw new Error("Give the game's key and the position's number with it: call coach {} first, which gives them. Nothing changed.");
            }

            const start = current === undefined ? undefined : startOf(current, folder, context);

            if (start === undefined || current === undefined) {
                return { stop: "moved" };
            }

            // The chat may start a second coach on the same position, told again before the first called: one judges it (Priya, playtest of T-112).
            return startCoach(folder, current) ? { start } : { stop: "started" };
        }

        // A new game may have started while the coach thought on the last one: its words never go to another game (Federico, review of T-112).
        if (current === undefined || gameKey(current) !== game || position > current.game.record.moves.length) {
            return { stop: "moved" };
        }

        const place = { game, position };

        if (!done) {
            return keep(folder, current, place, words);
        }

        if (writes) {
            throw new Error(`Keep your words first, then call ${call(place, "done: true")} alone. Nothing changed.`);
        }

        const since = coachWaitingSince(folder, current, position, context.now());
        const waited = await waitForPlayer(context, since, () => !theirTurn(loadGame(folder), place));
        return waited === "waiting" ? { waiting: place } : { stop: waited };
    },
    format: (coached) => {
        if ("stop" in coached) {
            return coached.stop === "helps"
                ? "Stop now: the player has turned the helps off. End with one word."
                : coached.stop === "started"
                ? "Stop now: another coach works on this position. End with one word."
                : coached.stop === "moved"
                ? "Stop now: the player has moved, or the game is over. End with one word."
                : "Stop now: you have waited long enough. End with one word.";
        }

        if ("start" in coached) {
            return coached.start.join("\n");
        }

        if ("kept" in coached) {
            return keptText(coached);
        }

        return `Still the player's move: call ${call(coached.waiting, "done: true")} again.`;
    },
});

/** What a call kept, and what comes next: wait for the player's move, or stop, as they have moved or the game is over, with the hint that came too late. */
function keptText({ kept, then, saved, hintLeft }: Extract<Coached, { kept: Place; }>): string
{
    const what = saved.length === 0 ? "nothing" : saved.join(", ");

    if (then === "wait") {
        return `Kept on the board page: ${what}. Now call ${call(kept, "done: true")} alone.`;
    }

    const late = hintLeft ? ", so your hint is not kept" : "";
    return then === "moved"
        ? `Kept: ${what}; the player has moved${late}. Stop now: end with one word.`
        : `Kept for the game's record: ${what}; the game is over${late}. Stop now: end with one word.`;
}

/** A call of coach on a game's position, with what else it gives. */
function call({ game, position }: Place, rest: string): string
{
    return `coach {game: "${game}", position: ${position}, ${rest}}`;
}

/** The game's short key, from its start: the coach names the game it works on, so that its words never go to the next one. */
function gameKey(current: CurrentGame): string
{
    return Math.floor(Date.parse(current.started) / 1000).toString(36);
}

/** What the coach writes in a call. */
interface Words
{
    ahead?: number | string | undefined;
    badge?: Exclude<Badge, "book"> | undefined;
    note?: string | undefined;
    hint?: string | undefined;
    arrows?: string[] | undefined;
    squares?: string[] | undefined;
}

/** How many plies of the game the coach shows: enough to follow it, few enough for its budget. */
const pliesShown = 40;

/**
 * What the coach works on, from the position the player is to move in, or the game over: the game, the player's move the opponent answered, or their own
 * that ended the game, with the position they played it in and the book there, and the position now with the hint it gave last; none while the opponent is
 * to move.
 */
function startOf(current: CurrentGame, folder: string, context: Context): string[] | undefined
{
    const { game, ai } = current;
    const { record } = game;
    const plies = record.moves.length;
    const over = endOf(game);
    const player: Side = ai === "white" ? "black" : "white";
    const judged = judgedPly(current, plies);

    if ((game.position.turn === ai && over === undefined) || (over !== undefined && judged === undefined)) {
        return undefined;
    }

    const place = { game: gameKey(current), position: plies };
    const ender = game.position.turn === ai ? "the player's" : "the opponent's";
    const head = over === undefined
        ? `Game "${place.game}", position ${plies}: the player (${colourName(player)}) to move, move ${game.position.moveNumber}; the opponent plays ${colourName(ai)} at the `
            + `${levelOf(record)} level.`
        : `Game "${place.game}", position ${plies}: the game is over, ${over.result}${over.termination === undefined ? "" : `, ${over.termination}`}, with ${ender} move.`;
    const speech = speechOf(folder, context.language);
    const clock = clockSummaryOf(current, context.now());
    const keepLine = over === undefined
        ? `Keep your words: ${call(place, "ahead, badge, note, hint, arrows, squares")}, who is ahead always, the rest only when there is something to say; then `
            + `${call(place, "done: true")}.`
        : `No hint: the game is over. Keep your judgment, when their move stands out: ${call(place, "badge, note")}; then end with one word.`;

    return [
        head,
        speech === undefined ? "The player speaks English." : speechLine(speech),
        ...playerLines(context),
        ...movesLines(record),
        ...(clock === undefined ? [] : [clockLine(clock, ai)]),
        ...(judged === undefined ? [] : judgedLines(current, judged, player)),
        ...(over === undefined ? nowLines(current, folder, player) : []),
        keepLine,
    ];
}

/** The game's moves as the coach reads them, with the position a game set up began in, the last ones of a long game, and its opening by the book (Anatolij, T-112). */
function movesLines(record: GameRecord): string[]
{
    const opening = openingLine(record);
    return [
        ...(record.tags.FEN === undefined ? [] : [`The game began from a set position: ${record.tags.FEN}`]),
        `${record.moves.length > pliesShown ? `Moves (the last ${pliesShown} plies)` : "Moves"}: ${lastMoves(record, pliesShown)}`,
        ...(opening === undefined ? [] : [`Opening: ${opening}`]),
    ];
}

/**
 * The plies up to the player's move a judgment at `position` is for: the one the opponent answered, or the player's own when the opponent is to move, as
 * after their move that ended the game (D-88); none before their first move.
 */
function judgedPly(current: CurrentGame, position: number): number | undefined
{
    const ply = sideToMoveAt(current, position) === current.ai ? position : position - 1;
    return ply >= 1 ? ply : undefined;
}

/**
 * The player's move to judge, the position they played it in with the book there, and, when the opponent answered it, what it left at risk and the checks
 * it let the opponent give (Anatolij, review of T-112), and the answer with its words.
 */
function judgedLines({ game }: CurrentGame, ply: number, player: Side): string[]
{
    const { record } = game;
    const before = new Game({ tags: record.tags, moves: record.moves.slice(0, ply - 1) });
    const played = { tags: record.tags, moves: record.moves.slice(0, ply) };
    const book = knownMoves(before.position.fen);
    const lines = [
        `Their move to judge: ${lastMoves(played, 1)}. The position they played it in:`,
        `FEN: ${before.position.fen}`,
        `Material: ${materialText(materialOf(before.position.fen))}`,
        ...compactView(before.facts, player),
        ...(book.length === 0 ? [] : [`Book moves there, most named lines first: ${book.join(", ")}`]),
    ];

    if (ply === record.moves.length) {
        return lines;
    }

    const after = new Game(played).facts;
    const answer = lastMoves({ tags: record.tags, moves: record.moves.slice(0, ply + 1) }, 1);
    const said = wordsOf(record.moves[ply]?.comment);
    return [
        ...lines,
        `After their move: at risk ${riskLine(after) ?? "none"}; the opponent's checks: ${after.checks.join(" ") || "none"}.`,
        said === undefined ? `The opponent answered ${answer} and said nothing.` : `The opponent answered ${answer} and said: «${said}»`,
    ];
}

/**
 * The position the player is to move in, for who is ahead and the hint, with its positional facts too (D-90), and what the coach said on their turn
 * before.
 */
function nowLines(current: CurrentGame, folder: string, player: Side): string[]
{
    const { game } = current;
    const plies = game.record.moves.length;
    const { hint, leads = [] } = coachWords(folder, current);
    const lead = leads.find(({ position }) => position === plies - 2)?.lead;

    return [
        "Now, for who is ahead and your hint:",
        `FEN: ${game.position.fen}`,
        ...compactView(game.facts, player),
        ...profileLines(game.profile),
        ...(lead === undefined ? [] : [`Who you saw ahead on their turn before: ${leadText(lead)}, ${aheadWords(lead)}`]),
        ...(hint === undefined || hint.position !== plies - 2 ? [] : [`Your hint on their turn before: «${hint.text}»`]),
    ];
}

/** How the player says they play, and their rating, when their profile says so. */
function playerLines(context: Context): string[]
{
    const { level, rating } = activeProfile(context.home());
    const parts = [level === undefined ? undefined : `plays at the ${level} level`, rating === undefined ? undefined : `is rated ${rating.value} on ${rating.site}`];
    const said = parts.filter((part) => part !== undefined);
    return said.length === 0 ? [] : [`The player ${said.join(" and ")}.`];
}

/** Keeps the judgment of the player's move the opponent answered at `position`, or that ended the game, and the hint for their turn while it is still theirs. */
function keep(folder: string, current: CurrentGame, place: Place, { ahead, badge, note, hint, arrows, squares }: Words): Coached
{
    const { position } = place;
    const judging = badge !== undefined || note !== undefined;
    const over = endOf(current.game) !== undefined;
    const toMove = theirTurn(current, place);

    if (hint === undefined && (arrows !== undefined || squares !== undefined)) {
        throw new Error("Arrows and squares show your hint: give them with it. Nothing changed.");
    }

    if (!judging && hint === undefined && ahead === undefined) {
        throw new Error(`Give who is ahead (ahead), your judgment (badge, note), your hint (hint, arrows, squares); or ${call(place, "done: true")}. Nothing changed.`);
    }

    // On the position the game ended in there is no turn to help and the result says who won; a position before it keeps who was ahead there, when the game
    // ended while the coach thought (Federico, review of T-148).
    const ended = over && position === current.game.record.moves.length;

    if (ended && (hint !== undefined || ahead !== undefined)) {
        throw new Error("The game is over: no hint and no ahead. Keep your judgment, when their move stands out, or end with one word. Nothing changed.");
    }

    if (ahead !== undefined && sideToMoveAt(current, position) === current.ai) {
        throw new Error("Who is ahead is for a position the player is to move in, as coach {} gives it: here the opponent is to move. Nothing changed.");
    }

    const lead = ahead === undefined ? undefined : leadFrom(ahead);

    // The player's move to judge: the one the opponent answered, or their own that ended the game (D-88).
    const ply = judgedPly(current, position);

    if (judging && (ply === undefined || (ply === position && !ended))) {
        throw new Error("There is no move of the player's to judge here: give only your hint. Nothing changed.");
    }

    const legal = toMove ? current.game.legalMoves() : [];

    if (hint !== undefined && toMove) {
        refuseMoves(hint, arrows ?? [], legal);
    }

    if (judging && ply !== undefined) {
        // A note that names a move the player could play in the position it was given for waits until none of them is legal on their turn: until then it
        // would play for them (Anatolij, review of T-112).
        const then = toMove ? legal : new Game({ tags: current.game.record.tags, moves: current.game.record.moves.slice(0, position) }).legalMoves();
        const held = note === undefined ? [] : [...new Set(namedMoves(note, then))];
        keepJudgment(folder, current, { ply, ...(badge === undefined ? {} : { badge }), ...(note === undefined ? {} : { note }), ...(held.length === 0 ? {} : { held }) });
    }

    if (hint !== undefined && toMove) {
        keepHint(folder, current, { position, text: hint, ...drawingsOf(arrows, squares) });
    }

    // Who is ahead in the position the player was to move in, kept even once they have moved: the bar and the chart show it on that position.
    if (lead !== undefined) {
        keepLead(folder, current, { position, lead });
    }

    const saved = [
        judging ? "your judgment" : undefined,
        lead === undefined ? undefined : `who is ahead, ${aheadWords(lead)}`,
        hint !== undefined && toMove ? "your hint" : undefined,
    ].filter((part) => part !== undefined);
    const hintLeft = hint !== undefined && !toMove;

    if (over) {
        // The game went to the archive with the move that ended it: the judgment goes there too.
        archiveCoached(folder, current);
        return { kept: place, then: "over", saved, hintLeft };
    }

    return { kept: place, then: toMove ? "wait" : "moved", saved, hintLeft };
}

/** Whether the player is still to move in the position the coach works on, in the same game going on. */
function theirTurn(current: CurrentGame | undefined, { game, position }: Place): boolean
{
    return current !== undefined && gameKey(current) === game && endOf(current.game) === undefined && current.game.record.moves.length === position
        && current.game.position.turn !== current.ai;
}

/** The side to move after `position` plies of the game. */
function sideToMoveAt({ game }: CurrentGame, position: number): Side
{
    const { turn } = game.position;
    return (game.record.moves.length - position) % 2 === 0 ? turn : turn === "white" ? "black" : "white";
}

/** Refuses a hint that plays for the player: a move they may play now written in it, or drawn as an arrow (Anatolij, review of T-112). */
function refuseMoves(hint: string, arrows: readonly string[], legal: readonly Move[]): void
{
    const drawn = arrows.map((arrow) => legal.find((move) => move.from === arrow.slice(1, 3) && move.to === arrow.slice(3, 5))?.san).filter((san) => san !== undefined);
    const named = [...namedMoves(hint, legal), ...drawn];

    if (named.length > 0) {
        throw new Error(
            `Your hint gives the player a move they may play now (${[...new Set(named)].join(", ")}): point at what is on the board, a piece, a square, a file, a threat, a goal, `
                + "never what to play, and mark squares rather than draw their move. Nothing changed.",
        );
    }
}

/** The moves a text names that the player may play now: a piece's move, a capture, a promotion or a castling, in letters or figurines; a square alone is no move. */
function namedMoves(text: string, legal: readonly Move[]): string[]
{
    const sanOf = new Map(legal.map((move) => [moveKey(move.san), move.san]));
    const written = withSanLetters(text).match(moveWords) ?? [];
    return written.map((word) => sanOf.get(moveKey(word))).filter((san) => san !== undefined);
}

// A move as SAN writes it, but a pawn's move to a square, which reads as the square: Nf3, Nbxd2, exd5, e8=Q, O-O; never the opponent's, after "...".
const moveWords = /(?<![\p{L}\d]|\.\.\.|…)(?:O-O(?:-O)?|0-0(?:-0)?|[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x[a-h][1-8](?:=[QRBN])?|[a-h][18]=[QRBN])(?![\p{L}\d])/gu;

/**
 * A move as the coach may write it and Chesspal lists it, alike: its piece and capture, the square it goes to and its promotion; a castling as it is. A
 * piece on a square without the capture names that piece, never a move taking it (Priya and Anatolij, review of T-112).
 */
function moveKey(san: string): string
{
    const bare = san.replace(/[+#!?]+$/, "").replaceAll("0", "O");

    if (bare.startsWith("O-O")) {
        return bare;
    }

    const [, piece = "", capture = "", to = "", promotion = ""] = /^([KQRBN])?[a-h]?[1-8]?(x?)([a-h][1-8])(=[QRBN])?$/.exec(bare) ?? [];
    return `${piece}${capture}${to}${promotion}`;
}
