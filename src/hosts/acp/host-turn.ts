// A turn the host begins by itself once its own ended, as OpenCode goes on to tell a subagent's answer: the protocol gives it no end, so a silence ends it.
import type { Message } from "../lines.ts";
import { endTurn, tell } from "../state.ts";
import { newTurn, type State, type Turn } from "./state.ts";

// How long the AI and its subagents may say nothing before the host's turn ends: longer than the longest silence seen within one of OpenCode's turns,
// with no tool running (18 seconds, before a tool call).
const silence = 20_000;

// The updates of the AI at work; the others, as the commands it offers or what a turn cost, may come between turns.
const atWork = new Set(["agent_message_chunk", "agent_thought_chunk", "tool_call", "tool_call_update", "plan"]);

/**
 * An update of the AI's session, or of a subagent's (`child`): one of the AI at work while no turn runs, once the chat is ready, opens the host's
 * turn, and any update keeps that turn going.
 */
export function heardHost(state: State, update: Message, child: string | undefined): void
{
    if (state.turn === undefined && state.ready && child === undefined && atWork.has(String(update.sessionUpdate))) {
        state.turn = { ...newTurn(), byHost: true };
        tell(state, { type: "turnStart", by: "host" });
    }

    const turn = state.turn;

    if (turn?.byHost === true) {
        waitSilence(state, turn);
    }
}

/** Ends the host's turn after the silence, unless a tool of the AI's still runs, as a question that waits for the player. */
function waitSilence(state: State, turn: Turn): void
{
    state.cancelSilence?.();
    state.cancelSilence = state.later(silence, () => {
        if (state.closed || state.ended || state.turn !== turn) {
            return;
        }

        if ([...turn.started.keys()].some((id) => !turn.ended.has(id))) {
            waitSilence(state, turn);
        } else {
            endTurn(state, "done");
        }
    });
}
