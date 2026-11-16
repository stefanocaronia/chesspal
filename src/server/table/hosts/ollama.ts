// Ollama on this computer, which plays OpenCode's free models (D-117): the models installed that can use tools, and whether it answers now, with the
// context of each model it has loaded, which the page tells the player when it is too small for Chesspal's instructions.
import type { Fetch } from "../../../sites/index.ts";
import type { OllamaState } from "../../page/index.ts";

/** Ollama as the table looks at it: the state last seen, a look started, and who is told when the state changes. */
export interface OllamaWatch
{
    state(): OllamaState | undefined;
    /** Starts looking at Ollama, every few seconds from then on: the page asks for its state when it first needs it. */
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

/**
 * Ollama looked at with `fetch`: from the first look on, every few seconds, since the page asks only when the game changes, and Ollama may stop or start
 * meanwhile; watchers are told when what it says changes.
 */
export function ollamaWatch(fetch: Fetch, env: NodeJS.ProcessEnv): OllamaWatch
{
    let seen: OllamaState | undefined;
    let looking = false;
    let timer: NodeJS.Timeout | undefined;
    const watchers: Array<() => void> = [];

    const ask = (): void => {
        if (looking) {
            return;
        }

        looking = true;
        void ollamaState(fetch, env).then((state) => {
            looking = false;

            if (JSON.stringify(state) !== JSON.stringify(seen)) {
                seen = state;
                watchers.forEach((changed) => changed());
            }
        });
    };

    return {
        state: () => seen,
        look: () => {
            if (timer === undefined) {
                ask();
                timer = setInterval(ask, lookEvery);
                timer.unref();
            }
        },
        watch: (changed) => {
            watchers.push(changed);
        },
    };
}

// Ollama answers at once, or is not running.
const askTime = 5_000;
// A local request every ten seconds: the page tells within as much that Ollama stopped or came back.
const lookEvery = 10_000;

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
