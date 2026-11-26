// The chat in Codex: its program started with no terminal as `codex app-server`, spoken to by its own JSON-RPC protocol, in the chat's folder.
import { join } from "node:path";
import { type ChatOptions, type HostChat, type HostDriver, refuseGiven } from "../chat.ts";
import { Requests } from "../lines.ts";
import { hosts } from "../names.ts";
import { isFile } from "../program.ts";
import { heldChat, startHost } from "../state.ts";
import { codexModels } from "./models.ts";
import { codexEnvironment, codexProgram, serverArguments } from "./program.ts";
import { readMessage } from "./read.ts";
import { begin, changeModel, writeWords } from "./setup.ts";
import { newTurn, sendInterrupt, type State } from "./state.ts";

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
    refuseGiven(options, hosts.codex.name);
    const shared = startHost(options, hosts.codex.name, serverArguments(options.folder));
    const state: State = {
        ...shared,
        requests: new Requests((line) => shared.process.write(line)),
        ...(options.session === undefined ? {} : { resumed: options.session }),
        model: { asked: options.model, ...(options.effort === undefined ? {} : { effort: options.effort }) },
        others: [],
        protocol: {
            newTurn,
            words: (turn, text) => writeWords(state, turn, text),
            stop: (turn) => sendInterrupt(state, turn),
            read: (message) => readMessage(state, message),
            change: (model, effort) => changeModel(state, model, effort),
        },
    };
    return heldChat(state, () => begin(state));
}
