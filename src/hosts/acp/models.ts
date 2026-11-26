// The models an agent offers on this computer: its program started in the chat's folder, asked for a new session whose answer lists them, then let go.
// The session made for asking is deleted where the agent says it can delete one.
import { type HostModel, hostModels, isHostName, type ModelsOptions } from "../chat.ts";
import { failureOf, isObject, type Message, parsedLine, Requests } from "../lines.ts";
import type { AcpHost } from "./host.ts";
import { configOption, effortsOf, initializeParams, optionValues } from "./protocol.ts";

// How long the program has to answer, as its session starts the folder's MCP servers, and how many models are kept.
const answerWait = 20_000;
const mostModels = 200;
// How long a model's name and its words may be.
const mostName = 100;
const mostAbout = 300;

/** The models the agent offers, the one it would play first; an empty list where it does not answer in time, fails or cannot start. */
export function acpModels(options: ModelsOptions, host: AcpHost): Promise<HostModel[]>
{
    return hostModels(options, host.args, answerWait, (agent, answer) => {
        let found: HostModel[] = [];
        const requests = new Requests((line) => agent.write(line));
        agent.onLine((line) => {
            const message = parsedLine(line);

            if (message !== undefined && message.method === undefined) {
                requests.answer(message);
            }
        });
        requests.ask("initialize", initializeParams(), (initialized) => {
            const capabilities = isObject(initialized.result) && isObject(initialized.result.agentCapabilities) ? initialized.result.agentCapabilities : {};
            const deletes = isObject(capabilities.sessionCapabilities) && capabilities.sessionCapabilities.delete !== undefined;

            if (failureOf(initialized) !== undefined) {
                answer([]);
                return;
            }

            requests.ask("session/new", { cwd: options.folder, mcpServers: [] }, (opened) => {
                const session = isObject(opened.result) ? opened.result : {};
                found = modelsOf(session, host);

                if (deletes && typeof session.sessionId === "string") {
                    requests.ask("session/delete", { sessionId: session.sessionId }, () => answer(found));
                } else {
                    answer(found);
                }
            });
        });
        return () => found;
    });
}

/**
 * The models a new session lists, the one it plays first, advised unless it is paid apart for each answer: from its option of configuration, or from its
 * own list where it has no such option; marked as the host marks them.
 */
function modelsOf(session: Message, host: AcpHost): HostModel[]
{
    const marked = (models: HostModel[], current: unknown): HostModel[] =>
        models.map((model) => {
            const marks = host.modelMarks?.(model.id) ?? {};
            return { ...model, ...marks, ...(model.id === current && marks.metered !== true ? { advised: true as const } : {}) };
        });

    // The model in play first, then the others by the host's rank, each rank in the host's order: the cut never drops those kept first.
    const ordered = <Value extends { value: string; }>(values: Value[], current: unknown): Value[] => {
        const rank = (value: string): number => host.modelRank?.(value) ?? 0;
        const others = values.filter((one) => one.value !== current).map((one, index) => ({ one, index }));
        others.sort((a, b) => rank(a.one.value) - rank(b.one.value) || a.index - b.index);
        return [...values.filter((one) => one.value === current), ...others.map(({ one }) => one)];
    };

    const option = configOption(session.configOptions, "model", "model");

    if (option !== undefined) {
        const current = option.currentValue;
        // Only the model in play says its efforts: another's are not known until it is chosen.
        const efforts = effortsOf(session.configOptions);
        const values = optionValues(option).map((one) => ({ ...one, efforts: one.value === current ? efforts : [] }));
        return marked(kept(ordered(values, current)), current);
    }

    const listed = isObject(session.models) ? session.models : {};
    const available = Array.isArray(listed.availableModels) ? listed.availableModels.filter(isObject) : [];
    const values = available.flatMap((entry) =>
        typeof entry.modelId === "string"
            ? [{ value: entry.modelId, efforts: [], ...(typeof entry.name === "string" ? { name: entry.name } : {}), ...(typeof entry.description === "string" ? { about: entry.description } : {}) }]
            : []
    );
    return marked(kept(ordered(values, listed.currentModelId)), listed.currentModelId);
}

/** The models kept: each once, at most so many, none whose id the table could not take as a model's name. */
function kept(values: { value: string; name?: string; about?: string; efforts: string[]; }[]): HostModel[]
{
    const models: HostModel[] = [];

    for (const entry of values) {
        if (models.length >= mostModels) {
            break;
        }

        if (!isHostName(entry.value) || models.some((model) => model.id === entry.value)) {
            continue;
        }

        const name = entry.name?.trim() ? entry.name.trim().slice(0, mostName) : entry.value;
        const about = entry.about?.trim() ? entry.about.trim().slice(0, mostAbout) : undefined;
        models.push({ id: entry.value, name, ...(about === undefined ? {} : { about }), efforts: entry.efforts });
    }

    return models;
}
