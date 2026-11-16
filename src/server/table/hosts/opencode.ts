// OpenCode's models (D-117): of the hundreds `opencode models` lists, every provider whose key is in the environment, only those the player can use. First
// the models installed in Ollama that can use tools, which play for free on this computer, then the player's recent and favourite models in OpenCode;
// each only when `opencode models` lists it too, so that OpenCode can start with it.
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { HostChoices } from "./hosts.ts";
import type { ModelSources } from "./models.ts";
import { ollamaToolModels } from "./ollama.ts";

/**
 * The models the player can use in OpenCode, as the table keeps them: JSON with the `models` in order and the `model` a chat starts with until the player
 * chooses: the first of Ollama's, which plays for free, else the first recent one, else the first. It fails when `opencode models` fails.
 */
export async function openCodeList(program: string, sources: ModelSources): Promise<string>
{
    const [listed, ollama] = await Promise.all([sources.run(program, ["models", "--standalone"], listTime), ollamaToolModels(sources.fetch, sources.env)]);
    const known = new Set(listed.split(/\r?\n/).map((line) => line.trim()));
    const { recent, favorite } = playerModels(sources);
    const models = [...new Set([...ollama.map((name) => `ollama/${name}`), ...recent, ...favorite])].filter((model) => known.has(model));
    const model = models.find(isOllamaModel) ?? recent.find((one) => models.includes(one)) ?? models[0] ?? "";
    return `${JSON.stringify({ models, model })}\n`;
}

/** Whether a model of OpenCode's is one of Ollama's, on this computer. */
export function isOllamaModel(model: string): boolean
{
    return model.startsWith("ollama/");
}

/** The choices in OpenCode's models as the table keeps them, with no effort; none when there is no model. */
export function openCodeChoices(kept: string): HostChoices | undefined
{
    try {
        const { models, model } = JSON.parse(kept) as { models?: unknown; model?: unknown; };
        const named = Array.isArray(models) ? models.filter((one): one is string => typeof one === "string" && one !== "") : [];

        if (named.length === 0) {
            return undefined;
        }

        return { models: named, efforts: [], model: typeof model === "string" && named.includes(model) ? model : named[0]!, effort: "" };
    } catch {
        return undefined;
    }
}

/** What changes when the player's recent and favourite models in OpenCode do: the time and size of the file that keeps them; empty when there is none. */
export function openCodeStamp(sources: ModelSources): string
{
    try {
        const { mtimeMs, size } = statSync(stateFile(sources));
        return `${mtimeMs} ${size}`;
    } catch {
        return "";
    }
}

// `opencode models` reads OpenCode's catalogue with a server of its own, which ends with it: never OpenCode's background service, which would outlive
// the table with its environment. About a second.
const listTime = 15_000;

// The player's recent and favourite models in OpenCode, as `provider/model`.
function playerModels(sources: ModelSources): { recent: string[]; favorite: string[]; }
{
    try {
        const kept = JSON.parse(readFileSync(stateFile(sources), "utf8")) as { recent?: unknown; favorite?: unknown; };
        return { recent: modelNames(kept.recent), favorite: modelNames(kept.favorite) };
    } catch {
        return { recent: [], favorite: [] };
    }
}

// Where OpenCode keeps the player's recent and favourite models, in the user's home on every system.
function stateFile({ userHome, env }: ModelSources): string
{
    return join(env.XDG_STATE_HOME?.trim() || join(userHome, ".local", "state"), "opencode", "model.json");
}

function modelNames(list: unknown): string[]
{
    return (Array.isArray(list) ? list as { providerID?: unknown; modelID?: unknown; }[] : [])
        .filter((one) => typeof one?.providerID === "string" && typeof one.modelID === "string")
        .map((one) => `${String(one.providerID)}/${String(one.modelID)}`);
}
