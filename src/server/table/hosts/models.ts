// Antigravity's models, as `agy models` lists them for the account signed in: Gemini Flash on a free plan, more with a subscription. The table reads them
// once, without waiting for them, and keeps the list in its folder for `chesspal play`; until it comes, or when it cannot be read, Gemini Flash alone.
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { writeAtomically } from "../../../games/index.ts";
import { type HostChoices, hostChoices, type HostName } from "./hosts.ts";

/** Runs a program with its arguments: what it wrote on stdout; it fails when the program fails, or has not ended within `timeout` milliseconds. */
export type RunProgram = (program: string, args: readonly string[], timeout: number) => Promise<string>;

/** Antigravity's models as the table reads them: the choices offered now, a reading started, and who is told when they come. */
export interface AntigravityModels
{
    choices(): HostChoices;
    /** Reads the models with the program, once: again only after a reading that failed. */
    read(program: string): void;
    watch(changed: () => void): void;
}

/** Antigravity's models read with `run` for the table in `folder`, which keeps the list read for `chesspal play`. */
export function antigravityModels(folder: string, run: RunProgram = runProgram): AntigravityModels
{
    let read: HostChoices | undefined;
    let reading = false;
    const watchers: Array<() => void> = [];

    return {
        choices: () => read ?? hostChoices.antigravity,
        read: (program) => {
            if (read !== undefined || reading) {
                return;
            }

            reading = true;
            run(program, ["models"], readTime).then((listed) => {
                reading = false;
                read = antigravityChoices(listed);

                if (read !== undefined) {
                    keepList(folder, listed);
                    watchers.forEach((changed) => changed());
                }
            }, () => {
                reading = false;
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

/** The choices a host offers at the table in `folder`: Antigravity's as the table last read them, the others' always the same. */
export function tableChoices(folder: string, host: HostName): HostChoices
{
    if (host !== "antigravity") {
        return hostChoices[host];
    }

    try {
        return antigravityChoices(readFileSync(join(folder, listFile), "utf8")) ?? hostChoices.antigravity;
    } catch {
        return hostChoices.antigravity;
    }
}

// `agy models` asks Google's servers for the account's models: about a second, at times more.
const readTime = 15_000;
const listFile = "antigravity-models.txt";
// The efforts Antigravity's ids end in, from the least.
const effortScale = ["low", "medium", "high", "xhigh", "max"];
const effortEnd = new RegExp(`^(.+)-(${effortScale.join("|")})$`);
// An id as Antigravity writes them, which a header or a message never is.
const modelId = /^[a-z0-9][a-z0-9._-]*$/;

function runProgram(program: string, args: readonly string[], timeout: number): Promise<string>
{
    return new Promise((done, failed) => {
        execFile(program, args, { timeout, windowsHide: true, encoding: "utf8" }, (error, stdout) => (error === null ? done(stdout) : failed(error)));
    });
}

// A list that cannot be written leaves `chesspal play` with Gemini Flash: the chat starts all the same.
function keepList(folder: string, listed: string): void
{
    try {
        writeAtomically(join(folder, listFile), listed);
    } catch {
        // Nothing to do: see above.
    }
}
