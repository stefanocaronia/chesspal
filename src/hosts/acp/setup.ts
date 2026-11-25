// Getting the chat ready: the protocol begun, the session opened or taken up, the model and effort set and confirmed before the player's first words.
import { configOption, failureOf, initializeParams, isObject, type Message } from "./protocol.ts";
import { ask, endTurn, refused, type State, tell, type Turn } from "./state.ts";

// How long the agent may take to get ready: its program started, its session opened with its MCP servers, the model set.
const readyWait = 60_000;

/** Begins the protocol; the rest follows each answer. */
export function begin(state: State): void
{
    waitReady(state);
    ask(state, "initialize", initializeParams(), (answer) => {
        const why = failureOf(answer);

        if (why !== undefined || !isObject(answer.result)) {
            refused(state, `the host did not begin the protocol: ${why ?? "its answer is no answer"}`);
            return;
        }

        state.capabilities = isObject(answer.result.agentCapabilities) ? answer.result.agentCapabilities : {};
        openSession(state);
    });
}

/** Asks the model again after the agent changed it: the player's next words wait for its answer. */
export function askModelAgain(state: State): void
{
    state.ready = false;
    state.model.confirmed = undefined;
    waitReady(state);
    askModel(state);
}

/** The chat is ready: the words held, if any, are written. */
function ready(state: State): void
{
    state.ready = true;
    state.cancelReadyWait?.();
    state.cancelReadyWait = undefined;
    const turn = state.turn;

    if (turn?.held !== undefined) {
        writePrompt(state, turn, turn.held);
    }
}

/** Writes the player's words: the session is told first where it or the model changed. */
export function writePrompt(state: State, turn: Turn, text: string): void
{
    turn.held = undefined;
    const session = state.session ?? "";
    const model = state.model.confirmed ?? "";

    if (state.told?.session !== session || state.told.model !== model) {
        state.told = { session, model };
        tell(state, { type: "session", session, model });
    }

    ask(state, "session/prompt", { sessionId: session, prompt: [{ type: "text", text }] }, (answer) => promptAnswered(state, turn, answer));
}

function waitReady(state: State): void
{
    state.cancelReadyWait?.();
    state.cancelReadyWait = state.later(readyWait, () => refused(state, `the host was not ready to play with the model ${state.model.asked} within ${String(readyWait / 1000)} seconds`));
}

/** A new session, or the one taken up: by loading it, or resuming it where the agent cannot load. */
function openSession(state: State): void
{
    const sessions = isObject(state.capabilities.sessionCapabilities) ? state.capabilities.sessionCapabilities : {};
    const where = { cwd: state.folder, mcpServers: [] };
    const resumed = state.resumed;

    if (resumed === undefined) {
        ask(state, "session/new", where, (answer) => sessionOpened(state, answer));
    } else if (state.capabilities.loadSession === true) {
        ask(state, "session/load", { ...where, sessionId: resumed }, (answer) => sessionOpened(state, answer));
    } else if (sessions.resume !== undefined) {
        ask(state, "session/resume", { ...where, sessionId: resumed }, (answer) => sessionOpened(state, answer));
    } else {
        refused(state, "the host cannot take a chat up again: open a new one");
    }
}

function sessionOpened(state: State, answer: Message): void
{
    const why = failureOf(answer);
    const opened = isObject(answer.result) ? answer.result : {};
    const session = state.resumed ?? opened.sessionId;

    if (why !== undefined || typeof session !== "string") {
        refused(state, `the host did not open the chat: ${why ?? "it named no session"}`);
        return;
    }

    state.session = session;
    state.config = opened.configOptions;
    askModel(state);
}

/** Sets the model by the session's option of configuration, or by the protocol's call for models where it has no such option. */
function askModel(state: State): void
{
    const asked = state.model.asked;
    const option = configOption(state.config, "model", "model");

    if (option !== undefined && typeof option.id === "string") {
        setOption(state, option.id, asked, "model", (confirmed) => {
            state.model.confirmed = confirmed;
            askEffort(state);
        });
    } else {
        // Without such an option, the protocol's own call: its success is the confirmation, and a host that has no such call says so in its error.
        ask(state, "session/set_model", { sessionId: state.session, modelId: asked }, (answer) => {
            const why = failureOf(answer);

            if (why !== undefined) {
                refused(state, `the host did not take the model ${asked}: ${why}`);
                return;
            }

            state.model.confirmed = asked;
            askEffort(state);
        });
    }
}

/** Sets the effort where the model has such an option; a model without one takes no effort. */
function askEffort(state: State): void
{
    const effort = state.model.effort;
    const option = configOption(state.config, "thought_level", "effort");

    if (effort === undefined || option === undefined || typeof option.id !== "string") {
        ready(state);
        return;
    }

    setOption(state, option.id, effort, "effort", () => ready(state));
}

/** Sets an option of the session and calls `confirmed` once the agent's answer shows it set; else the chat ends saying what the agent did. */
function setOption(state: State, id: string, value: string, what: "model" | "effort", confirmed: (value: string) => void): void
{
    ask(state, "session/set_config_option", { sessionId: state.session, configId: id, value }, (answer) => {
        const why = failureOf(answer);
        const result = isObject(answer.result) ? answer.result : {};

        if (why !== undefined) {
            refused(state, `the host did not take the ${what} ${value}: ${why}`);
            return;
        }

        // An answer that lists no options says nothing against the value set: its success confirms it.
        if (!Array.isArray(result.configOptions)) {
            confirmed(value);
            return;
        }

        state.config = result.configOptions;
        const now = result.configOptions.filter(isObject).find((option) => option.id === id)?.currentValue;

        if (now === value) {
            confirmed(value);
        } else {
            refused(state, `the host was asked for the ${what} ${value} and runs ${typeof now === "string" ? now : "another, unnamed"}`);
        }
    });
}

/** The turn's end: done, interrupted when the table asked it, else failed with why. */
function promptAnswered(state: State, turn: Turn, answer: Message): void
{
    if (state.turn !== turn) {
        return;
    }

    const why = failureOf(answer);
    const reason = isObject(answer.result) ? answer.result.stopReason : undefined;

    if (turn.failure !== undefined) {
        endTurn(state, "failed", turn.failure);
    } else if (turn.interrupted || reason === "cancelled") {
        endTurn(state, "interrupted");
    } else if (why !== undefined) {
        endTurn(state, "failed", why);
    } else if (reason === "end_turn") {
        endTurn(state, "done");
    } else {
        endTurn(state, "failed", stopWords[String(reason)] ?? `the host stopped the turn: ${String(reason)}`);
    }
}

// Why the agent stopped a turn, in words a player can read.
const stopWords: Record<string, string> = {
    max_tokens: "the AI's answer reached the longest its model may write",
    max_turn_requests: "the AI took more steps than one turn allows",
    refusal: "the model refused to go on",
};
