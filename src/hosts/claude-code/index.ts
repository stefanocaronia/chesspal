// The chat in Claude Code: its program started with no terminal, spoken to by its stream-json protocol, one JSON object a line each way.
import { join } from "node:path";
import { type ChatOptions, type HostChat, type HostDriver, isHostName } from "../chat.ts";
import { isFile } from "../program.ts";
import { heldChat, startHost } from "../state.ts";
import { givenArguments, serverOf } from "./given.ts";
import { claudeModels } from "./models.ts";
import { agentArguments, claudeEnvironment, claudeProgram, settingArguments, streamArguments } from "./program.ts";
import { builtInTools } from "./protocol.ts";
import { readMessage } from "./read.ts";
import { askModel, newTurn, type State, writeStop, writeWords } from "./state.ts";

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

    const server = serverOf(options);
    const state: State = {
        ...startHost(options, programArguments(options)),
        server,
        ...(options.effort === undefined ? {} : { effort: options.effort }),
        requests: 0,
        model: { asked: options.model, request: "" },
        protocol: {
            newTurn,
            words: (turn, text) => writeWords(state, turn, text),
            stop: () => writeStop(state),
            read: (message) => readMessage(state, message),
        },
    };
    return heldChat(state, () => askModel(state));
}

/**
 * The program's arguments after its own: the protocol, the model and effort, the folder's settings and its chesspal server alone, or the server and the
 * instructions given, the tools allowed, a subagent asked before it starts, the chat taken up.
 */
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
        ...givenArguments(options),
        "--disable-slash-commands",
        "--tools",
        tools.join(","),
        ...(options.allowed.includes("agent") ? agentArguments : []),
        ...(options.session === undefined ? [] : ["--resume", options.session]),
    ];
}
