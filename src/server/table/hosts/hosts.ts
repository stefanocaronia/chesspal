// The AI hosts the table opens a chat in (D-104, D-115, D-117): Claude Code, Codex, Antigravity and OpenCode, each with the start message, and the model and
// effort the player chose on the page for the profile in use, or each host's middle ones until they choose: the chat never starts with whatever the host
// was left at; OpenCode, which may fall back to a paid key, does not start while it offers no model.
import { speaksItalian } from "../../../commands/index.ts";

/** The hosts the page offers, by the name `chesspal play` takes. */
export const hostNames = ["claude", "codex", "antigravity", "opencode"] as const;
export type HostName = typeof hostNames[number];

/** Each host's program, as its installer names it. */
export const hostPrograms: Readonly<Record<HostName, string>> = { claude: "claude", codex: "codex", antigravity: "agy", opencode: "opencode" };

/**
 * The models and efforts the player may choose for a host, as its command line names them: aliases, which follow the host's newest models; and the
 * `model` and `effort` a chat starts with until the player chooses, the middle ones. `modelEfforts`, where the models differ, the efforts of each,
 * none for a model without; else every model has `efforts`.
 */
export interface HostChoices
{
    readonly models: readonly string[];
    readonly efforts: readonly string[];
    readonly model: string;
    readonly effort: string;
    readonly modelEfforts?: Readonly<Record<string, readonly string[]>>;
}

/** What the player chose for a host on the page: none of either, or one the host does not offer, is the host's middle one; no effort for a model without. */
export interface HostChoice
{
    readonly model?: string | undefined;
    readonly effort?: string | undefined;
}

/**
 * Each host's choices, as tried in each (Priya): a value outside them would fail only at the chat's first turn. Claude Code's are its aliases; Codex's, the
 * models a ChatGPT account lists, which change with its releases; Antigravity's, the Gemini Flash its free plan gives, its effort apart (D-115), until
 * the table has read the models of the player's account; OpenCode's none, until the table has found the models the player can use in it (D-117).
 */
export const hostChoices: Readonly<Record<HostName, HostChoices>> = {
    claude: { models: ["fable", "opus", "sonnet", "haiku"], efforts: ["low", "medium", "high", "xhigh", "max"], model: "sonnet", effort: "medium" },
    codex: { models: ["gpt-6.1-sol", "gpt-6-astra", "gpt-6.1-terra", "gpt-6-luna"], efforts: ["low", "medium", "high", "xhigh", "max"], model: "gpt-6.1-terra", effort: "medium" },
    antigravity: { models: ["gemini-3.8-flash"], efforts: ["low", "medium", "high"], model: "gemini-3.8-flash", effort: "medium" },
    opencode: { models: [], efforts: [], model: "", effort: "" },
};

/** Whether a word names a host the page offers. */
export function isHostName(name: unknown): name is HostName
{
    return hostNames.includes(name as HostName);
}

/** The efforts a host offers for one of its models: none for a model that has no effort to choose. */
export function effortsOf(choices: HostChoices, model: string): readonly string[]
{
    return choices.modelEfforts?.[model] ?? choices.efforts;
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
 * subcommand, kept from its update screen, which an Enter would accept; for Antigravity after -i, which keeps the chat open, with Chesspal's tools
 * allowed and the table's `folder` trusted for this chat alone, never saved in its settings: a folder trusted only at its first chat's dialog leaves that
 * chat without its hooks; for OpenCode with its own server, which gives Chesspal's the environment of `chesspal play`, the model apart in it
 * (`hostEnvironment`). A model with no effort to choose is given none. `choices` are those the host offers, as read for Antigravity and OpenCode.
 */
export function hostArgs(host: HostName, message: string, choice: HostChoice = {}, folder?: string, choices: HostChoices = hostChoices[host]): string[]
{
    const { model, effort } = offered(choices, choice);

    if (host === "claude") {
        return [message, ...(model === undefined ? [] : ["--model", model]), ...(effort === undefined ? [] : ["--effort", effort])];
    }

    if (host === "antigravity") {
        const settings = { ...antigravityAllowed, ...(folder === undefined ? {} : { trustedWorkspaces: [folder] }) };
        return ["-i", message, ...(model === undefined ? [] : ["--model", model]), ...(effort === undefined ? [] : ["--effort", effort]), "--settings", JSON.stringify(settings)];
    }

    if (host === "opencode") {
        return ["--standalone", "--prompt", message];
    }

    return ["-c", "check_for_update_on_startup=false", ...(model === undefined ? [] : ["-m", model]), ...(effort === undefined ? [] : ["-c", `model_reasoning_effort=${effort}`]), message];
}

/**
 * What the host's environment changes for the choice: Claude Code's effort for every chat goes, which would win over the one chosen; OpenCode's model,
 * which its command line cannot give a chat it starts, comes in its configuration.
 */
export function hostEnvironment(host: HostName, choice: HostChoice): NodeJS.ProcessEnv
{
    if (host === "claude" && choice.effort !== undefined) {
        return { CLAUDE_CODE_EFFORT_LEVEL: undefined };
    }

    if (host === "opencode" && choice.model !== undefined) {
        return { OPENCODE_CONFIG_CONTENT: JSON.stringify({ model: choice.model }) };
    }

    return {};
}

/** The settings' keys that keep a host's choice in the profile, as claudeModel and claudeEffort. */
export function choiceKeys(host: HostName): { model: string; effort: string; }
{
    return { model: `${host}Model`, effort: `${host}Effort` };
}

/** A host's choice as the profile's settings keep it: the values the host offers alone, among `choices`, the rest is its middle one. */
export function choiceIn(settings: Readonly<Record<string, unknown>> | undefined, host: HostName, choices: HostChoices = hostChoices[host]): HostChoice
{
    const keys = choiceKeys(host);
    const text = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);
    return offered(choices, { model: text(settings?.[keys.model]), effort: text(settings?.[keys.effort]) });
}

// Antigravity's settings for one chat: Chesspal's tools allowed, which it would otherwise ask for at each first use.
const antigravityAllowed = { permissions: { allow: ["mcp(chesspal/*)"] } };

// The choice kept to the values the host offers: its middle model where none is chosen, or one it does not offer; the model's middle effort likewise,
// none for a model without. None at all where the host offers no model, which chesspal play then does not start.
function offered(choices: HostChoices, choice: HostChoice): HostChoice
{
    if (choices.models.length === 0) {
        return {};
    }

    const model = choice.model !== undefined && choices.models.includes(choice.model) ? choice.model : choices.model;
    const efforts = effortsOf(choices, model);
    const middle = efforts.includes(choices.effort) ? choices.effort : efforts[Math.floor((efforts.length - 1) / 2)];
    const effort = choice.effort !== undefined && efforts.includes(choice.effort) ? choice.effort : middle;
    return effort === undefined ? { model } : { model, effort };
}
