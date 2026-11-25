// The models an agent offers on this computer: its program started in the chat's folder, asked for a new session whose answer lists them, then stopped.
// The session made for asking is deleted where the agent says it can delete one.
import { type HostModel, isHostName, laterByTimer, type ModelsOptions } from "../chat.ts";
import { failureOf, isObject, type Message, parsedLine, Requests } from "../lines.ts";
import { type LineProcess, startLineProcess } from "../process.ts";
import type { AcpHost } from "./host.ts";
import { configOption, initializeParams, optionValues } from "./protocol.ts";

// How long the program has to answer, as its session starts the folder's MCP servers, and how many models are kept.
const answerWait = 20_000;
const mostModels = 200;
// How long a model's name and its words may be.
const mostName = 100;
const mostAbout = 300;
// The effort that leaves it to the model, which the table never names.
const defaultEffort = "default";

/** The models the agent offers, the one it would play first; an empty list where it does not answer in time, fails or cannot start. */
export function acpModels(options: ModelsOptions, host: AcpHost): Promise<HostModel[]>
{
    const start = options.start ?? startLineProcess;
    const later = options.later ?? laterByTimer;

    return new Promise((done) => {
        let agent: LineProcess | undefined;
        let finished = false;
        let found: HostModel[] = [];
        const requests = new Requests((line) => agent?.write(line));

        const finish = (models: HostModel[]): void => {
            if (!finished) {
                finished = true;
                cancel();
                agent?.stop();
                done(models);
            }
        };

        const cancel = later(answerWait, () => finish(found));

        try {
            agent = start(options.program.command, [...options.program.args, ...host.args], { cwd: options.folder, env: options.environment, errors: () => undefined });
        } catch {
            finish([]);
            return;
        }

        agent.onLine((line) => {
            const message = parsedLine(line);

            if (message !== undefined && message.method === undefined) {
                requests.answer(message);
            }
        });
        agent.onEnd(() => finish(found));
        requests.ask("initialize", initializeParams(), (initialized) => {
            const capabilities = isObject(initialized.result) && isObject(initialized.result.agentCapabilities) ? initialized.result.agentCapabilities : {};
            const deletes = isObject(capabilities.sessionCapabilities) && capabilities.sessionCapabilities.delete !== undefined;

            if (failureOf(initialized) !== undefined) {
                finish([]);
                return;
            }

            requests.ask("session/new", { cwd: options.folder, mcpServers: [] }, (opened) => {
                const session = isObject(opened.result) ? opened.result : {};
                found = modelsOf(session);

                if (deletes && typeof session.sessionId === "string") {
                    requests.ask("session/delete", { sessionId: session.sessionId }, () => finish(found));
                } else {
                    finish(found);
                }
            });
        });
    });
}

/** The models a new session lists, the one it plays first: from its option of configuration, or from its own list where it has no such option. */
function modelsOf(session: Message): HostModel[]
{
    const option = configOption(session.configOptions, "model", "model");
    const effort = configOption(session.configOptions, "thought_level", "effort");

    if (option !== undefined) {
        const current = option.currentValue;
        // Only the model in play says its efforts: another's are not known until it is chosen.
        const efforts = optionValues(effort).map((one) => one.value).filter((one) => one !== defaultEffort && isHostName(one));
        const values = optionValues(option).map((one) => ({ ...one, efforts: one.value === current ? efforts : [] }));
        return kept([...values.filter((one) => one.value === current), ...values.filter((one) => one.value !== current)]);
    }

    const listed = isObject(session.models) ? session.models : {};
    const available = Array.isArray(listed.availableModels) ? listed.availableModels.filter(isObject) : [];
    const values = available.flatMap((entry) =>
        typeof entry.modelId === "string"
            ? [{ value: entry.modelId, efforts: [], ...(typeof entry.name === "string" ? { name: entry.name } : {}), ...(typeof entry.description === "string" ? { about: entry.description } : {}) }]
            : []
    );
    return kept([...values.filter((one) => one.value === listed.currentModelId), ...values.filter((one) => one.value !== listed.currentModelId)]);
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
