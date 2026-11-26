// The seat at the table's page for a chat the table drives in its own process: it attaches without HTTP, waits at the bell with a listener of its own,
// and its place's context takes the page's hooks, as a chat's server takes them from its page. The page reads it as it reads a chat attached over HTTP.
import type { Context } from "../../commands/index.ts";
import type { BellListener } from "../bell/index.ts";
import { chatLeft, seatChat } from "./attach.ts";
import type { Attached, ChatAttach } from "./chat.ts";
import { askNewGame, tellWatchers } from "./events.ts";
import { chatCalls } from "./game.ts";
import type { Served } from "./page.ts";

/** The hooks of the page a chat's context takes: news for the pages, a tool called, whether a browser has the page open, the New game window, its address. */
export type SeatHooks = Required<Pick<Context, "heard" | "calls" | "pageOpen" | "askNewGame" | "page">>;

/** What the table's page gives the chat the table drives in its own process. */
export interface ChatSeat
{
    /** The chat attaches, its state read from `context`, its place's: false while another chat is at the table. */
    attach(chat: ChatAttach, context: Context): boolean;
    /** The chat attached through this seat leaves the table, as a chat's process that ends: nobody waits at the bell any more. */
    leave(): void;
    /** The chat's turn has ended: it waits at the bell with `listener`. What it returns tells the bell the listener went without it. */
    wait(listener: BellListener): () => void;
    /** A turn of the chat's starts with words the bell did not send: the listener, if one waits, is let go. */
    prompted(): void;
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
    return {
        attach: (chat, context) => {
            if (served.attached !== undefined) {
                return false;
            }

            seated = seatChat(served, chat, context);
            tellWatchers(served.watchers);
            return true;
        },
        leave: () => {
            if (seated !== undefined) {
                chatLeft(served, seated);
                seated = undefined;
            }
        },
        wait: (listener) => served.bell.wait(listener, false, { session: seated?.chat.session ?? undefined }),
        prompted: () => served.bell.chatPrompted(),
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
