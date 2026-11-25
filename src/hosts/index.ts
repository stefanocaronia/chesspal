// Ported from rpg-engine's src/master at b9816504.
// The AI hosts driven without a terminal: a chat with the host's own program, driven by its protocol so that the table can show it.
import { antigravity } from "./antigravity/index.ts";
import type { ChatOptions, HostChat, HostDriver, HostModel } from "./chat.ts";
import { claudeCode } from "./claude-code/index.ts";
import { codex } from "./codex/index.ts";
import { type HostId, hostIds, hosts } from "./names.ts";
import { openCode } from "./opencode/index.ts";

export { isHostName } from "./chat.ts";
export type { ChatOptions, HostChat, HostDriver, HostEvent, HostModel, ModelsOptions, ToolKind } from "./chat.ts";
export { type ModelKeeper, modelKeeper } from "./keeper.ts";
export { type Host, type HostId, hostIds, hostOfClient, hosts } from "./names.ts";
export { guardProcess, isRunning, type LineProcess, startApart, startLineProcess, stopTree } from "./process.ts";

/** A host's program on this computer: the command, and the arguments before the host's own. */
export interface HostProgram
{
    command: string;
    args: string[];
}

/** Where a host's program is looked for: the environment, the platform and the player's home; and npm's install, which a driver does not look in. */
export interface ProgramPlaces
{
    environment: NodeJS.ProcessEnv;
    platform: string;
    userHome: string;
    npmProgram?: (host: HostId) => HostProgram | undefined;
}

/**
 * A host Chesspal knows, as the page offers it: its name, whether the table has a driver for it (`ready`) and its program is on this computer (`found`),
 * the model a new chat proposes, the efforts the driver knows, and the models the host said it offers, once asked.
 */
export interface HostOffered
{
    id: HostId;
    name: string;
    ready: boolean;
    found: boolean;
    model: string;
    efforts: string[];
    models: HostModel[];
}

// The hosts that have a driver, in the registry's order.
const drivers: Partial<Record<HostId, HostDriver>> = { claudeCode, codex, antigravity, openCode };

/** Opens a chat with the AI in a host, or takes one up again; undefined for a host that has no driver yet. */
export function openHostChat(host: HostId, options: ChatOptions): HostChat | undefined
{
    return drivers[host]?.open(options);
}

/** The driver of a host: its program, environment, model and efforts; undefined for a host that has none yet. */
export function hostDriver(host: HostId): HostDriver | undefined
{
    return drivers[host];
}

/** The hosts that have a driver. */
export function drivenHosts(): HostId[]
{
    return Object.keys(drivers) as HostId[];
}

/** A host's program on this computer, as its driver finds it, else as npm installed it; undefined where neither has it. */
export function hostProgram(host: HostId, places: ProgramPlaces, driverOf: (host: HostId) => HostDriver | undefined = hostDriver): HostProgram | undefined
{
    return driverOf(host)?.program(places.environment, places.platform, places.userHome) ?? places.npmProgram?.(host);
}

/**
 * Every host Chesspal knows, in the registry's order: `found` is asked only of a host with a driver, and `models` gives the models known of a host found,
 * none for the others.
 */
export function hostsOffered(
    found: (host: HostId) => boolean,
    driverOf: (host: HostId) => HostDriver | undefined = hostDriver,
    models: (host: HostId) => HostModel[] = () => [],
): HostOffered[]
{
    return hostIds.map((id) => {
        const driver = driverOf(id);
        const there = driver !== undefined && found(id);
        return { id, name: hosts[id].name, ready: driver !== undefined, found: there, model: driver?.model ?? "", efforts: driver?.efforts ?? [], models: there ? models(id) : [] };
    });
}

/** Asks a host its models, its program running in `folder`; none for a host without a driver or a program on this computer. */
export function askModels(host: HostId, places: ProgramPlaces & { folder: string; }, driverOf: (host: HostId) => HostDriver | undefined = hostDriver): Promise<HostModel[]>
{
    const driver = driverOf(host);
    const program = hostProgram(host, places, driverOf);
    return driver === undefined || program === undefined ? Promise.resolve([]) : driver.models({ folder: places.folder, program, environment: driver.environment(places.environment) });
}

/**
 * Why an effort cannot go with a model of a host, in words that name the efforts it may take; undefined where it can. A model the host listed takes its own
 * efforts; any other, one the host added since or the player typed, those of the driver.
 */
export function effortRefused(host: HostId, driver: HostDriver, known: HostModel[], model: string, effort: string | undefined): string | undefined
{
    const listed = known.find((one) => one.id === model);
    const efforts = listed?.efforts ?? driver.efforts;

    if (effort === undefined || efforts.includes(effort)) {
        return undefined;
    }

    const name = hosts[host].name;

    if (listed === undefined) {
        return `${name} knows no effort ${effort}: choose one of ${efforts.join(", ")}.`;
    }

    return efforts.length === 0
        ? `${listed.name} takes no effort in ${name}: leave the effort to the host.`
        : `${listed.name} takes no effort ${effort} in ${name}: choose one of ${efforts.join(", ")}.`;
}
