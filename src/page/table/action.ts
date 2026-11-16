// What the chat's window does with its one button: open a chat, start the one held again, or switch its host, by the table and the choices.
import type { Settings } from "../profile/settings.ts";

/** The button's action: a chat opened to play or to review a game, the chat held started again, or in another host. */
export type ChatAction = "open" | "review" | "restart" | "switch";

/**
 * What the button reads of a host the table offers (`ChatHost` of the page): its name, whether it is installed, its models and efforts and the middle
 * ones; where its models differ, the efforts of each, none for a model without.
 */
export interface HostChoices
{
    readonly name: string;
    readonly installed: boolean;
    readonly models: readonly string[];
    readonly efforts: readonly string[];
    readonly model: string;
    readonly effort: string;
    readonly modelEfforts?: Readonly<Record<string, readonly string[]>>;
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
    antigravity: { model: "antigravityModel", effort: "antigravityEffort" },
    opencode: { model: "opencodeModel", effort: "opencodeEffort" },
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

/** The efforts a host offers for one of its models: none for a model that has no effort to choose. */
export function effortsOf(host: HostChoices, model: string): readonly string[]
{
    return host.modelEfforts?.[model] ?? host.efforts;
}

/**
 * A host's model or effort as the settings keep it: the host's middle one for none, and for a choice it no longer offers; the effort among the chosen
 * model's, none for a model without.
 */
export function chosen(host: HostChoices, kind: "model" | "effort", settings: Settings): string | undefined
{
    const keys = choiceKeys[host.name as keyof typeof choiceKeys];
    return offered(host, settings[keys.model], settings[keys.effort])[kind];
}

/** What the chat held started with: the host's middle one where the table does not say, or says one it no longer offers. */
export function startedWith(table: ChatTable, host: HostChoices, kind: "model" | "effort"): string | undefined
{
    return offered(host, table.started?.model, table.started?.effort)[kind];
}

/**
 * What the button does with the host selected, none without one, or for one that offers no model, as OpenCode before the table finds one: with no chat,
 * open one, to review the game in `review`; else start the chat again, in another host when it is not the one at the table.
 */
export function chatAction(table: ChatTable, host: HostChoices | undefined, review: boolean): ChatAction | undefined
{
    if (host === undefined || host.models.length === 0) {
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

/**
 * What stops a model of OpenCode's that Ollama plays (D-117): `off` when Ollama does not answer, else the context it runs the model with when too small for
 * Chesspal's instructions, in tokens; nothing for a model of another provider's, or with no word from Ollama.
 */
export function ollamaTroubleOf(ollama: { readonly answering: boolean; readonly contexts: Readonly<Record<string, number>>; } | undefined, model: string | undefined): "off" | number | undefined
{
    if (ollama === undefined || model?.startsWith("ollama/") !== true) {
        return undefined;
    }

    if (!ollama.answering) {
        return "off";
    }

    const context = ollama.contexts[model.slice("ollama/".length)];
    return context !== undefined && context < smallestContext ? context : undefined;
}

// A chat's first request is about 10k tokens: under 32k the model loses Chesspal's instructions as the game goes on.
const smallestContext = 32_768;

// The choice kept to what the host offers, as the table keeps it when it starts the chat.
function offered(host: HostChoices, model: string | undefined, effort: string | undefined): { model: string; effort?: string; }
{
    const kept = model !== undefined && host.models.includes(model) ? model : host.model;
    const efforts = effortsOf(host, kept);
    const middle = efforts.includes(host.effort) ? host.effort : efforts[Math.floor((efforts.length - 1) / 2)];
    const keptEffort = effort !== undefined && efforts.includes(effort) ? effort : middle;
    return keptEffort === undefined ? { model: kept } : { model: kept, effort: keptEffort };
}
