// The analyst's tool (D-21, D-68): a game over, move by move in one call, facts only and never a judgment, with the analyst's instructions once in a chat.
import { z } from "zod";
import {
    accountSide,
    type AiLevel,
    clockOfComment,
    clockText,
    closingOf,
    type Facts,
    Game,
    type GameRecord,
    gameReviewOf,
    isReviewed,
    leadOf,
    leadText,
    levelOf,
    materialOf,
    type MoveReview,
    type Outcome,
    type PieceLetter,
    readPgn,
    reviewed,
    reviewOf,
    type Side,
    timeControlOfTag,
    timeControlText,
    withGameReview,
    withLead,
} from "../../core/index.ts";
import { gameInAnalysis, isGameName, keepToStudy, lastChatStart, planOf, rewriteGame, startAnalysis } from "../../games/index.ts";
import { analystAgent, instructionsFile } from "../../host-files/index.ts";
import { activeProfile, gameFolder, type PlayerProfile } from "../../profiles/index.ts";
import { pointsAtSite, siteGameName, siteOfGameName } from "../../sites/index.ts";
import { analystOf, anotherAnalyst, balanceText, bookOpening, bookReaches, colourName, gameToStudy, knownTag, moveNumbers, namedGame, noGameGoingOn, riskLine, speechLine, speechOf, type Studied, tacticsText } from "../answers/index.ts";
import { playerLine, siteText } from "../profiles/index.ts";
import { type Context, defineCommand } from "../registry/index.ts";
import { profileSiteGames } from "./site-games.ts";

/** A move as the analysis gives it: what happened, never how good it was (D-6). */
interface MoveFacts
{
    /** The move, numbered: 12...Nxe5. */
    move: string;
    /** The piece it took. */
    took?: PieceLetter;
    /** The time it took and the time left after it, in milliseconds, where the record has the clock. */
    spent?: number;
    left?: number;
    /** Who is ahead in material after it, when it changed: White +1 in pawns. */
    material?: string;
    /** After it, the pieces at risk of either side when they changed from the line before ("none" once no piece is), and the mates the side to move has; none once the board ends the game. */
    atRisk?: string;
    /** After it, the only legal move of the side to move, when it has one alone: a rule, as a mate is, never a judgment (D-103). */
    oneLegal?: string;
    mates?: readonly string[];
    /** After it, what the moves of the side to move would do (D-100): forks, double attacks, discovered and double checks, promotions, stalemates and traps. */
    tactics?: string;
    /** The first move the opening book does not know. */
    outOfBook?: true;
    drawOffer?: true;
    /** In a game played here, what the AI said with its move, and the plan it wrote. */
    said?: string;
    plan?: string;
    /** The badge and note the AI gave it with annotate_game (D-69). */
    review?: MoveReview;
    /** Who is ahead after it, as the AI estimated it (D-90). */
    lead?: string;
}

/** A game as the analysis gives it. */
interface Analysis
{
    /** How to analyse, the first time in a chat (D-68). */
    instructions?: string;
    /** The player's language, for the analyst's agent, which talks with no one (D-89). */
    speech?: string;
    /** Who the player is, how they play and their rating, for the analyst's agent, which never reads status (D-66). */
    profile?: string;
    white: string;
    black: string;
    /** In a game played here: the side the AI played, and its level. */
    ai?: Side;
    level?: AiLevel;
    /** In a game played elsewhere: the side whose name is the player's profile's. */
    player?: Side;
    date?: string;
    timeControl?: string;
    result?: string;
    termination?: string;
    opening?: string;
    /** Whether the game stayed in the opening book to its last move. */
    inBook?: true;
    /** The last move the opening book knows, the end of the moves with the book's badge. */
    bookTo?: string;
    /** The game's name in the archive, a game brought as a PGN too. */
    name?: string;
    /** In a game from a position: that position, and what is at risk and the mates in one there. */
    start?: Omit<MoveFacts, "move"> & { fen: string; };
    moves: MoveFacts[];
    /** The AI's word on the whole game, from annotate_game. */
    review?: string;
}

/** A game replayed: the facts of its starting position, of each move, and how the board ends it. */
interface Replay
{
    start: Pick<MoveFacts, "atRisk" | "oneLegal" | "mates" | "tactics">;
    moves: MoveFacts[];
    outcome: Outcome;
}

/**
 * A game over move by move, for the analyst (D-68): the current one, one of the archive or kept to study, one the player brings as a PGN, or one of their latest
 * on the sites (D-110), kept to study.
 */
export const analyseGame = defineCommand({
    name: "analyse_game",
    description: "Gives a game that is over move by move, to comment it with the player: each move with what it took and the time it took, the material "
        + "when it changes, the pieces at risk, the only legal move when there is one alone, the mates in one and what the next moves would do after it (forks, double attacks, discovered checks, "
        + "promotions, stalemates and stalemate traps), where the game left the opening book, and your comments and plans. Facts "
        + "only: the judgment is yours. Without game or pgn, the game just over, or else the last one played; game: a name as past_games, study_games or "
        + "site_games writes it; pgn: a game the player brings from elsewhere, kept to study in the profile. Never while a game goes on. The first time in a chat "
        + "it also says how to analyse. annotate_game then keeps your badges and notes for the board page. Example: analyse_game {}.",
    input: z.object({
        game: z.string().optional().describe("a game's name, as past_games, study_games, site_games or analyse_game writes it"),
        pgn: z.string().optional().describe("a game played elsewhere, in PGN: its tags and its moves, with their [%clk] and a review exported from the board page if it has them; other comments and evals can go"),
    }),
    sharedWith: [analystAgent],
    openWorld: true,
    run: async ({ game, pgn }, context): Promise<Analysis> => {
        if (game !== undefined && pgn !== undefined) {
            throw new Error("Give game or pgn, not both: game names a game of the archive, pgn brings one played elsewhere.");
        }

        const given = game?.trim();

        // A link, or a name of a site's game that site_games does not write, is no game Chesspal can find (D-110).
        if ([given, pgn].some((text) => text !== undefined && pointsAtSite(text))) {
            throw new Error("Chesspal takes no link: site_games lists the player's latest games on Lichess and Chess.com; give the name it writes, as game.");
        }

        // A game's name given as pgn, as an AI often gives it, is that game (Priya).
        const fromSite = siteGameName(given ?? pgn ?? "");
        const named = pgn !== undefined && isGameName(pgn) ? pgn.trim() : given;
        const studied = fromSite !== undefined
            ? importedGame(context, await siteGamePgn(context, fromSite))
            : pgn === undefined || named !== given
            ? gameToStudy(context, named)
            : importedGame(context, pgn);

        if (context.agent === analystAgent) {
            oneAnalyst(context, studied);
        }

        const analysis = analysisOf(studied, activeProfile(context.home()));

        if (studied.name !== undefined) {
            markBook(context, { record: studied.record, name: studied.name }, analysis.moves);
            startAnalysis(gameFolder(context.home()), studied.name, context.now());
        }

        // The analyst's agent has its instructions in its own file, and the player's language in its prompt or, when Chesspal knows it, here (D-89);
        // who the player is, which the chat reads in status, here too, so that it writes for their level.
        if (context.agent === analystAgent) {
            const speech = speechOf(gameFolder(context.home()), context.language);
            const profile = playerLine(context);
            return { ...analysis, ...(speech === undefined ? {} : { speech: speechLine(speech) }), ...(profile === undefined ? {} : { profile }) };
        }

        const told = analystInstructions(context);
        return told === undefined ? analysis : { instructions: told, ...analysis };
    },
    format: (analysis) =>
        [
            ...(analysis.instructions === undefined ? [] : [analysis.instructions, ""]),
            ...(analysis.speech === undefined ? [] : [analysis.speech]),
            ...(analysis.profile === undefined ? [] : [analysis.profile]),
            ...analysisHead(analysis),
            ...analysis.moves.map(moveLine),
        ].join("\n"),
});

/**
 * One analyst a game: one started on a game reviewed already, or that another analyst has taken, stops, and the chat goes over that review (Stefano); the
 * analyst that took it may call again, its review half written. The game is taken at once, before the long reading of it, and read again: of two analysts
 * started together in two processes, as Codex runs them, one goes on (Federico).
 */
function oneAnalyst(context: Context, studied: Studied): void
{
    const { name } = studied;
    const holder = name === undefined ? undefined : analystOf(context, name);

    if (holder !== undefined && holder === context.agentRun) {
        return;
    }

    if (isReviewed(studied.record)) {
        throw new Error("Stop now: this game has its review already. End with one line for the AI that started you: go over that review with the player.");
    }

    if (holder !== undefined) {
        throw new Error(anotherAnalyst);
    }

    if (name !== undefined && context.agentRun !== undefined) {
        const folder = gameFolder(context.home());
        startAnalysis(folder, name, context.now(), { analyst: { game: name, run: context.agentRun, since: context.now().toISOString() } });

        if (gameInAnalysis(folder)?.analyst?.run !== context.agentRun) {
            throw new Error(anotherAnalyst);
        }
    }
}

/** A game the player brings as a PGN, checked move by move and kept to study with its clock and Chesspal's own review: no other comment, no engine's evaluation (D-6). */
function importedGame(context: Context, pgn: string): Studied
{
    noGameGoingOn(context);

    if (/\.pgn\s*$/i.test(pgn)) {
        throw new Error(
            `"${pgn.trim()}" is a file's name, not a game: pgn takes a game's text, its tags and its moves. A game played here or kept to study goes in game, by `
                + "its name, such as games/2026-11-02-153012.pgn.",
        );
    }

    const records = readPgn(pgn);

    if (records.length !== 1) {
        throw new Error(records.length === 0 ? "The PGN holds no game: give it whole, its tags and its moves." : `The PGN holds ${records.length} games: give one at a time.`);
    }

    const [{ tags, moves }] = records as [GameRecord];

    // A game analysed here and exported comes back with its review: Chesspal's own marks stay, as the clock; any other comment goes.
    const brought = {
        tags,
        moves: moves.map(({ san, comment }) => {
            const clock = /\[%clk [^\]]*\]/.exec(comment ?? "")?.[0];
            const move = clock === undefined ? { san } : { san, comment: clock };
            const review = reviewOf(comment);
            const lead = leadOf(comment);
            const kept = review === undefined ? move : reviewed(move, review);
            return lead === undefined ? kept : withLead(kept, lead);
        }),
    };
    const summary = gameReviewOf(records[0]!);
    const closing = closingOf(records[0]!);
    const record = summary === undefined && closing === undefined
        ? brought
        : withGameReview(brought, { ...(summary === undefined ? {} : { summary }), ...(closing === undefined ? {} : { closing }) });

    // A game brought again is the one already kept, with the review written on it since.
    return namedGame(context, keepToStudy(gameFolder(context.home()), record, context.now()));
}

/** The PGN of one of the player's latest games on the sites, asked of them again by its name as site_games writes it (D-110). */
async function siteGamePgn(context: Context, name: string): Promise<string>
{
    noGameGoingOn(context);
    const site = siteOfGameName(name);
    const profile = activeProfile(context.home()).id;
    const { games, unreached } = await profileSiteGames(context, site);

    if (activeProfile(context.home()).id !== profile) {
        throw new Error("The profile in use changed while the site answered: call site_games again for the player's games now. Nothing changed.");
    }

    const found = games.find((one) => one.name === name);

    if (found !== undefined) {
        return found.pgn;
    }

    throw new Error(
        unreached.includes(site)
            ? `${siteText[site]} could not be reached: tell the player, and ask again when they ask. Nothing changed.`
            : `${name} is not among the player's latest games on ${siteText[site]} any more: call site_games again and give a name it writes. Nothing changed.`,
    );
}

/**
 * The opening book's moves marked as such in the game kept (D-69): a fact, not a judgment, so Chesspal puts the badge itself on each move from the start to the
 * last one the book knows, where the AI gave none; a game from another position has none.
 */
function markBook(context: Context, { record, name }: Required<Studied>, moves: readonly MoveFacts[]): void
{
    const inBook = bookPliesOfFacts(record, moves);
    const unmarked = record.moves.slice(0, inBook).some((move) => reviewOf(move.comment)?.badge === undefined);

    if (!unmarked) {
        return;
    }

    const marked = record.moves.map((move, ply) => {
        const review = reviewOf(move.comment);
        return ply < inBook && review?.badge === undefined ? reviewed(move, { ...review, badge: "book" }) : move;
    });

    rewriteGame(gameFolder(context.home()), name, { ...record, moves: marked });
}

/** How many plies from the start the opening book knows, as opening-book's bookPlies counts them, read from the facts already found: none from another position. */
function bookPliesOfFacts(record: GameRecord, moves: readonly MoveFacts[]): number
{
    const firstOut = moves.findIndex((move) => move.outOfBook);
    return record.tags.FEN !== undefined ? 0 : firstOut >= 0 ? firstOut : moves.length;
}

function analysisOf({ record, name }: Studied, profile: PlayerProfile): Analysis
{
    const { tags } = record;
    const ai = sideNamed(record, "AI");
    const control = timeControlOfTag(tags.TimeControl ?? "");
    const { start, moves, outcome } = movesOf(record, ai);
    // The board's end before the tags': a record may say what the board does not.
    const ended = outcome.over ? { result: outcome.result, termination: outcome.ending } : tags.Result !== undefined && tags.Result !== "*" ? { result: tags.Result, termination: tags.Termination } : undefined;
    const opening = bookOpening(record);

    return {
        white: tags.White ?? "?",
        black: tags.Black ?? "?",
        ai,
        level: ai === undefined ? undefined : levelOf(record),
        // The player by their name, or by their names on the sites (D-93).
        player: ai === undefined ? sideNamed(record, profile.name) ?? accountSide(record.tags, profile.accounts) : undefined,
        date: knownTag(tags.Date),
        timeControl: control === undefined ? knownTag(tags.TimeControl) : timeControlText(control),
        result: ended?.result,
        termination: ended?.termination,
        opening: opening === undefined ? undefined : `${opening.eco} ${opening.name}`,
        inBook: opening !== undefined && !moves.some((move) => move.outOfBook) ? true : undefined,
        bookTo: opening === undefined ? undefined : moves[bookPliesOfFacts(record, moves) - 1]?.move,
        review: [gameReviewOf(record), closingOf(record)].filter((word) => word !== undefined).join(" ") || undefined,
        name,
        start: tags.FEN === undefined ? undefined : { fen: tags.FEN, ...start },
        moves,
    };
}

/** The facts of every move, from a replay of the game: the facts after each move are those before the next. */
function movesOf(record: GameRecord, ai: Side | undefined): Replay
{
    const numbers = moveNumbers(record);
    const game = new Game({ tags: record.tags, moves: [] });
    const increment = timeControlOfTag(record.tags.TimeControl ?? "")?.increment;
    // The time each side had left after its last move: the first move of each side spends no time it can tell, as the sites start their clocks apart.
    const left: Partial<Record<Side, number>> = {};
    let inBook = record.tags.FEN === undefined && bookReaches(game.position.fen);
    let before = game.facts;
    let balance = materialOf(game.position.fen).balance;
    const start = { atRisk: riskLine(before), oneLegal: oneLegalMove(before), mates: matesOf(before), tactics: tacticsText(before, game.possibilities, true) };
    // What was at risk on the line before: a move tells it only when it changed.
    let risk = start.atRisk;

    const moves = record.moves.map(({ san, comment }, ply) => {
        const side = game.position.turn;
        const played = game.playRecorded(san);

        if (!played.played) {
            throw new Error(`The game's move ${numbers[ply]}${san} cannot be played: ${played.message} Fix the game's PGN.`);
        }

        const outOfBook = inBook && !bookReaches(game.position.fen);
        inBook &&= !outOfBook;
        const facts = game.facts;
        const over = game.outcome.over;
        const now = materialOf(game.position.fen).balance;
        const clock = clockOfComment(comment ?? "");
        const previous = left[side];
        const risks = riskLine(facts);
        const move: MoveFacts = {
            move: `${numbers[ply]}${san}`,
            took: before.pieces.find((piece) => piece.square === played.move.to)?.piece ?? (san.includes("x") ? "P" : undefined),
            spent: clock === undefined || previous === undefined || increment === undefined ? undefined : Math.max(0, previous - clock + increment),
            left: clock,
            material: now === balance ? undefined : balanceText(now),
            atRisk: over || risks === risk ? undefined : (risks ?? "none"),
            oneLegal: over ? undefined : oneLegalMove(facts),
            mates: over ? undefined : matesOf(facts),
            tactics: over ? undefined : tacticsText(facts, game.possibilities, true),
            outOfBook: outOfBook ? true : undefined,
            drawOffer: comment?.includes("(=)") === true ? true : undefined,
            said: side === ai ? saidIn(comment) : undefined,
            review: reviewOf(comment),
            plan: side === ai ? planOf(comment) : undefined,
            lead: estimateOf(comment),
        };

        if (clock !== undefined) {
            left[side] = clock;
        }

        before = facts;
        balance = now;
        risk = risks;
        return move;
    });

    return { start, moves, outcome: game.outcome };
}

/** The head of the analysis: who played, when and how fast, how it ended, the opening, and the game's name for look and position. */
function analysisHead(analysis: Analysis): string[]
{
    const { ai, level, player } = analysis;
    const named = (side: Side) => `${side === "white" ? analysis.white : analysis.black}${side === player ? " (the player)" : ""}`;
    const players = ai === undefined
        ? `White: ${named("white")}; Black: ${named("black")}.`
        : `You played ${colourName(ai)} at the ${level} level, the player ${colourName(ai === "white" ? "black" : "white")}.`;
    const when = [analysis.date, analysis.timeControl === undefined ? undefined : `time control ${analysis.timeControl}`].filter((part) => part !== undefined).join(", ");
    const count = Math.ceil(analysis.moves.length / 2);
    const result = analysis.result === undefined ? "unknown" : `${analysis.result}${analysis.termination === undefined ? "" : ` (${analysis.termination})`}`;
    const book = analysis.bookTo === undefined ? "" : analysis.inBook ? ", in the book to the end" : `, in the book to ${analysis.bookTo}`;
    const badged = analysis.bookTo === undefined || analysis.name === undefined ? "" : ": those moves have the book badge, unless you give another";
    const opening = analysis.opening === undefined ? [] : [`Opening: ${analysis.opening}${book}${badged}`];
    const name = analysis.name === undefined ? 'Look and position take a move alone, such as move "12..."' : `Look and position take it as game "${analysis.name}"`;

    const start = analysis.start === undefined ? [] : [moveLine({ ...analysis.start, move: `Start, ${analysis.start.fen}` })];
    const head = `${players}${when === "" ? "" : ` ${when[0]!.toUpperCase()}${when.slice(1)}.`} Result: ${result}, after ${count} ${count === 1 ? "move" : "moves"}.`;
    const review = analysis.review === undefined ? [] : [`Your review: ${analysis.review}`];
    return [head, ...opening, ...review, `${name}.`, ...start];
}

/** 12...Nxe5: took P; spent 0:12, 4:32 left; material White +1 in pawns; at risk: undefended Black Nf6; mate in one: Qh7#; tactics: fork Nc7+ (Ke8 Ra8); out of book; you said "…"; your plan: …; ahead -1.5 */
function moveLine(move: MoveFacts): string
{
    const left = move.left === undefined ? undefined : `${clockText(move.left)} left`;
    const parts = [
        move.took === undefined ? undefined : `took ${move.took}`,
        move.spent === undefined ? left : `spent ${clockText(move.spent)}, ${left}`,
        move.material === undefined ? undefined : `material ${move.material}`,
        move.atRisk === undefined ? undefined : `at risk: ${move.atRisk}`,
        move.oneLegal === undefined ? undefined : `one legal move: ${move.oneLegal}`,
        move.mates === undefined ? undefined : `mate in one: ${move.mates.join(" ")}`,
        move.tactics === undefined ? undefined : `tactics: ${move.tactics}`,
        move.outOfBook ? "out of book" : undefined,
        move.drawOffer ? "offers a draw" : undefined,
        move.said === undefined ? undefined : `you said "${move.said}"`,
        move.plan === undefined ? undefined : `your plan: ${move.plan}`,
        // The book's badge alone is Chesspal's, not the AI's word: the line says the move left the book where it did.
        move.review === undefined || (move.review.badge === "book" && move.review.note === undefined) ? undefined : reviewLine(move.review),
        move.lead === undefined ? undefined : `ahead ${move.lead}`,
    ].filter((part) => part !== undefined);

    return parts.length === 0 ? move.move : `${move.move}: ${parts.join("; ")}`;
}

/**
 * The analyst's instructions, the first time in a chat where the MCP server keeps what it told: again in a chat cleared or summarized, since its start
 * keys them (D-57); never on the command line, where no analyst reads.
 */
function analystInstructions(context: Context): string | undefined
{
    const key = `analyst ${lastChatStart(context.folder)?.at ?? ""}`;

    if (context.told === undefined || context.told.has(key)) {
        return undefined;
    }

    context.told.add(key);
    return `${instructionsFile("analyst")}\n${instructionsFile("analysis")}`;
}

/** Who is ahead after a move, as the AI estimated it with annotate_game or the coach during the game (D-90). */
function estimateOf(comment: string | undefined): string | undefined
{
    const lead = leadOf(comment);
    return lead === undefined ? undefined : leadText(lead);
}

/** The only legal move of the side to move, when it has one alone (D-103). */
function oneLegalMove(facts: Facts): string | undefined
{
    const moves = facts.pieces.flatMap((piece) => piece.moves ?? []);
    return moves.length === 1 ? moves[0] : undefined;
}

/** The mates in one the side to move has; none when it has none. */
function matesOf(facts: Facts): readonly string[] | undefined
{
    const mates = facts.checks.filter((check) => check.endsWith("#"));
    return mates.length === 0 ? undefined : mates;
}

/** The side a name plays, by the White and Black tags, whatever its case; none when neither is that name. */
function sideNamed({ tags }: GameRecord, name: string): Side | undefined
{
    const same = (tag: string | undefined) => tag?.trim().toLowerCase() === name.trim().toLowerCase();
    return same(tags.White) ? "white" : same(tags.Black) ? "black" : undefined;
}

/** The words of a move's comment, without the commands PGN hides in it ([%clk], [%plan]) and the draw offer. */
function saidIn(comment: string | undefined): string | undefined
{
    const words = (comment ?? "").replace(/\[%[^\]]*\]/g, "").replace("(=)", "").replace(/\s+/g, " ").trim();
    return words === "" ? undefined : words;
}

/** What the AI kept on a move with annotate_game: you marked blunder: "note", or you noted "note". */
function reviewLine({ badge, note }: MoveReview): string
{
    const quoted = note === undefined ? "" : `"${note}"`;
    return badge === undefined ? `you noted ${quoted}` : `you marked ${badge}${quoted === "" ? "" : `: ${quoted}`}`;
}
