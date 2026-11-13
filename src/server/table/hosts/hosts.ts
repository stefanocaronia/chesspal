// The AI hosts the table opens a chat in (D-104): Claude Code and Codex, each with the start message, and the model and effort the player chose on the page
// for the profile in use, or each host's middle ones until they choose: the chat never starts with whatever the host was left at.
import { speaksItalian } from "../../../commands/index.ts";

/** The hosts the page offers, by their command's name. */
export const hostNames = ["claude", "codex"] as const;
export type HostName = typeof hostNames[number];

/**
 * The models and efforts the player may choose for a host, as its command line names them: aliases, which follow the host's newest models; and the
 * `model` and `effort` a chat starts with until the player chooses, the middle ones.
 */
export interface HostChoices
{
    readonly models: readonly string[];
    readonly efforts: readonly string[];
    readonly model: string;
    readonly effort: string;
}

/** What the player chose for a host on the page: none of either, or one the host does not offer, is the host's middle one. */
export interface HostChoice
{
    readonly model?: string | undefined;
    readonly effort?: string | undefined;
}

/**
 * Each host's choices, as tried in each (Priya): a value outside them would fail only at the chat's first turn. Claude Code's are its aliases; Codex's, the
 * models a ChatGPT account lists, which change with its releases.
 */
export const hostChoices: Readonly<Record<HostName, HostChoices>> = {
    claude: { models: ["fable", "opus", "sonnet", "haiku"], efforts: ["low", "medium", "high", "xhigh", "max"], model: "sonnet", effort: "medium" },
    codex: { models: ["gpt-6.1-sol", "gpt-6-astra", "gpt-6.1-terra", "gpt-6-luna"], efforts: ["low", "medium", "high", "xhigh", "max"], model: "gpt-6.1-terra", effort: "medium" },
};

/** Whether a word names a host the page offers. */
export function isHostName(name: unknown): name is HostName
{
    return hostNames.includes(name as HostName);
}

/**
 * The message a chat opened by the table starts with, in the player's language: the AI answers it by calling status, as every chat does. A chat opened
 * `toAnalyse` the game the page shows is asked for that: told to play, it opened the New game window over the analysis it had just started.
 */
export function startMessage(language: string | undefined, toAnalyse = false): string
{
    if (toAnalyse) {
        return speaksItalian(language) ? "Analizziamo la partita!" : "Let's analyse the game!";
    }

    return speaksItalian(language) ? "Giochiamo!" : "Let's play!";
}

/**
 * The start message and the choices the host knows: first for Claude Code, whose options may take the word after; last for Codex, where "resume" is no
 * subcommand, kept from its update screen, which an Enter would accept.
 */
export function hostArgs(host: HostName, message: string, choice: HostChoice = {}): string[]
{
    const { model, effort } = offered(host, choice);

    if (host === "claude") {
        return [message, ...(model === undefined ? [] : ["--model", model]), ...(effort === undefined ? [] : ["--effort", effort])];
    }

    return ["-c", "check_for_update_on_startup=false", ...(model === undefined ? [] : ["-m", model]), ...(effort === undefined ? [] : ["-c", `model_reasoning_effort=${effort}`]), message];
}

/** The settings' keys that keep a host's choice in the profile: claudeModel, claudeEffort, codexModel, codexEffort. */
export function choiceKeys(host: HostName): { model: string; effort: string; }
{
    return { model: `${host}Model`, effort: `${host}Effort` };
}

/** A host's choice as the profile's settings keep it: the values the host offers alone, the rest is its middle one. */
export function choiceIn(settings: Readonly<Record<string, unknown>> | undefined, host: HostName): HostChoice
{
    const keys = choiceKeys(host);
    const text = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);
    return offered(host, { model: text(settings?.[keys.model]), effort: text(settings?.[keys.effort]) });
}

// The choice kept to the values the host offers: its middle model and effort where none is chosen, or one it does not offer.
function offered(host: HostName, choice: HostChoice): HostChoice
{
    const choices = hostChoices[host];
    const model = choice.model !== undefined && choices.models.includes(choice.model) ? choice.model : choices.model;
    const effort = choice.effort !== undefined && choices.efforts.includes(choice.effort) ? choice.effort : choices.effort;
    return { model, effort };
}
