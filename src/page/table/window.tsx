// The chat at the table in a window of its own, opened from the AI's name as «Chi gioca?» is from the player's (D-107): a row for each host installed,
// with its model and effort kept in the profile and the tick on the one at the table, a ↻ once they differ from the ones it started with; a row opens a
// chat with no chat at the table, and starts the one chesspal play holds again, clean, in the same terminal, once it has ended its answer, or at once if
// the player says so where the page says it waits.
import type { VNode } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { ChatHost, TableShown } from "../app/served.ts";
import { Dialog } from "../dialogs/dialog.tsx";
import { checkIcon } from "../dialogs/profiles.tsx";
import type { Settings } from "../profile/settings.ts";
import type { Text } from "../text.ts";

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
    const [sending, setSending] = useState(false);
    const [failed, setFailed] = useState(false);
    useEffect(() => setFailed(false), [open]);
    const words = text.table;
    const installed = table.hosts.filter((host) => host.installed && host.name in choiceKeys);
    // A chat opened by hand is the player's: Chesspal cannot start it again. Its rows stay readable, as the ones waiting.
    const byHand = table.chat && !table.held;
    const busy = sending || table.opening !== undefined || table.waiting !== undefined;

    const choose = async (host: string): Promise<void> => {
        setSending(true);
        setFailed(false);
        const done = table.chat ? await restartChat(host) : await openChat(host);
        setSending(false);

        if (done) {
            onClose();
        } else {
            setFailed(true);
        }
    };

    // While a chat opens or waits to start again, the rows wait too, and the note says why.
    const chooseNote = review ? words.reviewChoose : words.choose;
    const note = installed.length === 0
        ? words.install(name)
        : busy
        ? chatState(table, name, text) ?? chooseNote
        : byHand
        ? words.byHand(name)
        : table.chat
        ? words.restartHint
        : chooseNote;
    const offersChoices = installed.some((host) => host.models.length > 0 || host.efforts.length > 0);
    // The chat at the table started with other choices than the ones kept now: its row starts it again with these, else it only closes the window.
    const started = table.held ? table.started : undefined;
    const changed = (host: ChatHost): boolean => started !== undefined && (chosen(host, "model", settings) !== (started.model ?? "") || chosen(host, "effort", settings) !== (started.effort ?? ""));
    return (
        <Dialog open={open} title={review ? words.reviewTitle : words.title} onClose={onClose} text={text}>
            <p class="note">{note}</p>
            <div class="chat-hosts" role="group" aria-label={review ? words.reviewTitle : words.title}>
                {offersChoices
                    ? (
                        <div class="chat-head" aria-hidden="true">
                            <span />
                            <span>{words.model}</span>
                            <span>{words.effort}</span>
                        </div>
                    )
                    : null}
                {installed.map((host) => {
                    const atTable = table.chat && table.host === host.name;
                    const off = busy || byHand;
                    const again = !atTable || changed(host);
                    return (
                        <div class="chat-host" key={host.name}>
                            <button
                                class="choice"
                                type="button"
                                title={atTable && again ? words.restartChanged : undefined}
                                aria-current={atTable ? "true" : undefined}
                                aria-disabled={off}
                                onClick={off ? undefined : again ? () => void choose(host.name) : onClose}
                            >
                                <span>{hostTitles[host.name] ?? host.name}</span>
                                {atTable ? (again ? restartIcon : checkIcon) : null}
                            </button>
                            <Choice host={host} kind="model" settings={settings} onChange={onChange} text={text} />
                            <Choice host={host} kind="effort" settings={settings} onChange={onChange} text={text} />
                        </div>
                    );
                })}
            </div>
            <p class="chat-state" role="status">{failed ? (table.chat ? words.notRestarted : words.failed) : null}</p>
            {table.chat || installed.length === 0 ? null : (
                <p class="chat-command">
                    {words.typeIt} {installed.map((host, index) => (
                        <span key={host.name}>
                            {/* The dot goes to the next line with the command after it */}
                            {index === 0 ? "" : " · "}
                            <code>{host.command}</code>
                        </span>
                    ))}
                </p>
            )}
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

// The settings that keep each host's choice.
const choiceKeys = {
    claude: { model: "claudeModel", effort: "claudeEffort" },
    codex: { model: "codexModel", effort: "codexEffort" },
} as const satisfies Record<string, Record<"model" | "effort", keyof Settings>>;

/** The ↻ of a chat that starts again. */
const restartIcon = (
    <svg class="icon in-use" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4" />
    </svg>
);

/** A host's model or effort as the settings keep it: "" for the host's own, and for a choice it no longer offers. */
function chosen(host: ChatHost, kind: "model" | "effort", settings: Settings): string
{
    const key = choiceKeys[host.name as keyof typeof choiceKeys][kind];
    const offered = kind === "model" ? host.models : host.efforts;
    return offered.includes(settings[key]) ? settings[key] : "";
}

/** A host's model or effort: a dash keeps the host's own; a choice it no longer offers shows as the dash. Its title says what it stands at, the dash too. */
function Choice({ host, kind, settings, onChange, text }: { host: ChatHost; kind: "model" | "effort"; settings: Settings; onChange: (settings: Settings) => void; text: Text; })
{
    const key = choiceKeys[host.name as keyof typeof choiceKeys][kind];
    const offered = kind === "model" ? host.models : host.efforts;
    const value = chosen(host, kind, settings);
    const title = hostTitles[host.name] ?? host.name;

    if (offered.length === 0) {
        return <span />;
    }

    return (
        <select
            aria-label={`${text.table[kind]}, ${title}`}
            title={`${text.table[kind]}: ${value === "" ? text.table.asHost(title) : value}`}
            value={value}
            onChange={(event) => onChange({ ...settings, [key]: event.currentTarget.value })}
        >
            <option value="">—</option>
            {offered.map((one) => <option key={one} value={one}>{shortName(one)}</option>)}
        </select>
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
