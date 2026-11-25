// The chat in a host that speaks the Agent Client Protocol: its program started with no terminal, spoken to by JSON-RPC, one object a line each way.
// Nothing here names a host: each driver says its program's arguments and how its tools are read.
import { type ChatOptions, EventQueue, type HostChat, keepError, laterByTimer, warnFailed } from "../chat.ts";
import { startLineProcess } from "../process.ts";
import type { AcpHost } from "./host.ts";
import { readLine } from "./read.ts";
import { begin, writePrompt } from "./setup.ts";
import { askToStop, cancelWaits, endTurn, newTurn, processEnded, type State } from "./state.ts";

export { type AcpHost, kindOfCall, pathsOfCall, patternOutside } from "./host.ts";
export { acpModels } from "./models.ts";

/** Opens a chat with the AI in the host, or takes one up again by its session; the player's words wait until the model is confirmed. */
export function openAcp(options: ChatOptions, host: AcpHost): HostChat
{
    const start = options.start ?? startLineProcess;
    const errors: string[] = [];
    const agent = start(options.program.command, [...options.program.args, ...host.args], { cwd: options.folder, env: options.environment, errors: (line) => keepError(errors, line) });
    const state: State = {
        process: agent,
        host,
        events: new EventQueue(options.failed ?? warnFailed),
        later: options.later ?? laterByTimer,
        folder: options.folder,
        allowed: options.allowed,
        pending: new Map(),
        requests: 0,
        ...(options.session === undefined ? {} : { resumed: options.session }),
        capabilities: {},
        config: undefined,
        model: { asked: options.model, ...(options.effort === undefined ? {} : { effort: options.effort }) },
        ready: false,
        errors,
        children: new Set(),
        closed: false,
        ended: false,
    };
    agent.onLine((line) => readLine(state, line));
    agent.onEnd((reason) => processEnded(state, reason));
    begin(state);
    return {
        send: (text) => send(state, text),
        onEvent: (listener) => state.events.listen(listener),
        interrupt: () => interrupt(state),
        close: () => close(state),
    };
}

function send(state: State, text: string): boolean
{
    if (state.closed || state.ended || state.turn !== undefined || text.trim() === "") {
        return false;
    }

    const turn = newTurn();
    state.turn = turn;

    if (state.ready) {
        writePrompt(state, turn, text);
    } else {
        turn.held = text;
    }

    return true;
}

function interrupt(state: State): void
{
    const turn = state.turn;

    if (state.closed || state.ended || turn === undefined) {
        return;
    }

    // Words not written yet: the turn ends here, and they never are.
    if (turn.held !== undefined) {
        endTurn(state, "interrupted");
        return;
    }

    askToStop(state, turn);
}

/** Closes the chat; its process, stopped unless it ended. */
function close(state: State): void
{
    if (state.closed) {
        return;
    }

    state.closed = true;
    cancelWaits(state);
    state.events.close();

    if (!state.ended) {
        state.process.stop();
    }
}
