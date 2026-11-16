// The models of the hosts whose choices the table reads from the computer: Antigravity's, as `agy models` lists them for the account signed in, Gemini
// Flash on a free plan, more with a subscription; OpenCode's, those the player can use in it (D-117). The table reads them once, without waiting for them,
// and keeps the list in its folder for `chesspal play`; until it comes, or when it cannot be read, the host's own choices: Gemini Flash, no OpenCode model.
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { writeAtomically } from "../../../games/index.ts";
import type { Fetch } from "../../../sites/index.ts";
import { type HostChoices, hostChoices, type HostName } from "./hosts.ts";
import { isOllamaModel, openCodeChoices, openCodeList } from "./opencode.ts";

/** Runs a program with its arguments: what it wrote on stdout; it fails when the program fails, or has not ended within `timeout` milliseconds. */
export type RunProgram = (program: string, args: readonly string[], timeout: number) => Promise<string>;

/** What the models are read with: programs, the network, for Ollama on this computer, the user's home and environment, where OpenCode keeps its state. */
export interface ModelSources
{
    readonly run: RunProgram;
    readonly fetch: Fetch;
    readonly userHome: string;
    readonly env: NodeJS.ProcessEnv;
}

/** The hosts whose models the table reads. */
export const readHosts = ["antigravity", "opencode"] as const;
export type ReadHost = typeof readHosts[number];

/** A host's models as the table reads them: the choices offered now, a reading started, and who is told when they come. */
export interface HostModels
{
    choices(): HostChoices;
    /**
     * Reads the models with the host's program, once: again after a reading that failed; at most every few minutes after one that found none, or, for
     * OpenCode, none of Ollama's, which may start after the table.
     */
    read(program: string): void;
    watch(changed: () => void): void;
}

/** Whether the table reads the host's models. */
export function isReadHost(host: HostName): host is ReadHost
{
    return readHosts.includes(host as ReadHost);
}

/**
 * The host's models read with `sources`, the computer's where none is given, for the table in `folder`, which keeps the list read for `chesspal play`;
 * `now` tells when a reading may be made again.
 */
export function hostModels(folder: string, host: ReadHost, now: () => Date, sources: Partial<ModelSources> = {}): HostModels
{
    const userHome = sources.userHome ?? homedir();
    const given: ModelSources = { run: (program, args, timeout) => runProgram(program, args, timeout, userHome), fetch, userHome, env: process.env, ...sources };
    const { file, list, choicesIn, complete } = readings[host];
    let read: HostChoices | undefined;
    let listedLast: string | undefined;
    let reading = false;
    // When the last reading found too little to stop at: the next one waits a while.
    let incompleteAt: number | undefined;
    const watchers: Array<() => void> = [];

    return {
        choices: () => read ?? hostChoices[host],
        read: (program) => {
            const at = now().getTime();

            if (reading || (read !== undefined && complete(read)) || (incompleteAt !== undefined && at - incompleteAt < readAgainAfter)) {
                return;
            }

            reading = true;
            list(program, given).then((listed) => {
                reading = false;
                const found = choicesIn(listed);
                incompleteAt = found !== undefined && complete(found) ? undefined : at;

                if (found !== undefined && listed !== listedLast) {
                    read = found;
                    listedLast = listed;
                    keepList(join(folder, file), listed);
                    watchers.forEach((changed) => changed());
                }
            }, () => {
                reading = false;
                incompleteAt = undefined;
            });
        },
        watch: (changed) => {
            watchers.push(changed);
        },
    };
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

/** The choices a host offers at the table in `folder`: Antigravity's and OpenCode's as the table last read them, the others' always the same. */
export function tableChoices(folder: string, host: HostName): HostChoices
{
    if (!isReadHost(host)) {
        return hostChoices[host];
    }

    const { file, choicesIn } = readings[host];

    try {
        return choicesIn(readFileSync(join(folder, file), "utf8")) ?? hostChoices[host];
    } catch {
        return hostChoices[host];
    }
}

// `agy models` asks Google's servers for the account's models: about a second, at times more.
const readTime = 15_000;
// A reading that found too little is made again no sooner: each runs the host's program, and the page asks every few seconds.
const readAgainAfter = 5 * 60_000;
// The efforts Antigravity's ids end in, from the least.
const effortScale = ["low", "medium", "high", "xhigh", "max"];
const effortEnd = new RegExp(`^(.+)-(${effortScale.join("|")})$`);
// An id as Antigravity writes them, which a header or a message never is.
const modelId = /^[a-z0-9][a-z0-9._-]*$/;

// How each host's models are read, the list kept in the table's folder, the choices in it, and whether they are all the table waits for.
const readings: Readonly<
    Record<ReadHost, {
        file: string;
        list(program: string, sources: ModelSources): Promise<string>;
        choicesIn(listed: string): HostChoices | undefined;
        complete(choices: HostChoices): boolean;
    }>
> = {
    antigravity: { file: "antigravity-models.txt", list: (program, { run }) => run(program, ["models"], readTime), choicesIn: antigravityChoices, complete: () => true },
    opencode: { file: "opencode-models.json", list: openCodeList, choicesIn: openCodeChoices, complete: (choices) => choices.models.some(isOllamaModel) },
};

// npm's Windows shims, as OpenCode's, run only through cmd, given one line: the arguments are the host's own words. In the user's home, since
// `opencode models` starts a service of OpenCode's that outlives it, which on Windows would hold the folder it started in.
function runProgram(program: string, args: readonly string[], timeout: number, userHome: string): Promise<string>
{
    const shell = process.platform === "win32" && /\.(cmd|bat)$/i.test(program);
    const options = { timeout, windowsHide: true, encoding: "utf8", cwd: userHome } as const;
    return new Promise((done, failed) => {
        const ended = (error: Error | null, stdout: string): void => (error === null ? done(stdout) : failed(error));

        if (shell) {
            execFile([`"${program}"`, ...args].join(" "), { ...options, shell: true }, ended);
        } else {
            execFile(program, args, options, ended);
        }
    });
}

// A list that cannot be written leaves `chesspal play` with the host's own choices: the chat starts all the same.
function keepList(path: string, listed: string): void
{
    try {
        writeAtomically(path, listed);
    } catch {
        // Nothing to do: see above.
    }
}
