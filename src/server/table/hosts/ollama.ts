// Ollama on this computer, which plays OpenCode's free models (D-117): the models installed that can use tools, and whether it answers now, with the
// context of each model it has loaded, which the page tells the player when it is too small for Chesspal's instructions.
import type { Fetch } from "../../../sites/index.ts";
import type { OllamaState } from "../../page/index.ts";

/** Ollama as the table looks at it: the state last seen, a look started, and who is told when the state changes. */
export interface OllamaWatch
{
    state(): OllamaState | undefined;
    /** Asks Ollama again, at most every few seconds: the page asks at every change, and while the chat thinks. */
    look(): void;
    watch(changed: () => void): void;
}

/** Where Ollama answers, as OLLAMA_HOST names it, the way Ollama reads it: the port 11434 for an address without a scheme, this computer for every address. */
export function ollamaAddress(host: string | undefined): string
{
    const given = host?.trim() || "127.0.0.1:11434";
    const schemed = /^[a-z]+:\/\//i.test(given);

    try {
        const address = new URL(schemed ? given : `http://${given}`);

        if (!schemed && address.port === "") {
            address.port = "11434";
        }

        if (address.hostname === "0.0.0.0" || address.hostname === "[::]") {
            address.hostname = "127.0.0.1";
        }

        return address.origin;
    } catch {
        return "http://127.0.0.1:11434";
    }
}

/** The models installed in Ollama that can use tools, as Ollama names them; none when Ollama does not answer. */
export async function ollamaToolModels(fetch: Fetch, env: NodeJS.ProcessEnv): Promise<string[]>
{
    const address = ollamaAddress(env.OLLAMA_HOST);

    try {
        const tags = await (await fetch(`${address}/api/tags`, { signal: AbortSignal.timeout(askTime) })).json() as { models?: unknown; };
        const names = namesIn(tags.models).map(({ name }) => name);
        const able = await Promise.all(names.map((name) => usesTools(fetch, address, name)));
        return names.filter((_, index) => able[index]);
    } catch {
        return [];
    }
}

/** Whether Ollama answers now, and the context of the models it has loaded, as `/api/ps` gives them. */
export async function ollamaState(fetch: Fetch, env: NodeJS.ProcessEnv): Promise<OllamaState>
{
    try {
        const response = await fetch(`${ollamaAddress(env.OLLAMA_HOST)}/api/ps`, { signal: AbortSignal.timeout(askTime) });

        if (!response.ok) {
            return { answering: false, contexts: {} };
        }

        const loaded = await response.json() as { models?: unknown; };
        const contexts = namesIn(loaded.models).filter((one) => typeof one.context_length === "number");
        return { answering: true, contexts: Object.fromEntries(contexts.map((one) => [one.name, one.context_length as number])) };
    } catch {
        return { answering: false, contexts: {} };
    }
}

/** Ollama looked at with `fetch`, at most every few seconds by `now`; watchers are told when what it says changes. */
export function ollamaWatch(fetch: Fetch, env: NodeJS.ProcessEnv, now: () => Date): OllamaWatch
{
    let seen: OllamaState | undefined;
    let lookedAt: number | undefined;
    let looking = false;
    const watchers: Array<() => void> = [];

    return {
        state: () => seen,
        look: () => {
            const at = now().getTime();

            if (looking || (lookedAt !== undefined && at - lookedAt < lookAgain)) {
                return;
            }

            looking = true;
            lookedAt = at;
            void ollamaState(fetch, env).then((state) => {
                looking = false;

                if (JSON.stringify(state) !== JSON.stringify(seen)) {
                    seen = state;
                    watchers.forEach((changed) => changed());
                }
            });
        },
        watch: (changed) => {
            watchers.push(changed);
        },
    };
}

// Ollama answers at once, or is not running.
const askTime = 5_000;
// The page asks at every change of the game and while the chat thinks: Ollama is asked no more often.
const lookAgain = 10_000;

async function usesTools(fetch: Fetch, address: string, model: string): Promise<boolean>
{
    try {
        const shown = await (await fetch(`${address}/api/show`, { method: "POST", body: JSON.stringify({ model }), signal: AbortSignal.timeout(askTime) })).json() as { capabilities?: unknown; };
        return Array.isArray(shown.capabilities) && shown.capabilities.includes("tools");
    } catch {
        return false;
    }
}

// The models of an Ollama answer that have a name, with what else Ollama says of them.
function namesIn(models: unknown): Array<{ name: string; context_length?: unknown; }>
{
    return (Array.isArray(models) ? models as Array<{ name?: unknown; }> : []).filter((one): one is { name: string; } => typeof one?.name === "string");
}
