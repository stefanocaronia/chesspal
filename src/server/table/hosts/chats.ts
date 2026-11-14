// The chats a table opens from its page (D-104): the hosts found on this computer, each with the choices the page offers, and a terminal in the table's
// folder running `chesspal play <host>`, which starts the host there, and again when the table asks it.
import type { Context } from "../../../commands/index.ts";
import { samePath, tableFolder } from "../../../home/index.ts";
import type { ChatHost, TableChats } from "../../page/index.ts";
import { hostProgramPath } from "./find.ts";
import { type HostChoices, hostChoices, type HostName, hostNames, isHostName } from "./hosts.ts";
import { antigravityModels, type RunProgram } from "./models.ts";
import { askAgain, seatHeld } from "./seat.ts";
import { openTerminal } from "./terminal.ts";

/**
 * The chats of a real table: the hosts installed, looked for again once a while has passed, since the player may install one with the page open; a
 * terminal opened with `chesspal play`, run by `chesspal`, the same Node and script as the table's. Antigravity's models are read with `run` as soon
 * as it is found, and again when it is looked for after a reading that failed.
 */
export function terminalChats(
    context: Context,
    chesspal: readonly string[] = [process.execPath, ...process.execArgv, process.argv[1] ?? ""],
    env: NodeJS.ProcessEnv = process.env,
    run?: RunProgram,
): TableChats
{
    let found: { programs: Readonly<Record<HostName, string | undefined>>; at: number; } | undefined;
    const models = antigravityModels(tableFolder(context.home()), run);

    const programs = (): Readonly<Record<HostName, string | undefined>> => {
        const now = context.now().getTime();

        if (found === undefined || now - found.at >= lookAgain) {
            found = { programs: Object.fromEntries(hostNames.map((name) => [name, hostProgramPath(name, context.platform, env)])) as Record<HostName, string | undefined>, at: now };
            const agy = found.programs.antigravity;

            if (agy !== undefined) {
                models.read(agy);
            }
        }

        return found.programs;
    };

    programs();

    return {
        hosts: () => {
            const found = programs();
            return hostNames.map((name) => chatHost(name, found[name] !== undefined, name === "antigravity" ? models.choices() : hostChoices[name]));
        },
        watch: (changed) => models.watch(changed),
        open: async (host) => isHostName(host) && await openTerminal(tableFolder(context.home()), playCommand(chesspal, host, env), context.platform, env),
        // Only a chat in the table's folder can be the one chesspal play holds.
        held: (folder) => {
            const seat = samePath(folder, tableFolder(context.home())) ? seatHeld(folder, context.now()) : undefined;
            return seat === undefined ? undefined : { model: seat.model, effort: seat.effort, seat: seat.pid };
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
