import { z } from "zod";
import { type AiLevel, aiLevels, Game, type GameRecord, levelTag, type Notation, pgnDate, readPgn, type Side, startClock, type TimeControl, timeControlOf, timeControlTag, withoutMoods } from "../core/index.ts";
import { archivedName, archiveGame, cleanSince, type CurrentGame, endAnalysis, endOf, endTableTalk, lastChatStart, loadGame, saveGame, startOfNewGame, withoutPlans } from "../games/index.ts";
import { gameFolder, gameFolders, notationIn } from "../profiles/index.ts";
import { gameAt } from "./clock.ts";
import type { Context } from "./context.ts";
import { type GameSummary, nextStep, notationLine, positionLines, sidesLine, summaryOf, withThought } from "./game-summary.ts";
import { levelText, levelToPlay } from "./levels.ts";
import { closedPage, pageLine } from "./page-link.ts";
import { pastGameLines } from "./past-games.ts";
import { refuseUnseenPosition } from "./play-move.ts";
import { playerLine } from "./profiles.ts";
import { defineCommand } from "./registry.ts";

interface NewGame
{
    game: GameSummary;
    /** Where the game before went: one going on, unfinished; one over, when its archive could not be written at its end. */
    archived?: { name: string; finished: boolean; };
    /** The last games played with this player, for a chat that starts clean (D-57). */
    past: string[];
    /** Who plays, from the profile in use (D-23), once the player has completed it (D-71). */
    player?: string;
    /** The player's notation, when its letters are not SAN's (D-83). */
    notation?: Exclude<Notation, "en">;
    /** The board page's address when no browser has it open: the player needs it first. */
    closedPage?: string;
}

/** The player chooses the game in the board page's window instead: open in a browser, or to be opened first at its address. */
interface Asked
{
    window: "opened" | "closed";
    page?: string;
}

/** A new game against the player, from the standard position or from a FEN or PGN; a game going on is never lost (D-41). */
export const newGame = defineCommand({
    name: "new_game",
    description: "Starts a new game against the player. Without choices it opens the board page's New game window, where the player chooses the colour, the clock "
        + "and the level: call it so whenever they play on the page. With choices, asked in the chat only of a player without the page, it starts the game, from "
        + 'the standard position or from a FEN or PGN they give. Example: new_game {}; new_game {ai_colour: "black", clock: "10+5", level: "club"}.',
    input: z.object({
        ai_colour: z.enum(["white", "black", "random"]).optional().describe("the colour you play: random draws it; left out with the rest, the page's window asks"),
        from: z.string().optional().describe("a FEN or a PGN to go on from, instead of the standard position"),
        clock: z.string().optional().describe("the time control, minutes each and seconds added after each move, such as 10+5 or 3+0; none, or left out, for a game without a clock"),
        level: z.enum(aiLevels).optional().describe(
            "the facts you, not the player, get: beginner the board and the legal moves, club also the tactical facts, strong also the positional ones, master "
                + "also the opening book's moves; left out, the last game's, or for the first game the one that suits the player's profile",
        ),
        replace: z.boolean().default(false).describe("start even though a game is going on: it goes to the archive unfinished"),
    }),
    alwaysLoad: true,
    showsGame: true,
    positionals: ["ai_colour"],
    run: ({ ai_colour: colour, from, clock, level: chosen, replace }, context): NewGame | Asked => {
        if (colour === undefined && from === undefined && clock === undefined && chosen === undefined) {
            return askedOnPage(context);
        }

        if (colour === undefined) {
            throw new Error("ai_colour: say the colour you play, white, black or random, with the other choices; or leave them all out for the page's window. Nothing changed.");
        }

        const control = clock === undefined || /^\s*none\s*$/i.test(clock) ? undefined : timeControlFrom(clock);
        const now = context.now();
        const folder = gameFolder(context.home());
        const before = gameAt(folder, now);
        const going = before !== undefined && endOf(before.game) === undefined ? before : undefined;

        if (going !== undefined && !replace) {
            const { moveNumber } = going.game.position;
            throw new Error(`A game is going on, at move ${moveNumber}: end it with end_game, or call new_game with replace: true, which archives it unfinished. Nothing changed.`);
        }

        if (going !== undefined) {
            refuseUnseenPosition(context, folder);
        }

        if (chatToClear(context)) {
            throw new ChatNotClear();
        }

        const ai = colour === "random" ? (context.random() < 0.5 ? "white" : "black") : colour;
        const level = chosen ?? levelToPlay(context, before);
        const started = startOfNewGame(folder, now, before);
        const game = startingGame(from, { ai, level }, started, control);
        const current: CurrentGame = control === undefined
            ? { game, ai, started: started.toISOString(), talk: [] }
            : { game, ai, started: started.toISOString(), talk: [], clock: startClock(control, now, context.pageOpen?.() === true) };
        const archived = before === undefined || (going === undefined && archivedName(folder, before) !== undefined) ? undefined : archiveBefore(folder, before);
        saveGame(folder, current);
        endAnalysis(folder);
        endTableTalk(folder);
        const past = pastGameLines(folder, remembered);
        const closed = closedPage(context);
        const player = playerLine(context);
        const notation = notationIn(folder, context.language);
        return {
            game: withThought(summaryOf(current, now), folder, current),
            ...(archived === undefined ? {} : { archived: { name: archived, finished: going === undefined } }),
            past,
            ...(player === undefined ? {} : { player }),
            ...(notation === "en" ? {} : { notation }),
            ...(closed === undefined ? {} : { closedPage: closed }),
        };
    },
    format: (result) => "window" in result ? askedLine(result) : startedLines(result),
});

/** The new game's lines for the AI. */
function startedLines({ game, archived, past, player, notation, closedPage: closed }: NewGame): string
{
    return [
        `New game: ${sidesLine(game.ai)}, ${levelText(game.level)}.`,
        ...(player === undefined ? [] : [player]),
        ...(notation === undefined ? [] : [notationLine(notation)]),
        ...(archived === undefined ? [] : [`The game before is in ${archived.name}${archived.finished ? "" : ", unfinished"}.`]),
        ...(past.length === 0 ? [] : ["Last games with this player (past_games gives more, and their moves):", ...past]),
        ...positionLines(game),
        ...(closed === undefined ? [] : [pageLine(closed, true)]),
        nextStep(game),
    ].join("\n");
}

/**
 * The New game window opened on the board page, or its address for the player to open it first; a chat to clear refuses it as a new game does (D-57), and
 * without the page the player is asked in the chat.
 */
function askedOnPage(context: Context): Asked
{
    if (chatToClear(context)) {
        throw new ChatNotClear();
    }

    if (context.askNewGame?.() === true) {
        return { window: "opened" };
    }

    if (context.page !== undefined) {
        return { window: "closed", page: context.page };
    }

    throw new Error(
        "There is no board page here: ask the player which colour they want, whether they want a clock and at which level you play, then call new_game with "
            + "them. Nothing changed.",
    );
}

function askedLine({ window, page }: Asked): string
{
    return window === "opened"
        ? "The New game window is open on the board page: the player chooses the game there. Don't ask in the chat; end your turn, the doorbell wakes you when "
            + "the game starts."
        : `Nobody has the board page open: give the player its address, ${page}, and tell them to start the game there with its New game button. End your turn.`;
}

/** The refusal of a new game in a chat that still holds the game before (D-57): the board page says it in the player's language. */
export class ChatNotClear extends Error
{
    constructor()
    {
        super(
            "The game before was played in this chat: ask the player to write /clear here, which empties the chat and keeps the games on disk, then "
                + "start the new game. A clean chat plays faster and costs less. Nothing changed.",
        );
    }
}

/** How many of the last games new_game recalls. */
const remembered = 3;

/** From how many plies a game played in a chat asks for a clean one before the next (D-57): one left after a few moves does not. */
export const pliesBeforeClearing = 20;

// A FEN's board: eight ranks of pieces and empty counts.
const fenPattern = /^[pnbrqkPNBRQK1-8]+(?:\/[pnbrqkPNBRQK1-8]+){7}(?:\s|$)/;

/**
 * Whether the chat must be cleared first: the last game begun, in any profile, was played in it at some length, and the host says how chats start (the hook
 * of Claude Code and Codex, T-85, T-104). Another profile does not clear the chat (D-66), nor a game another chat played, which this one was never shown (D-71).
 */
function chatToClear(context: Context): boolean
{
    const start = lastChatStart(context.folder);

    if (!hostsNotingChats.has(context.host?.() ?? "") || start === undefined) {
        return false;
    }

    const last = gameFolders(context.home()).flatMap((folder) => loadGame(folder) ?? []).sort((one, other) => Date.parse(other.started) - Date.parse(one.started))[0];
    return last !== undefined && last.started === context.positionSeen?.started && last.game.record.moves.length >= pliesBeforeClearing && !cleanSince(start, last.started);
}

// The hosts whose SessionStart hook, written by init, notes how each chat starts: Claude Code and Codex, by the names they give the server.
const hostsNotingChats = new Set(["claude-code", "codex-mcp-client"]);

function archiveBefore(folder: string, before: CurrentGame): string
{
    try {
        return archiveGame(folder, before);
    } catch (error) {
        throw new Error(`${(error as Error).message} Nothing changed.`, { cause: error });
    }
}

/**
 * The new game: the standard position, or the one a FEN or PGN gives, which must still be going on. Its tags are Chesspal's, the AI's level among them:
 * an imported game gives its position only.
 */
function startingGame(from: string | undefined, { ai, level }: { ai: Side; level: AiLevel; }, started: Date, control: TimeControl | undefined): Game
{
    const tags = {
        Event: "Chesspal",
        Date: pgnDate(started),
        White: ai === "white" ? "AI" : "Player",
        Black: ai === "black" ? "AI" : "Player",
        [levelTag]: level,
        ...(control === undefined ? {} : { TimeControl: timeControlTag(control) }),
    };
    let game: Game;

    try {
        const record = from === undefined ? { tags: {}, moves: [] } : importedRecord(from.trim());
        const fen: Record<string, string> = record.tags.FEN === undefined ? {} : { SetUp: "1", FEN: record.tags.FEN };
        game = new Game({ tags: { ...tags, ...fen }, moves: record.moves });
    } catch (error) {
        throw new Error(`from: ${(error as Error).message} Nothing changed.`);
    }

    const end = endOf(game);

    if (end !== undefined) {
        throw new Error(`from holds a game already over (${end.result}): give one still going on, or leave from out for a new game. Nothing changed.`);
    }

    return game;
}

function timeControlFrom(clock: string): TimeControl
{
    try {
        return timeControlOf(clock);
    } catch (error) {
        throw new Error(`clock: ${(error as Error).message} Nothing changed.`);
    }
}

function importedRecord(from: string): GameRecord
{
    if (fenPattern.test(from)) {
        return { tags: { SetUp: "1", FEN: from }, moves: [] };
    }

    const records = readPgn(from);
    const [record] = records;

    if (record === undefined || records.length > 1) {
        throw new Error(`it holds ${records.length} games: give one, in PGN, or a FEN.`);
    }

    // Another game's [%plan] and [%mood] comments are not the AI's.
    return withoutMoods(withoutPlans(record));
}
