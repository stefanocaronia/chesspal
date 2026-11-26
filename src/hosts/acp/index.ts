// The chat in a host that speaks the Agent Client Protocol: its program started with no terminal, spoken to by JSON-RPC, one object a line each way.
// Nothing here names a host: each driver says its program's arguments and how its tools are read. A server given by who opens the chat travels in the
// session's request alone, and the instructions given with the chat's first words.
import { type ChatOptions, type HostChat, serverNameOf } from "../chat.ts";
import { notification, Requests } from "../lines.ts";
import { heldChat, startHost, write } from "../state.ts";
import type { AcpHost } from "./host.ts";
import { readMessage } from "./read.ts";
import { begin, changeModel, writePrompt } from "./setup.ts";
import { newTurn, type State } from "./state.ts";

export { type AcpHost, kindOfCall, pathsOfCall, patternOutside } from "./host.ts";
export { acpModels } from "./models.ts";

/** Opens a chat with the AI in the host, or takes one up again by its session; the player's words wait until the model is confirmed. */
export function openAcp(options: ChatOptions, host: AcpHost): HostChat
{
    const server = serverNameOf(options);
    const shared = startHost(options, host.name, host.args);
    const state: State = {
        ...shared,
        host,
        server,
        ...(options.server === undefined ? {} : { given: options.server }),
        ...(options.instructions === undefined || options.session !== undefined ? {} : { instructions: options.instructions }),
        requests: new Requests((line) => shared.process.write(line)),
        ...(options.session === undefined ? {} : { resumed: options.session }),
        capabilities: {},
        config: undefined,
        model: { asked: options.model, ...(options.effort === undefined ? {} : { effort: options.effort }) },
        children: new Set(),
        protocol: {
            newTurn,
            words: (turn, text) => writePrompt(state, turn, text),
            stop: () => write(state, notification("session/cancel", { sessionId: state.session })),
            read: (message) => readMessage(state, message),
            change: (model, effort) => changeModel(state, model, effort),
        },
    };
    return heldChat(state, () => begin(state));
}
