// What the chat's window does with its one button: open a chat, start the one held again, or switch its host, by the table and the choices.
import type { Settings } from "../profile/settings.ts";

/** The button's action: a chat opened to play or to review a game, the chat held started again, or in another host. */
export type ChatAction = "open" | "review" | "restart" | "switch";

/** What the button reads of a host the table offers (`ChatHost` of the page): its name, whether it is installed, its models and efforts and the middle ones. */
export interface HostChoices
{
    readonly name: string;
    readonly installed: boolean;
    readonly models: readonly string[];
    readonly efforts: readonly string[];
    readonly model: string;
    readonly effort: string;
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

/** The host selected when the window opens: the one at the table, else the last the button used, else the first offered. */
export function firstHost(table: ChatTable, settings: Settings): string | undefined
{
    const offered = offeredHosts(table);
    const atTable = offered.find((host) => table.chat && host.name === table.host);
    return (atTable ?? offered.find((host) => host.name === settings.chatHost) ?? offered[0])?.name;
}

/** A host's model or effort as the settings keep it: the host's middle one for none, and for a choice it no longer offers. */
export function chosen(host: HostChoices, kind: "model" | "effort", settings: Settings): string
{
    const key = choiceKeys[host.name as keyof typeof choiceKeys][kind];
    return offeredOr(host, kind, settings[key]);
}

/** What the chat held started with: the host's middle one where the table does not say, or says one it no longer offers. */
export function startedWith(table: ChatTable, host: HostChoices, kind: "model" | "effort"): string
{
    return offeredOr(host, kind, table.started?.[kind]);
}

/** What the button does with the host selected, none without one: with no chat, open one, to review the game in `review`; else start the chat again, in another host when it is not the one at the table. */
export function chatAction(table: ChatTable, host: HostChoices | undefined, review: boolean): ChatAction | undefined
{
    if (host === undefined) {
        return undefined;
    }

    if (!table.chat) {
        return review ? "review" : "open";
    }

    return table.host === host.name ? "restart" : "switch";
}

/** Whether the button can do its action now: not while a chat opens or waits, nor on a chat opened by hand, which is the player's. */
export function canAct(table: ChatTable): boolean
{
    return table.opening === undefined && table.waiting === undefined && (!table.chat || table.held);
}

function offeredOr(host: HostChoices, kind: "model" | "effort", value: string | undefined): string
{
    const offered = kind === "model" ? host.models : host.efforts;
    return value !== undefined && offered.includes(value) ? value : host[kind];
}
