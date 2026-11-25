// The chat in Claude Code: its program started with no terminal, spoken to by its stream-json protocol, one JSON object a line each way.
import { join } from "node:path";
import { type ChatOptions, EventQueue, type HostChat, type HostDriver, isHostName, keepError, laterByTimer, warnFailed } from "../chat.ts";
import { startLineProcess } from "../process.ts";
import { isFile } from "../program.ts";
import { claudeModels } from "./models.ts";
import { claudeEnvironment, claudeProgram, settingArguments, streamArguments } from "./program.ts";
import { builtInTools, userMessage } from "./protocol.ts";
import { readLine } from "./read.ts";
import { askModel, askToStop, cancelWaits, endTurn, newTurn, processEnded, type State, write } from "./state.ts";

/** Claude Code as the table drives it. */
export const claudeCode: HostDriver = {
    open: (options) => openClaudeCode(options),
    missing: (folder) =>
        isFile(join(folder, ".mcp.json"))
            ? undefined
            : "This folder has no .mcp.json, which tells Claude Code how to start Chesspal's server: run `chesspal init` in this folder, then try again.",
    program: claudeProgram,
    environment: claudeEnvironment,
    models: claudeModels,
    model: "opus",
    efforts: ["low", "medium", "high", "xhigh", "max"],
};

/** Opens a chat with the AI in Claude Code, or takes one up again by its session. */
function openClaudeCode(options: ChatOptions): HostChat
{
    // The last guard: a name that could be read as an option never becomes an argument.
    for (const name of [options.model, options.session].filter((value) => value !== undefined)) {
        if (!isHostName(name)) {
            throw new Error(`${JSON.stringify(name.slice(0, 200))} is no name of a model or a chat`);
        }
    }

    const start = options.start ?? startLineProcess;
    const errors: string[] = [];
    const host = start(options.program.command, [...options.program.args, ...programArguments(options)], { cwd: options.folder, env: options.environment, errors: (line) => keepError(errors, line) });
    const state: State = {
        process: host,
        events: new EventQueue(options.failed ?? warnFailed),
        later: options.later ?? laterByTimer,
        folder: options.folder,
        allowed: options.allowed,
        requests: 0,
        model: { asked: options.model, request: "" },
        errors,
        closed: false,
        ended: false,
    };
    host.onLine((line) => readLine(state, line));
    host.onEnd((reason) => processEnded(state, reason));
    askModel(state);
    return {
        send: (text) => send(state, text),
        onEvent: (listener) => state.events.listen(listener),
        interrupt: () => interrupt(state),
        close: () => close(state),
    };
}

/** The program's arguments after its own: the protocol, the model and effort, the folder's settings and its chesspal server alone, the tools allowed, the chat taken up. */
function programArguments(options: ChatOptions): string[]
{
    const tools = builtInTools.filter((tool) => options.allowed.includes(tool.kind)).map((tool) => tool.name);
    return [
        ...streamArguments,
        "--include-partial-messages",
        "--permission-prompt-tool",
        "stdio",
        "--model",
        options.model,
        ...(options.effort === undefined ? [] : ["--effort", options.effort]),
        ...settingArguments,
        "--mcp-config",
        join(options.folder, ".mcp.json"),
        "--disable-slash-commands",
        "--tools",
        tools.join(","),
        ...(options.session === undefined ? [] : ["--resume", options.session]),
    ];
}

function send(state: State, text: string): boolean
{
    if (state.closed || state.ended || state.turn !== undefined || text.trim() === "") {
        return false;
    }

    const turn = newTurn();
    state.turn = turn;

    if (state.model.confirmed === undefined) {
        turn.held = text;
    } else {
        write(state, userMessage(text));
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
