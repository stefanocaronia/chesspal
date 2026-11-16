// The chats a table opens from its page (D-104): the hosts found on this computer, each with the choices the page offers, and a terminal in the table's
// folder running `chesspal play <host>`, which starts the host there, and again when the table asks it.
import type { Context } from "../../../commands/index.ts";
import { samePath, tableFolder } from "../../../home/index.ts";
import type { ChatHost, TableChats } from "../../page/index.ts";
import { hostProgramPath } from "./find.ts";
import { type HostChoices, hostChoices, type HostName, hostNames, isHostName } from "./hosts.ts";
import { type HostModels, hostModels, isReadHost, type ModelSources, type ReadHost, readHosts } from "./models.ts";
import { ollamaWatch } from "./ollama.ts";
import { askAgain, seatHeld } from "./seat.ts";
import { openTerminal } from "./terminal.ts";

/**
 * The chats of a real table: the hosts installed, looked for again once a while has passed, since the player may install one with the page open; a
 * terminal opened with `chesspal play`, run by `chesspal`, the same Node and script as the table's. Antigravity's and OpenCode's models are read with
 * the context's network and user's home, and `sources` where given, as soon as the host is found, and again when it is looked for after a reading that
 * failed, or a few minutes after one that found too little; Ollama is asked whether it answers, and OpenCode's models looked at, every few seconds, where
 * OpenCode is installed, once the page has asked.
 */
export function terminalChats(
    context: Context,
    chesspal: readonly string[] = [process.execPath, ...process.execArgv, process.argv[1] ?? ""],
    env: NodeJS.ProcessEnv = process.env,
    sources: Partial<ModelSources> = {},
): TableChats
{
    let found: { programs: Readonly<Record<HostName, string | undefined>>; at: number; } | undefined;
    const table = tableFolder(context.home());
    const given: Partial<ModelSources> = {
        env,
        ...(context.fetch === undefined ? {} : { fetch: context.fetch }),
        ...(context.userHome === undefined ? {} : { userHome: context.userHome() }),
        ...sources,
    };
    const models = Object.fromEntries(readHosts.map((host) => [host, hostModels(table, host, () => context.now(), given)])) as Record<ReadHost, HostModels>;
    const ollama = ollamaWatch(given.fetch ?? fetch, env);
    // The player may choose a model in OpenCode with the page open and still, which asks only when the game changes.
    let modelsTimer: NodeJS.Timeout | undefined;

    const programs = (): Readonly<Record<HostName, string | undefined>> => {
        const now = context.now().getTime();

        if (found === undefined || now - found.at >= lookAgain) {
            found = { programs: Object.fromEntries(hostNames.map((name) => [name, hostProgramPath(name, context.platform, env)])) as Record<HostName, string | undefined>, at: now };

            for (const host of readHosts) {
                const program = found.programs[host];

                if (program !== undefined) {
                    models[host].read(program);
                }
            }
        }

        return found.programs;
    };

    // OpenCode's models read again when the player's own there changed: `read` does nothing otherwise.
    const readOpenCode = (): void => {
        const program = programs().opencode;

        if (program !== undefined) {
            models.opencode.read(program);
        }
    };

    programs();

    return {
        hosts: () => {
            const found = programs();
            return hostNames.map((name) => chatHost(name, found[name] !== undefined, isReadHost(name) ? models[name].choices() : hostChoices[name]));
        },
        watch: (changed) => {
            readHosts.forEach((host) => models[host].watch(changed));
            ollama.watch(changed);
        },
        // Asked only where OpenCode is installed: the page warns of Ollama only for a chat of OpenCode's.
        ollama: () => {
            if (programs().opencode === undefined) {
                return undefined;
            }

            ollama.look();
            modelsTimer ??= setInterval(readOpenCode, lookAgain).unref();
            return ollama.state();
        },
        open: async (host) => isHostName(host) && await openTerminal(tableFolder(context.home()), playCommand(chesspal, host, env), context.platform, env),
        // Only a chat in the table's folder can be the one chesspal play holds.
        held: (folder) => {
            const seat = samePath(folder, tableFolder(context.home())) ? seatHeld(folder, context.now()) : undefined;
            return seat === undefined ? undefined : { model: seat.model, effort: seat.effort, seat: seat.pid, ...(seat.analysis === true ? { analysis: true } : {}) };
        },
        relaunch: (folder, host, updated) => samePath(folder, tableFolder(context.home())) && askAgain(folder, context.now(), { ...(host === undefined ? {} : { host }), ...(updated === true ? { updated } : {}) }),
    };
}

/**
 * What the terminal runs: `chesspal play <host>`, with the table's data folder when it has one of its own, as a playtest's: Terminal.app and Windows
 * Terminal start the chat without the table's environment.
 */
export function playCommand(chesspal: readonly string[], host: string, env: NodeJS.ProcessEnv): string[]
{
    const home = env.CHESSPAL_HOME?.trim();
    return [...chesspal, "play", host, ...(home ? ["--home", home] : [])];
}

// Looking on the PATH takes a few milliseconds, and the page asks at every change of the game.
const lookAgain = 10_000;

function chatHost(name: HostName, installed: boolean, choices: HostChoices): ChatHost
{
    return { name, installed, ...choices, command: `chesspal play ${name}` };
}
