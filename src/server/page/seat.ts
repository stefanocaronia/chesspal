// The seat at the table's page for a chat the table drives in its own process: it attaches without HTTP, waits at the bell with a listener of its own,
// and its place's context takes the page's hooks, as a chat's server takes them from its page. The page reads it as it reads a chat attached over HTTP.
import type { Context } from "../../commands/index.ts";
import type { BellListener } from "../bell/index.ts";
import { chatLeft, seatChat } from "./attach.ts";
import type { Attached, ChatAttach } from "./chat.ts";
import { askNewGame, tellWatchers } from "./events.ts";
import { aiToMove, chatCalls, stallEnds } from "./game.ts";
import type { Served } from "./page.ts";

/** The hooks of the page a chat's context takes: news for the pages, a tool called, whether a browser has the page open, the New game window, its address. */
export type SeatHooks = Required<Pick<Context, "heard" | "calls" | "pageOpen" | "askNewGame" | "page">>;

/** What the table's page gives the chat the table drives in its own process. */
export interface ChatSeat
{
    /** Whether the table is free: no chat at it. */
    free(): boolean;
    /** The chat attaches, its state read from `context`, its place's: false while another chat is at the table. Its turns end where the table sees them. */
    attach(chat: ChatAttach, context: Context): boolean;
    /** The chat attached through this seat leaves the table, as a chat's process that ends: nobody waits at the bell any more. */
    leave(): void;
    /** The chat's turn has ended: it waits at the bell with `listener`. What it returns tells the bell the listener went without it. */
    wait(listener: BellListener): () => void;
    /**
     * The chat taken up again waits at the bell with `listener`: rung at once when the AI is to move, its clock given back the time it was held while
     * nobody heard the player.
     */
    resume(listener: BellListener): () => void;
    /** Whether the AI is to move now in a game going on, its clock running. */
    aiToMove(): boolean;
    /** Rings the bell for the chat, as the player's act does: the listener waiting hears it with the game. */
    ring(): void;
    /** A turn of the chat's starts with words the bell did not send: the listener, if one waits, is let go. */
    prompted(): void;
    /** The chat is at rest without having moved: stopped by the player, or with no move after two turns. The AI's clock is held until it is woken. */
    stall(why: "stopped" | "noMove"): void;
    /** What the pages show of the chat may have changed: a turn started or ended. */
    changed(): void;
    /** The chat opening will not come, as one that failed before it attached: the pages stop showing it opening. */
    notOpening(): void;
    /** Told each time a browser opens the page. */
    pageOpened(listener: () => void): void;
    readonly hooks: SeatHooks;
}

/** The seat of the page `served`, at its address. */
export function chatSeat(served: Served, page: string): ChatSeat
{
    let seated: Attached | undefined;
    const opened: (() => void)[] = [];
    served.seatOpened = () => opened.forEach((listener) => listener());

    // The chat woken ends what held its clock.
    const waking = (listener: BellListener): BellListener => ({
        rung: (game) => {
            stallEnds(served);
            listener.rung(game);
        },
        dismissed: () => listener.dismissed(),
    });
    const wait = (listener: BellListener): () => void => served.bell.wait(waking(listener), false, { session: seated?.chat.session ?? undefined });

    return {
        free: () => served.attached === undefined,
        attach: (chat, context) => {
            if (served.attached !== undefined) {
                return false;
            }

            seated = seatChat(served, chat, context);
            served.bell.chatHooked();
            tellWatchers(served.watchers);
            return true;
        },
        leave: () => {
            if (seated !== undefined) {
                served.stalled = undefined;
                chatLeft(served, seated);
                seated = undefined;
            }
        },
        wait,
        resume: (listener) => {
            const moving = aiToMove(served);

            // As a chat's first call does: the time nobody heard the player is given back to the AI.
            if (moving) {
                chatCalls(served);
            }

            const gone = wait(listener);

            // Rung at once, unless a ring it missed already woke it.
            if (moving && !served.bell.inTurn) {
                served.bell.ring();
            }

            return gone;
        },
        aiToMove: () => aiToMove(served),
        ring: () => served.bell.ring(),
        prompted: () => {
            stallEnds(served);
            served.bell.chatPrompted();
        },
        stall: (why) => {
            served.stalled = why;
            tellWatchers(served.watchers);
        },
        changed: () => tellWatchers(served.watchers),
        notOpening: () => {
            served.chatOpened = undefined;
            tellWatchers(served.watchers);
        },
        pageOpened: (listener) => void opened.push(listener),
        hooks: {
            heard: () => tellWatchers(served.watchers),
            calls: () => chatCalls(served),
            pageOpen: () => served.watchers.size > 0,
            askNewGame: () => askNewGame(served.watchers),
            page,
        },
    };
}
