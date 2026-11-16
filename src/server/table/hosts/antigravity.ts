// Antigravity's models, as `agy models` lists them for the account signed in: Gemini Flash on a free plan, more with a subscription, some with efforts.
import type { HostChoices } from "./hosts.ts";
import type { ModelSources } from "./models.ts";

/** What `agy models` lists for the account signed in; it fails when the program fails. */
export function antigravityList(program: string, { run }: ModelSources): Promise<string>
{
    return run(program, ["models"], readTime);
}

/**
 * The choices in what `agy models` lists, an id and a name on each line: an id ending in an effort is that model with that effort, one without a model with
 * no effort to choose. A Gemini Flash is the middle model where there is one, else the first; none when no line names a model.
 */
export function antigravityChoices(listed: string): HostChoices | undefined
{
    const modelEfforts: Record<string, string[]> = {};

    for (const line of listed.split(/\r?\n/)) {
        const id = line.split("\t")[0]!.trim();

        if (!modelId.test(id)) {
            continue;
        }

        const [, model = id, effort] = effortEnd.exec(id) ?? [];
        const efforts = (modelEfforts[model] ??= []);

        if (effort !== undefined && !efforts.includes(effort)) {
            efforts.push(effort);
            efforts.sort((one, other) => effortScale.indexOf(one) - effortScale.indexOf(other));
        }
    }

    const models = Object.keys(modelEfforts);

    if (models.length === 0) {
        return undefined;
    }

    const efforts = effortScale.filter((effort) => models.some((model) => modelEfforts[model]!.includes(effort)));
    const model = models.find((one) => /^gemini-.*flash/.test(one)) ?? models[0]!;
    return { models, efforts, model, effort: "medium", modelEfforts };
}

// `agy models` asks Google's servers for the account's models: about a second, at times more.
const readTime = 15_000;
// The efforts Antigravity's ids end in, from the least.
const effortScale = ["low", "medium", "high", "xhigh", "max"];
const effortEnd = new RegExp(`^(.+)-(${effortScale.join("|")})$`);
// An id as Antigravity writes them, which a header or a message never is.
const modelId = /^[a-z0-9][a-z0-9._-]*$/;
