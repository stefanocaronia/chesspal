// Getting the chat ready: the protocol begun, the account read, the thread opened or taken up with the model and effort, confirmed before the player's words.
import { failureOf, isObject, type Message, notification, wordsOf } from "../lines.ts";
import { chatReady, endTurn, refused, tell, write } from "../state.ts";
import { initializeParams } from "./protocol.ts";
import { sendInterrupt, type State, type Turn } from "./state.ts";

// How long Codex may take to get ready: its program started, its account read, its thread opened.
const readyWait = 60_000;

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
        state.requests.ask("account/read", { refreshToken: false }, (account) => accountRead(state, account));
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

/** An account Codex needs and has not: it would ask for a sign-in in a terminal the table does not have. An answer that failed says nothing against it. */
function accountRead(state: State, answer: Message): void
{
    const read = isObject(answer.result) ? answer.result : {};

    if (failureOf(answer) === undefined && read.account === null && read.requiresOpenaiAuth === true) {
        refused(state, "Codex is not signed in: run codex login in a terminal, then try again");
        return;
    }

    openThread(state);
}

/** A new thread in the chat's folder, or the one taken up, with the model, the effort and the table's limits set on it. */
function openThread(state: State): void
{
    const effort = state.model.effort;
    // The web is searched only where the table allows it; the sandbox lets Codex's commands write nothing, so that a write must ask.
    const config = { ...(effort === undefined ? {} : { model_reasoning_effort: effort }), ...(state.allowed.includes("web") ? {} : { web_search: "disabled" }) };
    const options = { cwd: state.folder, model: state.model.asked, approvalPolicy: "on-request", sandbox: "read-only", config };
    const resumed = state.resumed;

    if (resumed === undefined) {
        state.requests.ask("thread/start", options, (answer) => threadOpened(state, answer));
    } else {
        state.requests.ask("thread/resume", { threadId: resumed, ...options, excludeTurns: true }, (answer) => threadOpened(state, answer));
    }
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
