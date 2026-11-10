// The table with no chat at it (D-104): a button for each host installed, which opens a terminal with a chat at the table, the model and effort it plays
// with beside it, kept in the profile, and the command to type in a terminal instead.
import { useState } from "preact/hooks";
import type { ChatHost, TableShown } from "../app/served.ts";
import type { Settings } from "../profile/settings.ts";
import type { Text } from "../text.ts";

/** Where the asleep note stands while no chat is at the table: the hosts that open one, their choices, and the command to type. */
export function ChatOpener({ table, settings, onChange, name, text }: { table: TableShown; settings: Settings; onChange: (settings: Settings) => void; name: string; text: Text; })
{
    const [sending, setSending] = useState(false);
    const [failed, setFailed] = useState(false);
    const words = text.table;
    const installed = table.hosts.filter((host) => host.installed && host.name in choiceKeys);
    const busy = sending || table.opening !== undefined;

    const open = async (host: string): Promise<void> => {
        setSending(true);
        setFailed(false);
        const opened = await openChat(host);
        setSending(false);
        setFailed(!opened);
    };

    // The chat started again for a new game needs nothing of the player.
    if (table.opening === "again") {
        return <p class="asleep" role="status">{words.again(name)}</p>;
    }

    if (installed.length === 0) {
        return <p class="asleep" role="status">{words.install(name)}</p>;
    }

    // The state stays in the page, empty when there is none, so a screen reader hears it change.
    return (
        <section class="asleep opener" aria-label={words.label}>
            <p>{words.noChat(name)}</p>
            {installed.map((host) => (
                <div class="opener-host" key={host.name}>
                    <button type="button" class="command primary" disabled={busy} onClick={() => void open(host.name)}>{hostTitles[host.name] ?? host.name}</button>
                    <Choice host={host} kind="model" settings={settings} onChange={onChange} text={text} />
                    <Choice host={host} kind="effort" settings={settings} onChange={onChange} text={text} />
                </div>
            ))}
            <p class="opener-state" role="status">{busy ? words.opening : failed ? words.failed : null}</p>
            <p class="opener-command">
                {words.typeIt} {installed.map((host, index) => (
                    <span key={host.name}>
                        {index === 0 ? "" : " · "}
                        <code>{host.command}</code>
                    </span>
                ))}
            </p>
        </section>
    );
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
        return null;
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

// Codex's models without the "gpt-" they all start with, so the choice fits beside the button in the column; the title keeps the whole name.
function shortName(value: string): string
{
    return value.replace(/^gpt-/, "");
}

/** Asks the table to open a terminal with a chat in the host: whether it did. */
async function openChat(host: string): Promise<boolean>
{
    try {
        const response = await fetch("/api/table/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host }) });
        return response.ok && ((await response.json()) as { opened?: unknown; }).opened === true;
    } catch {
        return false;
    }
}
