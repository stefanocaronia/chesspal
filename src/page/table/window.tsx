// The chat at the table in a window of its own, opened from the AI's name as «Chi gioca?» is from the player's (D-107): a row for each host installed,
// with its model and effort kept in the profile and the tick on the one at the table; a row opens a chat with no chat at the table, and starts the one
// chesspal play holds again, clean, in the same terminal, once it has ended its answer.
import { useEffect, useState } from "preact/hooks";
import type { ChatHost, TableShown } from "../app/served.ts";
import { Dialog } from "../dialogs/dialog.tsx";
import { checkIcon } from "../dialogs/profiles.tsx";
import type { Settings } from "../profile/settings.ts";
import type { Text } from "../text.ts";

/** The chat's window: closed once a chat opens or starts again, the page then saying where it stands. */
export function ChatDialog({ open, table, settings, onChange, name, onClose, text }: {
    open: boolean;
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
    const busy = sending || table.opening !== undefined || table.waiting === true;

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
    const note = installed.length === 0
        ? words.install(name)
        : busy
        ? chatState(table, name, text) ?? words.choose
        : byHand
        ? words.byHand(name)
        : table.chat
        ? words.restartHint
        : words.choose;
    const offersChoices = installed.some((host) => host.models.length > 0 || host.efforts.length > 0);
    return (
        <Dialog open={open} title={words.title} onClose={onClose} text={text}>
            <p class="note">{note}</p>
            <div class="chat-hosts" role="group" aria-label={words.title}>
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
                    return (
                        <div class="chat-host" key={host.name}>
                            <button class="choice" type="button" aria-current={atTable ? "true" : undefined} aria-disabled={off} onClick={off ? undefined : () => void choose(host.name)}>
                                <span>{hostTitles[host.name] ?? host.name}</span>
                                {atTable ? checkIcon : null}
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

/** What the page says of the chat at the table where the asleep note stands: one opening, starting again, or waiting to; nothing else. */
export function chatState(table: TableShown, name: string, text: Text): string | undefined
{
    const words = text.table;

    if (table.waiting === true) {
        return words.waiting(name);
    }

    return table.opening === "chat" ? words.opening : table.opening === "again" ? words.again(name) : table.opening === "restart" ? words.restart : undefined;
}

const hostTitles: Readonly<Record<string, string>> = { claude: "Claude Code", codex: "Codex" };

// The settings that keep each host's choice.
const choiceKeys = {
    claude: { model: "claudeModel", effort: "claudeEffort" },
    codex: { model: "codexModel", effort: "codexEffort" },
} as const satisfies Record<string, Record<"model" | "effort", keyof Settings>>;

/** A host's model or effort: a dash keeps the host's own; a choice it no longer offers shows as the dash. Its title says what it stands at, the dash too. */
function Choice({ host, kind, settings, onChange, text }: { host: ChatHost; kind: "model" | "effort"; settings: Settings; onChange: (settings: Settings) => void; text: Text; })
{
    const key = choiceKeys[host.name as keyof typeof choiceKeys][kind];
    const offered = kind === "model" ? host.models : host.efforts;
    const chosen = offered.includes(settings[key]) ? settings[key] : "";
    const title = hostTitles[host.name] ?? host.name;

    if (offered.length === 0) {
        return <span />;
    }

    return (
        <select
            aria-label={`${text.table[kind]}, ${title}`}
            title={`${text.table[kind]}: ${chosen === "" ? text.table.asHost(title) : chosen}`}
            value={chosen}
            onChange={(event) => onChange({ ...settings, [key]: event.currentTarget.value })}
        >
            <option value="">—</option>
            {offered.map((value) => <option key={value} value={value}>{shortName(value)}</option>)}
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
    return asked("/api/table/chat", host, (answer) => answer.opened === true);
}

/** Asks the table to start its chat again with the host, at once or once it has ended its answer: whether it took the request. */
function restartChat(host: string): Promise<boolean>
{
    return asked("/api/table/restart", host, (answer) => answer.restarting === true || answer.waiting === true);
}

async function asked(path: string, host: string, done: (answer: Record<string, unknown>) => boolean): Promise<boolean>
{
    try {
        const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host }) });
        return response.ok && done((await response.json()) as Record<string, unknown>);
    } catch {
        return false;
    }
}
