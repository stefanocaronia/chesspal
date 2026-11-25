// The models Codex offers on this computer: its app-server started, asked for its list of models after the protocol's first request, then stopped.
// No thread is opened, so no MCP server starts.
import { type HostModel, isHostName, laterByTimer, type ModelsOptions } from "../chat.ts";
import { isObject, notification, parsedLine, Requests } from "../lines.ts";
import { type LineProcess, startLineProcess } from "../process.ts";
import { modelArguments } from "./program.ts";
import { initializeParams } from "./protocol.ts";

// How long the program has to answer, and how many models are kept.
const answerWait = 10_000;
const mostModels = 40;
// How long a model's name and its words may be.
const mostName = 100;
const mostAbout = 300;

/** The models Codex offers, the account's own default first; an empty list where it does not answer in time, fails or cannot start. */
export function codexModels(options: ModelsOptions): Promise<HostModel[]>
{
    const start = options.start ?? startLineProcess;
    const later = options.later ?? laterByTimer;

    return new Promise((done) => {
        let host: LineProcess | undefined;
        let finished = false;
        const requests = new Requests((line) => host?.write(line));

        const finish = (models: HostModel[]): void => {
            if (!finished) {
                finished = true;
                cancel();
                host?.stop();
                done(models);
            }
        };

        const cancel = later(answerWait, () => finish([]));

        try {
            host = start(options.program.command, [...options.program.args, ...modelArguments], { cwd: options.folder, env: options.environment, errors: () => undefined });
        } catch {
            finish([]);
            return;
        }

        host.onLine((line) => {
            const message = parsedLine(line);

            if (message !== undefined && message.method === undefined) {
                requests.answer(message);
            }
        });
        host.onEnd(() => finish([]));
        requests.ask("initialize", initializeParams(), (initialized) => {
            if (initialized.error !== undefined) {
                finish([]);
                return;
            }

            host?.write(JSON.stringify(notification("initialized")));
            requests.ask("model/list", {}, (listed) => finish(isObject(listed.result) ? modelsOf(listed.result.data) : []));
        });
    });
}

/** The models listed and not hidden, each once, the default first, none whose id the table could not take as a model's name. */
function modelsOf(listed: unknown): HostModel[]
{
    const entries = (Array.isArray(listed) ? listed : []).filter(isObject).filter((entry) => entry.hidden !== true);
    const models: HostModel[] = [];

    for (const entry of [...entries.filter((one) => one.isDefault === true), ...entries.filter((one) => one.isDefault !== true)]) {
        if (models.length >= mostModels) {
            break;
        }

        if (typeof entry.id !== "string" || !isHostName(entry.id) || models.some((model) => model.id === entry.id)) {
            continue;
        }

        const name = typeof entry.displayName === "string" && entry.displayName.trim() !== "" ? entry.displayName.trim().slice(0, mostName) : entry.id;
        const about = typeof entry.description === "string" && entry.description.trim() !== "" ? entry.description.trim().slice(0, mostAbout) : undefined;
        models.push({ id: entry.id, name, ...(about === undefined ? {} : { about }), efforts: effortsOf(entry.supportedReasoningEfforts) });
    }

    return models;
}

/** A model's efforts as listed, lowest first; none where the list holds one the program could not take. */
function effortsOf(options: unknown): string[]
{
    const efforts = (Array.isArray(options) ? options : []).map((option) => (isObject(option) ? option.reasoningEffort : option));
    return efforts.every((effort) => typeof effort === "string" && isHostName(effort)) ? efforts as string[] : [];
}
