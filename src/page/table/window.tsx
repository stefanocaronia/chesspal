// The chat at the table in a window of its own, opened from the AI's name as «Chi gioca?» is from the player's (D-107), laid out as the new game's: a card
// for each host installed, the tick on the one at the table; the selected one's model and effort, kept in the profile; and one button that says what it
// does: open a chat, start the one chesspal play holds again, clean, once it has ended its answer, or in another host; the × closes it. Beside it, what
// the page shows of the chat at the table: its note, and the mark that stops a chat the table drives (D-125).
import type { VNode } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { ChatHost, TableShown } from "../app/served.ts";
import { Dialog } from "../dialogs/dialog.tsx";
import { checkIcon } from "../dialogs/profiles.tsx";
import type { Settings } from "../profile/settings.ts";
import type { Text } from "../text.ts";
import { canAct, chatAction, choiceKeys, chosen, effortsOf, firstHost, offeredHosts, ollamaTroubleOf, startedWith } from "./action.ts";
import { drivenTitle, failureCodes, type FailureSaid, opensInPage, type Stalled } from "./driven.ts";

/**
 * The chat's window: `onStarted` once a chat opens or starts again, the page then saying where it stands; `onClose` when the player closes it without;
 * `review` when it opened to have a game analysed, `onKeep` to have the chat held review it as it is: whether the table took the request.
 */
export function ChatDialog({ open, review = false, onKeep, table, settings, onChange, name, onStarted, onClose, text }: {
    open: boolean;
    review?: boolean;
    onKeep?: () => Promise<boolean>;
    table: TableShown;
    settings: Settings;
    onChange: (settings: Settings) => void;
    name: string;
    onStarted: () => void;
    onClose: () => void;
    text: Text;
})
{
    return (
        <Dialog open={open} title={review ? text.table.reviewTitle : text.table.title} onClose={onClose} text={text}>
            <ChatForm review={review} {...(onKeep === undefined ? {} : { onKeep })} table={table} settings={settings} onChange={onChange} name={name} onStarted={onStarted} text={text} />
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
 * The mark that stops the AI, while a turn of the chat the table drives runs: beside the AI's clock, over the box in analysis, and under the tab of the
 * talk folded away. The place of Esc in a terminal. The table tells every page what came of it; a turn that ended meanwhile leaves nothing to stop.
 */
export function StopButton({ name, text }: { name: string; text: Text; })
{
    const [sending, setSending] = useState(false);
    const title = text.table.inPage.stop(name);

    const stop = async (): Promise<void> => {
        setSending(true);
        await asked("/api/table/stop", {}, (answer) => answer.stopping === true);
        setSending(false);
    };

    return (
        <button class="icon-button stop-ai" type="button" title={title} aria-label={title} disabled={sending} onClick={() => void stop()}>
            <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="5.5" y="5.5" width="13" height="13" rx="2" />
            </svg>
        </button>
    );
}

/**
 * What the note says of a chat the table drives (D-125): its failure still to say, with the × that closes it; whether it does not listen; and the AI at
 * rest on its move, stopped by the player or with its turns ended without moving.
 */
export interface DrivenNotes
{
    readonly failure?: FailureSaid;
    readonly onClose?: () => void;
    readonly asleep: boolean;
    readonly stalled?: Stalled;
}

/**
 * The note on the chat at the table where the asleep note stands: one opening or starting again; one waiting to, or a new game waiting for it, with a ↻
 * that starts it at once and a × that lets the request go; in a game with no chat at the table, a line that opens the chat's window. Of a chat the table
 * `driven`: its failure, in the host's words under the page's own, once; a line that opens the chat's window when it does not listen; and what to do with
 * the AI at rest on its move. None otherwise.
 */
export function tableNote({ table, name, inGame, driven, onOpen, text }: { table: TableShown; name: string; inGame: boolean; driven?: DrivenNotes; onOpen: () => void; text: Text; }): VNode | null
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
                    {closeIcon}
                </button>
            </p>
        );
    }

    // A chat of OpenCode's that plays with a model of Ollama's is told when Ollama does not answer, before what it is doing; when its context is too
    // small, once it is doing nothing else worth saying (D-117).
    const trouble = table.chat && table.host === "opencode" ? ollamaTroubleOf(table.ollama, table.started?.model) : undefined;

    if (trouble === "off") {
        return <p class="asleep" role="status">{words.ollamaOff(name)}</p>;
    }

    if (state !== undefined) {
        return <p class="asleep" role="status">{state}</p>;
    }

    if (driven?.failure !== undefined) {
        const { kind, code, why, host } = driven.failure;
        return (
            <p class="asleep table-note chat-failed" role="alert">
                <span>
                    {kind === "closed" ? words.inPage.closed[code](host) : words.inPage.turnFailed[code](name, host)}
                    <code class="host-words" lang="en">{why}</code>
                    {kind === "closed"
                        ? (
                            <button class="no-chat-line" type="button" aria-haspopup="dialog" onClick={onOpen}>
                                <span class="no-chat" aria-hidden="true" />
                                {words.inPage.reopen}
                            </button>
                        )
                        : null}
                </span>
                <button class="icon-button" type="button" title={text.close} aria-label={text.close} onClick={driven.onClose}>
                    {closeIcon}
                </button>
            </p>
        );
    }

    if (trouble !== undefined) {
        return <p class="asleep" role="status">{words.ollamaContext(Math.round(trouble / 1024))}</p>;
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

    if (driven?.asleep === true) {
        return (
            <p class="asleep table-note" role="status">
                <button class="no-chat-line" type="button" aria-haspopup="dialog" onClick={onOpen}>{words.inPage.asleep(name)}</button>
            </p>
        );
    }

    if (driven?.stalled === "noMove") {
        const [said, restart] = words.inPage.noMove(name);
        return (
            <p class="asleep" role="status">
                {said} <button class="no-chat-line" type="button" aria-haspopup="dialog" onClick={onOpen}>{restart}</button>.
            </p>
        );
    }

    return driven?.stalled === "stopped" ? <p class="asleep" role="status">{words.inPage.stopped(name)}</p> : null;
}

/**
 * What the page says of the chat at the table: one opening, starting again, or waiting to, for a new game too; nothing else. One the table drives has no
 * terminal to send the player to.
 */
export function chatState(table: TableShown, name: string, text: Text): string | undefined
{
    const words = text.table;

    if (table.waiting !== undefined) {
        return table.waiting === "new-game" ? words.newGameWaiting(name) : words.waiting(name);
    }

    const opening = table.openingDriven === true ? words.inPage.opening : words.opening;
    return table.opening === "chat" ? opening : table.opening === "again" ? words.again(name) : table.opening === "restart" ? words.restart : undefined;
}

const hostTitles: Readonly<Record<string, string>> = { claude: "Claude Code", codex: "Codex", antigravity: "Antigravity", opencode: "OpenCode" };

/** The ↻ of a chat that starts again. */
const restartIcon = (
    <svg class="icon in-use" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4" />
    </svg>
);

/** The × that lets a waiting request go, and closes a failure said. */
const closeIcon = (
    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 6L18 18M18 6L6 18" />
    </svg>
);

/** The window's form, made again at each opening with the host at the table selected, else the last the button used, else the first. */
function ChatForm({ review, onKeep, table, settings, onChange, name, onStarted, text }: {
    review: boolean;
    onKeep?: () => Promise<boolean>;
    table: TableShown;
    settings: Settings;
    onChange: (settings: Settings) => void;
    name: string;
    onStarted: () => void;
    text: Text;
})
{
    const words = text.table;
    const installed = offeredHosts(table);
    const [selected, setSelected] = useState(() => firstHost(table, settings));
    const [sending, setSending] = useState(false);
    const [failed, setFailed] = useState(false);
    // The host at the table may come or go while the window is open: the selection follows it only if it was on none offered.
    const host = installed.find((one) => one.name === selected) ?? installed.find((one) => one.name === firstHost(table, settings));
    useEffect(() => setFailed(false), [selected]);
    // The window asks whether the chat held reviews a game only when the page gave it the way to keep that chat: else it starts it again, as ever.
    const choosing = review && onKeep !== undefined;
    const chosenAction = chatAction(table, host, review, settings);
    const action = chosenAction === "keep" && !choosing ? "restart" : chosenAction;
    // A chat opened by hand is the player's: Chesspal cannot start it again, so the button keeps its word, disabled, and the note says why.
    const byHand = table.chat && !table.held;
    const busy = table.opening !== undefined || table.waiting !== undefined;
    // With the switch on, the host selected may play in the page, with no terminal (D-125): the notes say so, and no command to type is offered instead.
    const inPage = opensInPage(table, settings, host?.name);
    const chooseNote = review ? (inPage ? words.inPage.reviewChoose(drivenTitle(host?.name)) : words.reviewChoose) : inPage ? words.inPage.choose(drivenTitle(host?.name)) : words.choose;
    const chatNote = choosing ? words.reviewKeep(name) : table.driven === true ? words.inPage.restartHint : words.restartHint;
    const state = busy ? chatState(table, name, text) : undefined;
    const note = installed.length === 0 ? words.install(name) : busy ? state ?? chooseNote : byHand ? words.byHand(name) : table.chat ? chatNote : chooseNote;
    const restarted = table.chat && action !== "keep";
    // Why the chat in the page did not open: the page's line for the table's code, and the host's words under it.
    const notOpened = failed && inPage && !table.chat ? table.failed : undefined;
    const notOpenedCode = failureCodes.find((code) => code === notOpened?.code) ?? "other";
    const unopened = notOpened === undefined || notOpenedCode === "other" ? words.inPage.notOpened : words.inPage.closed[notOpenedCode](drivenTitle(notOpened.host ?? host?.name));
    const problem = !failed ? null : restarted ? (inPage ? words.inPage.notRestarted : words.notRestarted) : inPage ? unopened : words.failed;
    const why = notOpened?.why;
    // What the chat held started with, marked among the choices of its host.
    const started = (kind: "model" | "effort"): string | undefined => (host !== undefined && table.held && table.host === host.name ? startedWith(table, host, kind) : undefined);
    // OpenCode with a model of Ollama's says what would stop it before the chat starts (D-117).
    const trouble = host?.name === "opencode" ? ollamaTrouble(table, chosen(host, "model", settings), words.ollamaOffToStart, text) : undefined;

    const submit = async (event: Event): Promise<void> => {
        event.preventDefault();

        if (action === undefined || host === undefined || !canAct(table)) {
            return;
        }

        setSending(true);
        setFailed(false);

        if (action === "keep") {
            const kept = await onKeep?.() ?? false;
            setSending(false);

            if (kept) {
                onStarted();
            } else {
                setFailed(true);
            }

            return;
        }

        const done = table.chat ? await restartChat(host.name) : await openChat(host.name, review);
        setSending(false);

        if (done) {
            onChange({ ...settings, chatHost: host.name });
            onStarted();
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
                    <Choices host={host} kind="model" settings={settings} started={started("model")} onChange={onChange} text={text} />
                    <Choices host={host} kind="effort" settings={settings} started={started("effort")} onChange={onChange} text={text} />
                    {host.models.length === 0 ? <p class="note">{words.noModels(hostTitles[host.name] ?? host.name)}</p> : null}
                    {trouble === undefined ? null : <p class="problem">{trouble}</p>}
                </>
            )}
            <p class="problem chat-state" role="status">
                {problem}
                {why === undefined ? null : <code class="host-words" lang="en">{why}</code>}
            </p>
            {action === undefined || host === undefined ? null : (
                <button class="start" type="submit" disabled={sending || !canAct(table)} aria-busy={sending}>
                    {text.table.act[choosing ? "review" : action](hostTitles[host.name] ?? host.name)}
                </button>
            )}
            {table.chat || inPage || action === undefined || host === undefined ? null : (
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

/** A host's model or effort as a row of choices, its middle one chosen until the player chooses; the one the chat at the table `started` with bears a dot. */
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
    // The efforts of the model chosen: none, and no row, for a model without.
    const offered = kind === "model" ? host.models : effortsOf(host, chosen(host, "model", settings) ?? host.model);
    const value = chosen(host, kind, settings);

    if (offered.length === 0) {
        return null;
    }

    return (
        <fieldset>
            <legend>{text.table[kind]}</legend>
            <div class="chat-choices">
                {offered.map((one) => {
                    const words = one + (one === started ? ` · ${text.table.atTable}` : "");
                    return (
                        <label class={one === started ? "level started" : "level"} key={one} title={words}>
                            <input type="radio" name={`chat-${kind}`} checked={value === one} onChange={() => onChange({ ...settings, [key]: one })} aria-label={words} />
                            <span>{host.name === "codex" ? shortName(one) : one}</span>
                        </label>
                    );
                })}
            </div>
        </fieldset>
    );
}

// Codex's models without the "gpt-" they all start with, so the choice stays narrow; the title keeps the whole name. Another host's keep it: Antigravity's
// GPT-OSS would read as "oss".
function shortName(value: string): string
{
    return value.replace(/^gpt-/, "");
}

/** Asks the table to open a chat in the host, to review the game in analysis or else to play: whether it did. */
function openChat(host: string, review: boolean): Promise<boolean>
{
    return asked("/api/table/chat", { host, review }, (answer) => answer.opened === true);
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

// What stops a model of Ollama's from playing, in words: `off` when Ollama does not answer.
function ollamaTrouble(table: TableShown, model: string | undefined, off: string, text: Text): string | undefined
{
    const trouble = ollamaTroubleOf(table.ollama, model);
    return trouble === undefined ? undefined : trouble === "off" ? off : text.table.ollamaContext(Math.round(trouble / 1024));
}
