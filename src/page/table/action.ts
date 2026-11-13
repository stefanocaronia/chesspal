// What the chat's window does with its one button: open a chat, start the one held again, switch its host, or only close, by the table and the choices.
import type { Settings } from "../profile/settings.ts";

/** The button's action: a chat opened to play or to review a game, the chat held started again or in another host, or the window closed. */
export type ChatAction = "open" | "review" | "restart" | "switch" | "close";

/** What the button reads of a host the table offers (`ChatHost` of the page): its name, whether it is installed, and the models and efforts it offers. */
export interface HostChoices
{
    readonly name: string;
    readonly installed: boolean;
    readonly models: readonly string[];
    readonly efforts: readonly string[];
}

/** What the button reads of the table (`TableShown` of the page), kept apart so that it is tested without the page around it. */
export interface ChatTable<Host extends HostChoices = HostChoices>
{
    readonly chat: boolean;
    readonly host?: string;
    readonly held: boolean;
    readonly started?: { readonly model?: string; readonly effort?: string; };
    readonly hosts: readonly Host[];
    readonly opening?: string;
    readonly waiting?: string;
}

/** The settings that keep each host's choice. */
export const choiceKeys = {
    claude: { model: "claudeModel", effort: "claudeEffort" },
    codex: { model: "codexModel", effort: "codexEffort" },
} as const satisfies Record<string, Record<"model" | "effort", keyof Settings>>;

/** The hosts the window offers: those installed whose choices the settings keep. */
export function offeredHosts<Host extends HostChoices>(table: ChatTable<Host>): Host[]
{
    return table.hosts.filter((host) => host.installed && host.name in choiceKeys);
}

/** The host selected when the window opens: the one at the table, else the first offered. */
export function firstHost(table: ChatTable): string | undefined
{
    const offered = offeredHosts(table);
    return offered.find((host) => table.chat && host.name === table.host)?.name ?? offered[0]?.name;
}

/** A host's model or effort as the settings keep it: "" for the host's own, and for a choice it no longer offers. */
export function chosen(host: HostChoices, kind: "model" | "effort", settings: Settings): string
{
    const key = choiceKeys[host.name as keyof typeof choiceKeys][kind];
    const offered = kind === "model" ? host.models : host.efforts;
    return offered.includes(settings[key]) ? settings[key] : "";
}

/**
 * What the button does with the host selected: with no chat, open one, to review the game in `review`; with the chat chesspal play holds, start it
 * again when its host or choices differ from the ones it started with; else, and while a chat opens or waits, or one opened by hand is there, close.
 */
export function chatAction(table: ChatTable, host: HostChoices | undefined, settings: Settings, review: boolean): ChatAction
{
    if (host === undefined || table.opening !== undefined || table.waiting !== undefined) {
        return "close";
    }

    if (!table.chat) {
        return review ? "review" : "open";
    }

    if (!table.held) {
        return "close";
    }

    if (table.host !== host.name) {
        return "switch";
    }

    const started = table.started ?? {};
    const changed = chosen(host, "model", settings) !== (started.model ?? "") || chosen(host, "effort", settings) !== (started.effort ?? "");
    return changed ? "restart" : "close";
}
