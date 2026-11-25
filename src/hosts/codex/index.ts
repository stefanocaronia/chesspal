// The chat in Codex: its program started with no terminal as `codex app-server`, spoken to by its own JSON-RPC protocol, in the chat's folder.
import { join } from "node:path";
import { type ChatOptions, EventQueue, type HostChat, type HostDriver, keepError, laterByTimer, warnFailed } from "../chat.ts";
import { startLineProcess } from "../process.ts";
import { isFile } from "../program.ts";
import { codexModels } from "./models.ts";
import { codexEnvironment, codexProgram, serverArguments } from "./program.ts";
import { readLine } from "./read.ts";
import { begin, writeWords } from "./setup.ts";
import { askToStop, cancelWaits, endTurn, newTurn, processEnded, type State } from "./state.ts";

/** Codex as the table drives it: the model a new chat proposes is the first Codex lists, the account's own default. */
export const codex: HostDriver = {
    open: (options) => openCodex(options),
    missing: (folder) =>
        isFile(join(folder, ".codex", "config.toml"))
            ? undefined
            : "This folder has no .codex/config.toml, which tells Codex how to start Chesspal's server: run `chesspal init` in this folder, then try again.",
    program: codexProgram,
    environment: codexEnvironment,
    models: codexModels,
    model: "",
    efforts: ["low", "medium", "high", "xhigh", "max", "ultra"],
};

/** Opens a chat with the AI in Codex, or takes one up again by its thread; the player's words wait until the model is confirmed. */
function openCodex(options: ChatOptions): HostChat
{
    const start = options.start ?? startLineProcess;
    const errors: string[] = [];
    const args = [...options.program.args, ...serverArguments(options.folder)];
    const host = start(options.program.command, args, { cwd: options.folder, env: options.environment, errors: (line) => keepError(errors, line) });
    const state: State = {
        process: host,
        events: new EventQueue(options.failed ?? warnFailed),
        later: options.later ?? laterByTimer,
        folder: options.folder,
        allowed: options.allowed,
        pending: new Map(),
        requests: 0,
        ...(options.session === undefined ? {} : { resumed: options.session }),
        model: { asked: options.model, ...(options.effort === undefined ? {} : { effort: options.effort }) },
        ready: false,
        errors,
        closed: false,
        ended: false,
    };
    host.onLine((line) => readLine(state, line));
    host.onEnd((reason) => processEnded(state, reason));
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
        writeWords(state, turn, text);
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
