// The models Claude Code offers on this computer: its program started with no tool and no MCP server, asked by the protocol's first request, then let go.
// Its answer holds the account too: nothing of it but the models is read.
import { type HostModel, hostModels, isHostName, type ModelsOptions } from "../chat.ts";
import { isObject } from "../lines.ts";
import { settingArguments, streamArguments } from "./program.ts";
import { controlRequest } from "./protocol.ts";

// How long the program has to answer, the id of the request, and how many models are kept.
const answerWait = 10_000;
const requestId = "chesspal-models";
const mostModels = 40;
// How long a model's name and its words may be.
const mostName = 100;
const mostAbout = 300;

/**
 * The models Claude Code offers, as its first answer lists them, its program then let go to end by itself; an empty list where it does not answer in time,
 * fails or cannot start.
 */
export function claudeModels(options: ModelsOptions): Promise<HostModel[]>
{
    const args = [...streamArguments, ...settingArguments, "--disable-slash-commands", "--tools", ""];

    return hostModels(options, args, answerWait, (host, answer) => {
        host.onLine((line) => {
            const models = answerOf(line);

            if (models !== undefined) {
                answer(models);
            }
        });
        host.write(JSON.stringify(controlRequest(requestId, { subtype: "initialize" })));
        return undefined;
    });
}

/** The models of the answer to the request, none where it failed or is no JSON; undefined for any other line. */
function answerOf(line: string): HostModel[] | undefined
{
    let message: unknown;

    try {
        message = JSON.parse(line);
    } catch {
        return [];
    }

    if (!isObject(message) || message.type !== "control_response" || !isObject(message.response) || message.response.request_id !== requestId) {
        return undefined;
    }

    const answer = message.response;
    return answer.subtype === "success" && isObject(answer.response) ? modelsOf(answer.response.models) : [];
}

/**
 * The models listed, each once, but the account's own default, which the table never names, and any whose id the program could read as an option; the
 * first that is the model the default stands for is the one advised.
 */
function modelsOf(listed: unknown): HostModel[]
{
    const models: HostModel[] = [];
    const entries = Array.isArray(listed) ? listed : [];
    const standsFor = entries.filter(isObject).find((entry) => entry.value === "default")?.resolvedModel;

    for (const entry of entries) {
        if (models.length >= mostModels) {
            break;
        }

        if (!isObject(entry) || typeof entry.value !== "string" || entry.value === "default" || !isHostName(entry.value) || models.some((model) => model.id === entry.value)) {
            continue;
        }

        const name = typeof entry.displayName === "string" && entry.displayName.trim() !== "" ? entry.displayName.trim().slice(0, mostName) : entry.value;
        const about = typeof entry.description === "string" && entry.description.trim() !== "" ? entry.description.trim().slice(0, mostAbout) : undefined;
        const advised = typeof standsFor === "string" && entry.resolvedModel === standsFor && !models.some((model) => model.advised === true);
        models.push({ id: entry.value, name, ...(about === undefined ? {} : { about }), efforts: effortsOf(entry.supportedEffortLevels), ...(advised ? { advised: true as const } : {}) });
    }

    return models;
}

/** A model's efforts as listed, lowest first; none where the list is no list of names the program may take. */
function effortsOf(levels: unknown): string[]
{
    return Array.isArray(levels) && levels.every((level) => typeof level === "string" && isHostName(level)) ? [...levels] as string[] : [];
}
