// The game on the page: the game it shows, and the player's moves and words, new games, clocks, draws and resignations (D-65) and games brought to
// analyse, each done as the chat's tools do it, with the doorbell rung for the chat.
import type { IncomingMessage, ServerResponse } from "node:http";
import {
    analyseGame,
    analystOf,
    answerDraw,
    bookPlies,
    ChatNotClear,
    type Context,
    DrawRefused,
    endGame,
    gameAt,
    gameToStudy,
    namedGame,
    newGame,
    offerDraw,
    playMove,
    samePosition,
    say,
    type SeenPosition,
    shownPosition,
    startNewGame,
} from "../../commands/index.ts";
import { clockStarted, type GameRecord, isReviewed, writePgn } from "../../core/index.ts";
import {
    aiModelOf,
    archiveName,
    coachShown,
    type CoachWords,
    coachWords,
    type CurrentGame,
    drawOfferOf,
    endOf,
    gameInAnalysis,
    GameMissing,
    heardLines,
    loadGame,
    loadTableTalk,
    playerPgn,
    ponderingUntil,
    rerunIfChanged,
    saveGame,
    startAnalysis,
    talkLimits,
    thoughtKey,
    wakesTheChat,
    WordsRefused,
} from "../../games/index.ts";
import { gameFolder, helpsIn } from "../../profiles/index.ts";
import { version } from "../../version.ts";
import { asTheChatSees } from "./chat.ts";
import { tellWatchers } from "./events.ts";
import { bodyOf, bytesOf, isJson, json, jsonOf, type Refused, runRoute, send, textOf } from "./http.ts";
import type { Served } from "./page.ts";
import { profilesShown } from "./profiles.ts";
import { chatToRelaunch, chatToWaitFor, relaunchChat, tableShown } from "./table.ts";
import { updateShown } from "./update.ts";

/** Answers the page's requests about the game: true when the request was one. */
export function answerGame(request: IncomingMessage, response: ServerResponse, url: URL, served: Served): boolean
{
    const route = routes[`${request.method ?? ""} ${url.pathname}`];

    if (route === undefined) {
        return false;
    }

    runRoute(response, () => route(request, response, served));
    return true;
}

/** The chat calls a tool: when nobody heard the player before, the AI's clock, held since, starts now, with the time it was held given back. */
export function chatCalls(served: Served): void
{
    const folder = gameFolder(served.context.home());
    const current = loadGame(folder);
    const held = current !== undefined && aiHeld(served, current);

    if (served.bell.chatCalls() && held) {
        rerunIfChanged(() => giveHeldTime(served, folder));
    }
}

/**
 * Whether the AI's sign on the page is not the one the pages were last given: the ponder agent's every thought rewrites thoughts.json, and only the sign
 * that comes or goes is news for them. True when the game cannot be read: they read it again.
 */
export function thinkingChanged(served: Served): boolean
{
    try {
        return thinkingShown(served, loadGame(gameFolder(served.context.home()))).thinking !== thinkingSent.get(served);
    } catch {
        return true;
    }
}

/** The AI's clock, held while nobody heard the player, starts now: the time it was held is not the AI's. */
function giveHeldTime(served: Served, folder: string): void
{
    const current = loadGame(folder);

    if (current?.clock !== undefined && endOf(current.game) === undefined) {
        saveGame(folder, { ...current, clock: { ...current.clock, since: served.context.now().toISOString() } });
    }
}

type Route = (request: IncomingMessage, response: ServerResponse, served: Served) => void | Promise<void>;

const routes: Readonly<Record<string, Route>> = {
    "GET /api/game": (request, response, served) => sendGame(response, served),
    "POST /api/move": moveFromPage,
    "POST /api/message": messageFromPage,
    "POST /api/new": newGameFromPage,
    "POST /api/draw": drawFromPage,
    "POST /api/resign": resignFromPage,
    "POST /api/start": startFromPage,
    "POST /api/study": studyFromPage,
};

/**
 * The player's move from the page, with their words when they wrote some: played as player_move plays it (D-47) and saved with the words, refused in the
 * player's words, and the doorbell rung for the chat.
 */
async function moveFromPage(request: IncomingMessage, response: ServerResponse, served: Served): Promise<void>
{
    // A form of another site can post text, never JSON without asking first: the type keeps it out, with the origin.
    if (!isJson(request)) {
        send(response, 415, json, JSON.stringify({ error: 'Send the move as JSON: {"move": "e2e4"}.' }));
        return;
    }

    const body = jsonOf(await bodyOf(request));
    const move = textOf(body?.move);

    if (move === undefined || (body?.message !== undefined && typeof body.message !== "string")) {
        send(response, 400, json, JSON.stringify({ error: 'Send the move as JSON, in SAN or as squares, with your words if you like: {"move": "e2e4", "message": "…"}.' }));
        return;
    }

    const refused = refusalOf(served);

    if (refused !== undefined) {
        send(response, 409, json, JSON.stringify(refused));
        return;
    }

    const message = textOf(body?.message);
    let illegal = false;

    try {
        const now = served.context.now();

        const refuse = (problem: string): string => {
            illegal = true;
            return problem;
        };

        rerunIfChanged(() => playMove(gameFolder(served.context.home()), now, "player", move, refuse, message === undefined ? {} : { said: { text: message, at: now } }));
    } catch (error) {
        // The game may have changed since the page read it: the move refused, the AI's turn, a flag fallen.
        send(response, 409, json, JSON.stringify(refusalFrom(error, illegal ? "illegal" : refusalOf(served)?.refusal)));
        return;
    }

    // The pages hear of the move from the watcher, as of every other.
    served.bell.ring();
    send(response, 200, json, JSON.stringify({ played: true }));
}

/**
 * The player's words from the page, without a move: saved with the game as player_say saves them, refused in the player's words, the doorbell rung for the
 * first; in analysis with the position the page shows, and the doorbell rung for each (D-101).
 */
async function messageFromPage(request: IncomingMessage, response: ServerResponse, served: Served): Promise<void>
{
    if (!isJson(request)) {
        send(response, 415, json, JSON.stringify({ error: 'Send the message as JSON: {"text": "…"}.' }));
        return;
    }

    const body = jsonOf(await bodyOf(request));
    const text = textOf(body?.text);
    const shown = typeof body?.game === "string" && typeof body.at === "number" ? shownPosition(served.context, body.game, body.at) : undefined;

    if (text === undefined) {
        send(response, 400, json, JSON.stringify({ error: `Send the message as JSON, ${talkLimits.player} characters at most: {"text": "…"}.` }));
        return;
    }

    let current;

    try {
        current = rerunIfChanged(() => say(gameFolder(served.context.home()), "player", text, served.context.now(), undefined, shown));
    } catch (error) {
        const noGame = refusalOf(served)?.refusal === "no-game";
        send(response, 409, json, JSON.stringify(refusalFrom(error, noGame ? "no-game" : undefined)));
        return;
    }

    // The first words of a move wake the chat, and between games the first since the AI spoke; the AI finds the rest at its next call (D-54, D-74). In
    // analysis every line does: a chat that answered in its own window would not hear the next (Priya).
    if (shown !== undefined || wakesTheChat(current)) {
        served.bell.ring();
    }

    send(response, 200, json, JSON.stringify({ said: true }));
}

/**
 * A new game from the page, with the sides, the level and the clock the player chose: the sides and the level they leave out are as in the game
 * before, and no clock means a game without one. One going on goes to the archive unfinished, and the doorbell tells the chat, unless the table starts
 * it again. A chat the table holds that must be clear for it, and is at work, has the game wait with the choices kept until it has ended its answer (D-107).
 */
async function newGameFromPage(request: IncomingMessage, response: ServerResponse, served: Served): Promise<void>
{
    const asked = 'Send the new game as JSON: {"ai_colour": "black", "level": "club", "clock": "10+5"}, each one optional; no clock for a game without one.';
    const body = isJson(request) ? jsonOf(await bodyOf(request)) : undefined;
    let relaunching = false;
    let chosen: NewGameChoices | undefined;

    if (body === undefined) {
        send(response, isJson(request) ? 400 : 415, json, JSON.stringify({ error: asked }));
        return;
    }

    try {
        const before = loadGame(gameFolder(served.context.home()));
        const input = newGame.input.safeParse({ ai_colour: body.ai_colour ?? before?.ai ?? "black", level: body.level, clock: body.clock, replace: true });

        if (!input.success) {
            send(response, 400, json, JSON.stringify({ error: asked }));
            return;
        }

        // The game starts from the page, open: its clocks wait for the player's Start there. A chat the table starts again is clean: no /clear is asked.
        relaunching = chatToRelaunch(served);
        const sight = relaunching ? served.context : asTheChatSees(served.context, served.chat);
        chosen = input.data;
        rerunIfChanged(() => startNewGame(input.data, { ...sight, pageOpen: () => true }, "page"));
    } catch (error) {
        if (error instanceof ChatNotClear && chosen !== undefined && chatToWaitFor(served)) {
            waitForChat(served, chosen);
            send(response, 200, json, JSON.stringify({ waiting: true }));
        } else {
            send(response, 409, json, JSON.stringify(refusalFrom(error)));
        }

        return;
    }

    // A seat lost meanwhile leaves the chat as it is: the doorbell tells it.
    if (!(relaunching && relaunchChat(served))) {
        served.bell.ring();
    }

    send(response, 200, json, JSON.stringify({ started: true }));
}

/** The player's choices for a new game. */
type NewGameChoices = Parameters<typeof startNewGame>[0];

/**
 * The new game waits, with the player's choices, for the chat at the table to end its answer; then it starts and the chat starts again, clean, for it, or
 * one gone meanwhile hears the doorbell when another comes. A game that cannot start then leaves everything as it was.
 */
function waitForChat(served: Served, chosen: NewGameChoices): void
{
    const start = (): boolean => {
        try {
            rerunIfChanged(() => startNewGame(chosen, { ...served.context, pageOpen: () => true }, "page"));
        } catch {
            return false;
        }

        const relaunching = relaunchChat(served);

        if (!relaunching) {
            served.bell.ring();
        }

        return relaunching;
    };

    served.chatWait = { for: "new-game", start };
    tellWatchers(served.watchers);
}

/** The player's draw from the page (D-65): an offer on their turn, which rings the doorbell, or their answer to the AI's, which rings it when accepted. */
async function drawFromPage(request: IncomingMessage, response: ServerResponse, served: Served): Promise<void>
{
    const asked = 'Send the draw as JSON: {"action": "offer"}, "accept" or "decline".';

    if (!isJson(request)) {
        send(response, 415, json, JSON.stringify({ error: asked }));
        return;
    }

    const action = jsonOf(await bodyOf(request))?.action;

    if (action !== "offer" && action !== "accept" && action !== "decline") {
        send(response, 400, json, JSON.stringify({ error: asked }));
        return;
    }

    try {
        rerunIfChanged(() => action === "offer" ? offerDraw(served.context) : answerDraw(served.context, action === "accept"));
    } catch (error) {
        send(response, 409, json, JSON.stringify(refusalFrom(error, refusalOf(served)?.refusal)));
        return;
    }

    if (action !== "decline") {
        served.bell.ring();
    }

    send(response, 200, json, JSON.stringify({ done: true }));
}

/** The player starts the clocks from the page, which wait from the game's start; the doorbell wakes the chat when its move is first, waiting for this. */
function startFromPage(request: IncomingMessage, response: ServerResponse, served: Served): void
{
    if (!isJson(request)) {
        send(response, 415, json, JSON.stringify({ error: "Send the request as JSON: {}." }));
        return;
    }

    const current = rerunIfChanged(() => startClocks(served));

    if (current === undefined) {
        send(response, 409, json, JSON.stringify({ error: "No clock waits to start: start a game with a clock first." }));
        return;
    }

    if (current.game.position.turn === current.ai) {
        served.bell.ring();
    }

    send(response, 200, json, JSON.stringify({ started: true }));
}

/** Starts the clocks of the game, which wait from its start: the game started, or none when no clock waits. */
function startClocks(served: Served): CurrentGame | undefined
{
    const folder = gameFolder(served.context.home());
    const current = loadGame(folder);

    if (current?.clock?.waiting !== true || endOf(current.game) !== undefined) {
        return undefined;
    }

    saveGame(folder, { ...current, clock: clockStarted(current.clock, served.context.now()) });
    return current;
}

/** The player resigns from the page (D-65), whoever is to move: the game ends and goes to the archive, and the doorbell tells the chat. */
function resignFromPage(request: IncomingMessage, response: ServerResponse, served: Served): void
{
    if (!isJson(request)) {
        send(response, 415, json, JSON.stringify({ error: "Send the request as JSON: {}." }));
        return;
    }

    try {
        rerunIfChanged(() => endGame.run({ result: "player_resigns" }, served.context));
    } catch (error) {
        send(response, 409, json, JSON.stringify(refusalFrom(error, refusalOf(served)?.refusal === "no-game" ? "no-game" : undefined)));
        return;
    }

    served.bell.ring();
    send(response, 200, json, JSON.stringify({ resigned: true }));
}

/**
 * A game the player brings from elsewhere to analyse: kept to study and put in analysis as analyse_game does with a PGN, the page showing it at once,
 * and the doorbell rung for the chat to go over it. Never while a game goes on.
 */
async function studyFromPage(request: IncomingMessage, response: ServerResponse, served: Served): Promise<void>
{
    const asked = 'Send the game as JSON: {"pgn": "[White \\"…\\"] … 1. e4 e5 …"}, one to open again by its name: {"game": "study/2026-11-04-153012.pgn"}, '
        + 'or the game just over: {"last": true}.';

    if (!isJson(request)) {
        send(response, 415, json, JSON.stringify({ error: asked }));
        return;
    }

    const body = jsonOf((await bytesOf(request, pgnLimit))?.toString("utf8"));
    const pgn = textOf(body?.pgn);
    const game = textOf(body?.game);
    const last = body?.last === true;
    // A game a link of the page opens is there to look at: the chat is not asked to go over it.
    const look = body?.look === true;
    // «Analyse again», the review just deleted: the chat starts the analyst without asking, even after one was stopped (Priya).
    const redo = body?.redo === true;

    if (pgn === undefined && game === undefined && !last) {
        send(response, 400, json, JSON.stringify({ error: asked, refusal: "pgn-unreadable" }));
        return;
    }

    if (refusalOf(served)?.refusal !== "no-game") {
        send(response, 409, json, JSON.stringify({ error: "A game is going on: finish it before you bring another to analyse.", refusal: "game-going" }));
        return;
    }

    let reviewed: boolean;
    let brought: boolean;

    try {
        // Without what the chat was told: the analyst's instructions stay for the AI's own analyse_game.
        const opened = last ? lastPlayed(served.context) : game === undefined ? await kept(served, pgn!) : namedGame(served.context, game);
        reviewed = isReviewed(opened.record);
        brought = !reviewed && !look;
        // A game not yet reviewed is marked as brought, for status to ask the AI to go over it; one reviewed is ready, and the chat sleeps on.
        startAnalysis(gameFolder(served.context.home()), opened.name, served.context.now(), { brought, redo });
    } catch (error) {
        send(response, 400, json, JSON.stringify({ error: (error as Error).message, refusal: refusalOfStudy(error) }));
        return;
    }

    if (brought) {
        served.bell.ring();
    }

    send(response, 200, json, JSON.stringify({ kept: true, reviewed }));
}

/**
 * The game in progress or just ended, as the player may see it: its PGN without the AI's plans while it goes on, the AI's side, when it started, and the
 * talk on the page, each line of the player's with how far it got (D-53), and the draw offer that stands (D-65); the AI's name and model (D-82); and the
 * profiles.
 */
function sendGame(response: ServerResponse, served: Served): void
{
    const folder = gameFolder(served.context.home());
    const current = gameNow(served);
    // With no game the page still shows the talk before the first (D-77).
    const spoken = current ?? loadTableTalk(folder);
    const heard = heardLines(spoken, served.chat.given);
    const talk = spoken.talk.map(({ who, text, ply, shown }, index) => ({
        who,
        text,
        ply,
        ...(heard[index] === undefined ? {} : { heard: heard[index] }),
        // In analysis the page goes back to the move the player wrote about (D-101).
        ...(shown === undefined ? {} : { shown }),
    }));
    const offer = current === undefined ? undefined : drawOfferOf(current);
    const coach = coachOn(folder, current);
    const game = current === undefined ? null : {
        pgn: playerPgn(folder, current),
        ai: current.ai,
        started: current.started,
        // Its name in the archive, for the page's address.
        name: archiveName(current),
        talk,
        // How many of its first moves are the book's: the page marks them while the game goes on, as the AI's review does after.
        book: bookPlies(current.game),
        ...(current.clock === undefined ? {} : { clock: current.clock }),
        ...(offer === undefined ? {} : { drawOffer: offer }),
        ...(coach === undefined ? {} : { coach }),
    };
    const analysis = current === undefined || endOf(current.game) !== undefined ? analysisShown(served) : undefined;
    const aiModel = aiModelOf(folder);
    const thinking = thinkingShown(served, current);
    thinkingSent.set(served, thinking.thinking);
    const body = {
        // The page loaded from another version loads again, its files and all (Federico).
        version,
        game,
        ...(game === null && talk.length > 0 ? { talk } : {}),
        ...(analysis === undefined ? {} : { analysis }),
        opponent: served.opponent(),
        ...(aiModel === undefined ? {} : { aiModel }),
        listening: served.bell.listening,
        ...thinking,
        ...(served.outdated ? { outdated: true } : {}),
        ...updateShown(served),
        ...tableShown(served),
        ...profilesShown(served.context.home()),
    };
    send(response, 200, json, JSON.stringify(body));
}

/**
 * What the AI thinks on now, for the page's sign: its move, while the chat is in a turn the doorbell woke it for or on the position it is to move in; the
 * player's time, while the ponder agent thinks, before it waits for their move (D-72). Never the coach's, which is not the opponent (D-88).
 */
function thinkingShown(served: Served, current: CurrentGame | undefined): { thinking?: "move" | "ponder"; }
{
    if (current === undefined || endOf(current.game) !== undefined) {
        return {};
    }

    const position: SeenPosition = { started: current.started, plies: current.game.record.moves.length };

    if (current.game.position.turn === current.ai) {
        const seen = served.chat.positionSeen;
        const onIt = served.bell.woke || (seen !== undefined && seen !== null && samePosition(seen, position));
        return served.bell.inTurn && onIt ? { thinking: "move" } : {};
    }

    const until = ponderingUntil(gameFolder(served.context.home()), thoughtKey(current));
    const left = until === undefined ? 0 : until.getTime() - served.context.now().getTime();

    if (left <= 0) {
        return {};
    }

    signGoesIn(served, left);
    return { thinking: "ponder" };
}

// The AI's sign the pages were last given, one a table.
const thinkingSent = new WeakMap<Served, "move" | "ponder" | undefined>();

// The pages hear when the sign of an agent that stopped pondering without a word goes, which no file tells: one timer a table, the latest.
const signTimers = new WeakMap<Served, NodeJS.Timeout>();

function signGoesIn(served: Served, wait: number): void
{
    clearTimeout(signTimers.get(served));
    signTimers.set(served, setTimeout(() => tellWatchers(served.watchers), wait + 100).unref());
}

/**
 * What the coach wrote that the player may see now, in a game going on with the helps on (D-88): its judgments, those whose note names a move they may still
 * play once they have moved, its hint for the position it was given in, and who it saw ahead (D-90); none without anything. Once the game is over its
 * PGN has the judgments and the leads.
 */
function coachOn(folder: string, current: CurrentGame | undefined): CoachWords | undefined
{
    if (current === undefined || endOf(current.game) !== undefined || !helpsIn(folder)) {
        return undefined;
    }

    const shown = coachShown(coachWords(folder, current), current);
    return shown.judgments.length === 0 && shown.hint === undefined && shown.leads === undefined ? undefined : shown;
}

/**
 * The game in analysis, once no game goes on (D-69): its name and its PGN with the AI's review, and whether an AI is going over it now; none without one,
 * or when it cannot be read.
 */
function analysisShown(served: Served): { name: string; pgn: string; book: number; reviewing?: true; incomplete?: true; } | undefined
{
    const analysis = gameInAnalysis(gameFolder(served.context.home()));

    if (analysis === undefined) {
        return undefined;
    }

    try {
        const { name, record } = namedGame(served.context, analysis.game);
        // Without a review, an AI is at it only while the chat is in a turn, or hears the player while its analyst holds the game (D-89): one the chat has
        // started again since is gone (Priya). On the table the chat's start is in the chat's own folder.
        const { bell } = served;
        const chat = { ...served.context, folder: served.attached?.chat.folder ?? served.folder };
        const reviewed = isReviewed(record);
        const reviewing = !reviewed && (bell.inTurn || (bell.listening && analystOf(chat, analysis.game) !== undefined));
        // Without a review and with nobody at it, the analysis is incomplete: the page offers to bring it back to the AI (D-109).
        const state = reviewed ? {} : reviewing ? { reviewing: true as const } : { incomplete: true as const };
        // How far the book goes, which the page cannot tell without the book's moves: its card names the opening on those moves.
        return { name, pgn: writePgn(record), book: bookPlies(record), ...state };
    } catch {
        // A game gone from the archive is no longer shown.
        return undefined;
    }
}

/** The game just over, or else the last one played, as analyse_game takes it without a name: always one of the archive. */
function lastPlayed(context: Context): { name: string; record: GameRecord; }
{
    const { name, record } = gameToStudy(context);

    if (name === undefined) {
        throw new GameNotArchived();
    }

    return { name, record };
}

/** The refusal of the game just over asked to analyse before the archive keeps it. */
class GameNotArchived extends Error
{
    constructor()
    {
        super("The game just over is not in the archive yet: try again in a moment.");
    }
}

/** Why a game to study was refused, for the page to say it: a name no game has, the game just over not kept yet, or a game that cannot be read. */
function refusalOfStudy(error: unknown): Refused["refusal"]
{
    if (error instanceof GameMissing) {
        return "game-missing";
    }

    return error instanceof GameNotArchived ? "game-not-archived" : "pgn-unreadable";
}

/** A game brought as a PGN, kept to study as analyse_game keeps it: the one already kept when it is the same game, with its review. */
async function kept(served: Served, pgn: string): Promise<{ name: string; record: GameRecord; }>
{
    await analyseGame.run({ pgn }, served.context);
    return namedGame(served.context, gameInAnalysis(gameFolder(served.context.home()))!.game);
}

/** The longest PGN the page brings: a long game with its clocks, and the comments a site adds, which go. */
const pgnLimit = 256 * 1024;

/** Why the player cannot move now; undefined when they can. */
function refusalOf(served: Served): Refused | undefined
{
    try {
        const current = gameNow(served);

        if (current === undefined || endOf(current.game) !== undefined) {
            return { error: "There is no game going on: start one in the chat.", refusal: "no-game" };
        }

        return current.game.position.turn === current.ai ? { error: "Wait for the AI's move.", refusal: "ai-to-move" } : undefined;
    } catch (error) {
        return { error: (error as Error).message };
    }
}

/** The refusal of an error thrown by a command, with its code when the error or the caller knows it. */
function refusalFrom(error: unknown, refusal?: Refused["refusal"]): Refused
{
    const message = (error as Error).message;

    if (error instanceof ChatNotClear) {
        return { error: message, refusal: "clear-chat" };
    }

    if (error instanceof WordsRefused) {
        return { error: message, refusal: `words-${error.reason}`, most: error.most };
    }

    if (error instanceof DrawRefused) {
        return { error: message, refusal: `draw-${error.reason}` };
    }

    return refusal === undefined ? { error: message } : { error: message, refusal };
}

/** The game as the page reads it now: a flag that has fallen ends it (D-13), and the doorbell tells the chat, which hears how from status. */
function gameNow(served: Served): CurrentGame | undefined
{
    const folder = gameFolder(served.context.home());
    const before = loadGame(folder);

    // The AI's clock is held while nobody hears the player: its flag cannot fall before the chat is there to move.
    if (before !== undefined && aiHeld(served, before)) {
        return before;
    }

    const current = rerunIfChanged(() => gameAt(folder, served.context.now()));

    if (before !== undefined && endOf(before.game) === undefined && current !== undefined && endOf(current.game) !== undefined) {
        served.bell.ring();
    }

    return current;
}

/** Whether the AI's clock is held: a game with a clock, going on, the AI to move, and nobody hearing the player. */
function aiHeld(served: Served, current: CurrentGame): boolean
{
    return !served.bell.listening && current.clock !== undefined && endOf(current.game) === undefined && current.game.position.turn === current.ai;
}
