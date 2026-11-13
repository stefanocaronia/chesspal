// The chat at the table in a window of its own, opened from the AI's name as «Chi gioca?» is from the player's (D-107), laid out as the new game's: a card
// for each host installed, the tick on the one at the table; the selected one's model and effort, kept in the profile; and one button that says what it
// does: open a chat, start the one chesspal play holds again, clean, once it has ended its answer, or in another host, or only close the window.
import type { VNode } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { ChatHost, TableShown } from "../app/served.ts";
import { Dialog } from "../dialogs/dialog.tsx";
import { checkIcon } from "../dialogs/profiles.tsx";
import type { Settings } from "../profile/settings.ts";
import type { Text } from "../text.ts";
import { type ChatAction, chatAction, choiceKeys, chosen, firstHost, offeredHosts } from "./action.ts";

/** The chat's window: closed once a chat opens or starts again, the page then saying where it stands; `review` when it opened to have a game analysed. */
export function ChatDialog({ open, review = false, table, settings, onChange, name, onClose, text }: {
    open: boolean;
    review?: boolean;
    table: TableShown;
    settings: Settings;
    onChange: (settings: Settings) => void;
    name: string;
    onClose: () => void;
    text: Text;
})
{
    return (
        <Dialog open={open} title={review ? text.table.reviewTitle : text.table.title} onClose={onClose} text={text}>
            <ChatForm review={review} table={table} settings={settings} onChange={onChange} name={name} onClose={onClose} text={text} />
        </Dialog>
    );
}

/** The AI's name on its card, which opens the chat's window: with no chat at the table, a hollow ring before it says so. */
export function AiNameButton({ name, table, onOpen, text }: { name: string; table: TableShown; onOpen: () => void; text: Text; })
{
    const title = table.chat ? text.table.change : text.table.noChat;
    return (
        <button class="profile-name ai-name" type="button" title={title} aria-label={`${name}: ${title}`} aria-haspopup="dialog" onClick={onOpen}>
            {table.chat ? null : <span class="no-chat" aria-hidden="true" />}
            <span>{name}</span>
            <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 10L12 15L17 10" />
            </svg>
        </button>
    );
}

/**
 * The note on the chat at the table where the asleep note stands: one opening or starting again; one waiting to, or a new game waiting for it, with a ↻
 * that starts it at once and a × that lets the request go; in a game with no chat at the table, a line that opens the chat's window. None otherwise.
 */
export function tableNote({ table, name, inGame, onOpen, text }: { table: TableShown; name: string; inGame: boolean; onOpen: () => void; text: Text; }): VNode | null
{
    const words = text.table;
    const state = chatState(table, name, text);

    if (table.waiting !== undefined) {
        const newGame = table.waiting === "new-game";
        const now = newGame ? words.newGameNow : words.restartNow;
        const cancel = newGame ? words.newGameCancel : words.cancel;
        return (
            <p class="asleep table-note" role="status">
                <span>{state}</span>
                <button class="icon-button" type="button" title={now} aria-label={now} onClick={() => void endWaiting(true)}>
                    {restartIcon}
                </button>
                <button class="icon-button" type="button" title={cancel} aria-label={cancel} onClick={() => void endWaiting(false)}>
                    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M6 6L18 18M18 6L6 18" />
                    </svg>
                </button>
            </p>
        );
    }

    if (state !== undefined) {
        return <p class="asleep" role="status">{state}</p>;
    }

    if (!table.chat && inGame) {
        return (
            <p class="asleep table-note" role="status">
                <button class="no-chat-line" type="button" aria-haspopup="dialog" onClick={onOpen}>
                    <span class="no-chat" aria-hidden="true" />
                    {words.noChat}
                </button>
            </p>
        );
    }

    return null;
}

/** What the page says of the chat at the table: one opening, starting again, or waiting to, for a new game too; nothing else. */
export function chatState(table: TableShown, name: string, text: Text): string | undefined
{
    const words = text.table;

    if (table.waiting !== undefined) {
        return table.waiting === "new-game" ? words.newGameWaiting(name) : words.waiting(name);
    }

    return table.opening === "chat" ? words.opening : table.opening === "again" ? words.again(name) : table.opening === "restart" ? words.restart : undefined;
}

const hostTitles: Readonly<Record<string, string>> = { claude: "Claude Code", codex: "Codex" };

/** The ↻ of a chat that starts again. */
const restartIcon = (
    <svg class="icon in-use" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4" />
    </svg>
);

/** The window's form, made again at each opening with the host at the table selected, else the first. */
function ChatForm({ review, table, settings, onChange, name, onClose, text }: {
    review: boolean;
    table: TableShown;
    settings: Settings;
    onChange: (settings: Settings) => void;
    name: string;
    onClose: () => void;
    text: Text;
})
{
    const words = text.table;
    const installed = offeredHosts(table);
    const [selected, setSelected] = useState(() => firstHost(table));
    const [sending, setSending] = useState(false);
    const [failed, setFailed] = useState(false);
    // The host at the table may come or go while the window is open: the selection follows it only if it was on none offered.
    const host = installed.find((one) => one.name === selected) ?? installed.find((one) => one.name === firstHost(table));
    useEffect(() => setFailed(false), [selected]);
    const action = chatAction(table, host, settings, review);
    // A chat opened by hand is the player's: Chesspal cannot start it again, so the button only closes, and the note says why.
    const byHand = table.chat && !table.held;
    const busy = table.opening !== undefined || table.waiting !== undefined;
    const chooseNote = review ? words.reviewChoose : words.choose;
    const note = installed.length === 0 ? words.install(name) : busy ? chatState(table, name, text) ?? chooseNote : byHand ? words.byHand(name) : table.chat ? words.restartHint : chooseNote;
    // What the chat held started with, marked among the choices of its host: "" for the host's own.
    const startedWith = (kind: "model" | "effort"): string | undefined => (table.held && table.host === host?.name ? table.started?.[kind] ?? "" : undefined);

    const submit = async (event: Event): Promise<void> => {
        event.preventDefault();

        if (action === "close" || host === undefined) {
            onClose();
            return;
        }

        setSending(true);
        setFailed(false);
        const done = table.chat ? await restartChat(host.name) : await openChat(host.name);
        setSending(false);

        if (done) {
            onClose();
        } else {
            setFailed(true);
        }
    };

    return (
        <form class="profile-form chat-window" onSubmit={(event) => void submit(event)} onKeyDown={submitOnEnter}>
            <p class="note">{note}</p>
            {installed.length === 0 ? null : (
                <fieldset>
                    <legend>{words.chat}</legend>
                    <div class="chat-hosts">
                        {installed.map((one) => {
                            const atTable = table.chat && table.host === one.name;
                            return (
                                <label class="level" key={one.name}>
                                    <input type="radio" name="chat-host" checked={one.name === host?.name} onChange={() => setSelected(one.name)} autofocus={one.name === host?.name} />
                                    <span>
                                        <b>{hostTitles[one.name] ?? one.name}</b>
                                        {atTable ? <span class="at-table" title={words.atTable} role="img" aria-label={words.atTable}>{checkIcon}</span> : null}
                                    </span>
                                </label>
                            );
                        })}
                    </div>
                </fieldset>
            )}
            {host === undefined ? null : (
                <>
                    <Choices host={host} kind="model" settings={settings} started={startedWith("model")} onChange={onChange} text={text} />
                    <Choices host={host} kind="effort" settings={settings} started={startedWith("effort")} onChange={onChange} text={text} />
                </>
            )}
            <p class="problem chat-state" role="status">{failed ? (table.chat ? words.notRestarted : words.failed) : null}</p>
            <button class={action === "close" ? "start quiet" : "start"} type="submit" disabled={sending} aria-busy={sending}>
                {buttonWords(action, host, text)}
            </button>
            {table.chat || host === undefined ? null : (
                <p class="chat-command">
                    {words.typeIt} <code>{host.command}</code>
                </p>
            )}
        </form>
    );
}

/** Enter on a choice presses the button, the window's default action, as it would in a text field: the browser does not for radios. */
function submitOnEnter(event: KeyboardEvent): void
{
    if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
        event.preventDefault();
        (event.currentTarget as HTMLFormElement).requestSubmit();
    }
}

/** The button's words: what it does, with the host selected; Close when it only closes. */
function buttonWords(action: ChatAction, host: ChatHost | undefined, text: Text): string
{
    if (action === "close" || host === undefined) {
        return text.close;
    }

    return text.table.act[action](hostTitles[host.name] ?? host.name);
}

/**
 * A host's model or effort as a row of choices: the dash keeps the host's own, as its title says; a choice it no longer offers shows as the dash. The one
 * the chat at the table `started` with bears a dot.
 */
function Choices({ host, kind, settings, started, onChange, text }: {
    host: ChatHost;
    kind: "model" | "effort";
    settings: Settings;
    started: string | undefined;
    onChange: (settings: Settings) => void;
    text: Text;
})
{
    const key = choiceKeys[host.name as keyof typeof choiceKeys][kind];
    const offered = kind === "model" ? host.models : host.efforts;
    const value = chosen(host, kind, settings);
    const own = text.table.asHost(hostTitles[host.name] ?? host.name);

    if (offered.length === 0) {
        return null;
    }

    return (
        <fieldset>
            <legend>{text.table[kind]}</legend>
            <div class="chat-choices">
                {["", ...offered].map((one) => {
                    const words = (one === "" ? own : one) + (one === started ? ` · ${text.table.atTable}` : "");
                    return (
                        <label class={one === started ? "level started" : "level"} key={one} title={words}>
                            <input type="radio" name={`chat-${kind}`} checked={value === one} onChange={() => onChange({ ...settings, [key]: one })} aria-label={words} />
                            <span>{one === "" ? "—" : shortName(one)}</span>
                        </label>
                    );
                })}
            </div>
        </fieldset>
    );
}

// Codex's models without the "gpt-" they all start with, so the choice stays narrow; the title keeps the whole name.
function shortName(value: string): string
{
    return value.replace(/^gpt-/, "");
}

/** Asks the table to open a terminal with a chat in the host: whether it did. */
function openChat(host: string): Promise<boolean>
{
    return asked("/api/table/chat", { host }, (answer) => answer.opened === true);
}

/** Asks the table to start at once the chat or the new game that waits, cutting the chat's answer, or to let the request go. */
function endWaiting(now: boolean): Promise<boolean>
{
    return asked("/api/table/waiting", { now }, () => true);
}

/** Asks the table to start its chat again with the host, at once or once it has ended its answer: whether it took the request. */
function restartChat(host: string): Promise<boolean>
{
    return asked("/api/table/restart", { host }, (answer) => answer.restarting === true || answer.waiting === true);
}

async function asked(path: string, body: object, done: (answer: Record<string, unknown>) => boolean): Promise<boolean>
{
    try {
        const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        return response.ok && done((await response.json()) as Record<string, unknown>);
    } catch {
        return false;
    }
}
