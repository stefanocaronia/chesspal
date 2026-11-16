// The models of the hosts whose choices the table reads from the computer: Antigravity's, as `agy models` lists them for the account signed in, Gemini
// Flash on a free plan, more with a subscription; OpenCode's, those the player can use in it (D-117). The table reads them once, OpenCode's again when the
// player's recent and favourite models there change, without waiting for them, and keeps the list in its folder for `chesspal play`; until it comes, or
// when it cannot be read, the host's own choices: Gemini Flash, no OpenCode model.
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { writeAtomically } from "../../../games/index.ts";
import type { Fetch } from "../../../sites/index.ts";
import { antigravityChoices, antigravityList } from "./antigravity.ts";
import { runsInShell } from "./find.ts";
import { type HostChoices, hostChoices, type HostName } from "./hosts.ts";
import { isOllamaModel, openCodeChoices, openCodeList, openCodeStamp } from "./opencode.ts";

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
     * OpenCode, none of Ollama's, which may start after the table; for OpenCode, again when the player's recent and favourite models there change.
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
    const { file, list, choicesIn, complete, stamp } = readings[host];
    let read: HostChoices | undefined;
    let listedLast: string | undefined;
    let reading = false;
    // When the last reading found too little to stop at: the next one waits a while.
    let incompleteAt: number | undefined;
    // The stamp of the last reading that ended well.
    let stampRead: string | undefined;
    const watchers: Array<() => void> = [];

    return {
        choices: () => read ?? hostChoices[host],
        read: (program) => {
            const at = now().getTime();
            const stampNow = stamp(given);
            const settled = (read !== undefined && complete(read)) || (incompleteAt !== undefined && at - incompleteAt < readAgainAfter);

            if (reading || (settled && stampNow === stampRead)) {
                return;
            }

            reading = true;
            list(program, given).then((listed) => {
                reading = false;
                stampRead = stampNow;
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

// A reading that found too little is made again no sooner: each runs the host's program, and the page asks every few seconds.
const readAgainAfter = 5 * 60_000;

// How each host's models are read, the list kept in the table's folder, the choices in it, whether they are all the table waits for, and what changes
// when they should be read again.
const readings: Readonly<
    Record<ReadHost, {
        file: string;
        list(program: string, sources: ModelSources): Promise<string>;
        choicesIn(listed: string): HostChoices | undefined;
        complete(choices: HostChoices): boolean;
        stamp(sources: ModelSources): string;
    }>
> = {
    antigravity: { file: "antigravity-models.txt", list: antigravityList, choicesIn: antigravityChoices, complete: () => true, stamp: () => "" },
    opencode: {
        file: "opencode-models.json",
        list: openCodeList,
        choicesIn: openCodeChoices,
        complete: (choices) => choices.models.some(isOllamaModel),
        stamp: openCodeStamp,
    },
};

// The host's program, as the table finds it: OpenCode's own behind npm's shim, else a shim, which runs only through cmd, given one line of the host's own
// words. In the user's home, which a program that leaves a process behind does not hold on Windows.
function runProgram(program: string, args: readonly string[], timeout: number, userHome: string): Promise<string>
{
    const options = { timeout, windowsHide: true, encoding: "utf8", cwd: userHome } as const;
    return new Promise((done, failed) => {
        const ended = (error: Error | null, stdout: string): void => (error === null ? done(stdout) : failed(error));

        if (runsInShell(program, process.platform)) {
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
