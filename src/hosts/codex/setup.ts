// Getting the chat ready: the protocol begun, the account read, the thread opened or taken up with the model and effort, confirmed before the player's words.
import { failureOf, isObject, type Message, notification, wordsOf } from "../lines.ts";
import { chatReady, endTurn, modelChanged, refused, tell, write } from "../state.ts";
import { initializeParams } from "./protocol.ts";
import { sendInterrupt, type State, type Turn } from "./state.ts";

// How long Codex may take to get ready: its program started, its account read, its thread opened; and to say its configuration, which never holds the rest.
const readyWait = 60_000;
const configWait = 5000;
// How long Codex may take to confirm another model asked in the open chat.
const changeWait = 30_000;

type Before = NonNullable<State["model"]["before"]>;

/** Begins the protocol; the rest follows each answer. */
export function begin(state: State): void
{
    state.cancelReadyWait = state.later(readyWait, () => refused(state, `the host was not ready to play with the model ${state.model.asked} within ${String(readyWait / 1000)} seconds`));
    state.requests.ask("initialize", initializeParams(), (answer) => {
        const why = failureOf(answer);

        if (why !== undefined || !isObject(answer.result)) {
            refused(state, `the host did not begin the protocol: ${why ?? "its answer is no answer"}`);
            return;
        }

        write(state, notification("initialized"));
        readConfig(state, () => state.requests.ask("account/read", { refreshToken: false }, (account) => accountRead(state, account)));
    });
}

/**
 * Asks Codex the configuration it reads in the chat's folder, for the names of the player's own MCP servers, then goes on: at once where it fails, and
 * after a while where it does not answer, with none. Its names alone are taken: one Codex does not know would fail the thread.
 */
function readConfig(state: State, then: () => void): void
{
    let heard = false;

    const next = (servers: unknown): void => {
        if (heard) {
            return;
        }

        heard = true;
        cancel();
        state.others = isObject(servers) ? Object.keys(servers).filter((name) => name !== state.server) : [];
        then();
    };

    const cancel = state.later(configWait, () => {
        if (!heard) {
            state.log(`Codex did not say its configuration within ${String(configWait / 1000)} seconds: the chat opens with the player's own MCP servers on.`);
        }

        next(undefined);
    });
    state.requests.ask("config/read", { cwd: state.folder }, (answer) => {
        const why = failureOf(answer);

        if (why !== undefined && !heard) {
            state.log(`Codex did not say its configuration (${why}): the chat opens with the player's own MCP servers on.`);
        }

        const config = isObject(answer.result) && isObject(answer.result.config) ? answer.result.config : {};
        next(config.mcp_servers);
    });
}

/** Writes the player's words, with the model and effort again: the thread is told first where it or the model changed. */
export function writeWords(state: State, turn: Turn, text: string): void
{
    turn.held = undefined;
    const session = state.thread ?? "";
    const model = state.model.confirmed ?? "";
    const effort = state.model.effort;

    if (state.told?.session !== session || state.told.model !== model) {
        state.told = { session, model };
        tell(state, { type: "session", session, model });
    }

    const params = { threadId: session, input: [{ type: "text", text, text_elements: [] }], model, ...(effort === undefined ? {} : { effort }) };
    state.requests.ask("turn/start", params, (answer) => turnStarted(state, turn, answer));
}

/** The turn's end as Codex tells it: done, interrupted when the table asked it or Codex says so, else failed with why. */
export function turnCompleted(state: State, params: Message): void
{
    const turn = state.turn;
    const completed = isObject(params.turn) ? params.turn : {};

    if (turn === undefined || turn.held !== undefined || (turn.id !== undefined && completed.id !== turn.id)) {
        return;
    }

    if (turn.failure !== undefined) {
        endTurn(state, "failed", turn.failure);
    } else if (turn.interrupted || completed.status === "interrupted") {
        endTurn(state, "interrupted");
    } else if (completed.status === "completed") {
        endTurn(state, "done");
    } else {
        endTurn(state, "failed", wordsOf(completed.error) ?? `the host ended the turn: ${String(completed.status)}`);
    }
}

/** An account Codex needs and has not: the player signs in from the page. An answer that failed says nothing against it. */
function accountRead(state: State, answer: Message): void
{
    const read = isObject(answer.result) ? answer.result : {};

    if (failureOf(answer) === undefined && read.account === null && read.requiresOpenaiAuth === true) {
        refused(state, "Codex is not signed in on this computer: sign in to Codex, then open the chat again", "signin");
        return;
    }

    openThread(state);
}

/**
 * A new thread in the chat's folder, or the one taken up, with the model, the effort and the table's limits set on it; and the server and the instructions
 * given, set again on a thread taken up, whose server has a new key.
 */
function openThread(state: State): void
{
    const effort = state.model.effort;
    // The web is searched only where the table allows it; the sandbox lets Codex's commands write nothing, so that a write must ask.
    const config = { ...(effort === undefined ? {} : { model_reasoning_effort: effort }), ...(state.allowed.includes("web") ? {} : { web_search: "disabled" }), ...serversOf(state) };
    // The instructions given come after Codex's own, which they do not replace.
    const instructions = state.instructions === undefined ? {} : { developerInstructions: state.instructions };
    const options = { cwd: state.folder, model: state.model.asked, approvalPolicy: "on-request", sandbox: "read-only", config, ...instructions };
    const resumed = state.resumed;

    if (resumed === undefined) {
        state.requests.ask("thread/start", options, (answer) => threadOpened(state, answer));
    } else {
        state.requests.ask("thread/resume", { threadId: resumed, ...options, excludeTurns: true }, (answer) => threadOpened(state, answer));
    }
}

/**
 * The thread's MCP servers: the player's own turned off by name, as one Codex does not know would fail the thread; and the server given, with its
 * environment, which holds its key, in its own configuration: Codex gives an MCP server none of its process's.
 */
function serversOf(state: State): { mcp_servers?: Record<string, unknown>; }
{
    const off = state.others.map((name) => [name, { enabled: false }]);
    const given = state.given === undefined ? [] : [[state.given.name, { command: state.given.command, args: state.given.args, env: state.given.environment }]];
    const servers = [...off, ...given];
    return servers.length === 0 ? {} : { mcp_servers: Object.fromEntries(servers) as Record<string, unknown> };
}

/** The thread is open: its model, and its effort where one was asked, must be those asked, as Codex goes back to the account's own when it takes one up. */
function threadOpened(state: State, answer: Message): void
{
    const why = failureOf(answer);
    const opened = isObject(answer.result) ? answer.result : {};
    const thread = isObject(opened.thread) ? opened.thread.id : undefined;
    const { asked, effort } = state.model;

    if (why !== undefined || typeof thread !== "string") {
        refused(state, `the host did not ${state.resumed === undefined ? "open the chat" : "take the chat up again"}: ${why ?? "it named no thread"}`);
    } else if (opened.model !== asked) {
        refused(state, `the host was asked for the model ${asked} and runs ${typeof opened.model === "string" ? opened.model : "another, unnamed"}`);
    } else if (effort !== undefined && opened.reasoningEffort !== effort) {
        refused(state, `the host was asked for the effort ${effort} and runs ${typeof opened.reasoningEffort === "string" ? opened.reasoningEffort : "another, unnamed"}`);
    } else {
        state.thread = thread;
        state.model.confirmed = asked;
        chatReady(state);
    }
}

/**
 * Another model asked in the open chat, and the effort where given: set on the thread now, the player's next words held until the thread's settings confirm
 * them; an error, settings that name others, or none within the wait, and the chat goes on with those it ran before.
 */
export function changeModel(state: State, model: string, effort: string | undefined): void
{
    const { asked, effort: running, confirmed } = state.model;
    const before = { asked, ...(running === undefined ? {} : { effort: running }), ...(confirmed === undefined ? {} : { confirmed }) };
    state.ready = false;
    state.model = { asked: model, ...(effort === undefined ? {} : { effort }), ...(confirmed === undefined ? {} : { confirmed }), before };
    state.cancelReadyWait = state.later(changeWait, () => changeRefused(state, before, `the host did not confirm the model ${model} within ${String(changeWait / 1000)} seconds`));
    state.requests.ask("thread/settings/update", { threadId: state.thread, model, ...(effort === undefined ? {} : { effort }) }, (answer) => {
        const why = failureOf(answer);

        if (why !== undefined) {
            changeRefused(state, before, `the host did not take the model ${model}: ${why}`);
        }
    });
}

/** The thread's settings while a change waits: those asked confirm it, told at once; any others refuse it. */
export function changeSettled(state: State, model: unknown, effort: unknown): void
{
    const { asked, effort: askedEffort, before } = state.model;

    if (before === undefined) {
        return;
    }

    if (model !== asked) {
        changeRefused(state, before, `the host was asked for the model ${asked} and runs ${typeof model === "string" ? model : "another, unnamed"}`);
    } else if (askedEffort !== undefined && effort !== askedEffort) {
        changeRefused(state, before, `the host was asked for the effort ${askedEffort} and runs ${typeof effort === "string" ? effort : "another, unnamed"}`);
    } else {
        state.model = { asked, confirmed: asked, ...(askedEffort === undefined ? {} : { effort: askedEffort }) };
        modelChanged(state, asked, undefined, asked);
        chatReady(state);
    }
}

/** Codex did not take the model or effort asked in the open chat: the chat goes on with those it ran before, its next turn's start naming them again. */
function changeRefused(state: State, before: Before, why: string): void
{
    if (state.model.before !== before) {
        return;
    }

    const asked = state.model.asked;
    state.model = before;
    tell(state, { type: "changeRefused", asked, model: before.asked, ...(before.effort === undefined ? {} : { effort: before.effort }), why });
    chatReady(state);
}

/** Codex took the words, and names the turn; one that did not fails the turn, or ends it as interrupted where the table asked it to stop. */
function turnStarted(state: State, turn: Turn, answer: Message): void
{
    if (state.turn !== turn) {
        return;
    }

    const why = failureOf(answer);

    if (why !== undefined) {
        if (turn.interrupted && turn.failure === undefined) {
            endTurn(state, "interrupted");
        } else {
            endTurn(state, "failed", turn.failure ?? `the host did not take the player's words: ${why}`);
        }

        return;
    }

    const started = isObject(answer.result) && isObject(answer.result.turn) ? answer.result.turn.id : undefined;

    if (typeof started === "string") {
        turn.id ??= started;
    }

    sendInterrupt(state, turn);
}
