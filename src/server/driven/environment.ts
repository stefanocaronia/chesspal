// The environment a chat of Claude Code the table opens starts with: the driver's own, without what the model and effort chosen take away; and the file of
// its trace, where the table's environment asks for one.
import { join } from "node:path";
import { makeFolder } from "../../games/index.ts";
import { type HostDriver, traceVariable } from "../../hosts/index.ts";
import { hostEnvironment } from "../table/index.ts";

/** The environment of Claude Code's program for a chat opened with `choice`, from the table's `environment`. */
export function chatEnvironment(driver: HostDriver, environment: NodeJS.ProcessEnv, choice: Parameters<typeof hostEnvironment>[1]): NodeJS.ProcessEnv
{
    const given = { ...driver.environment(environment), ...hostEnvironment("claude", choice) };
    return Object.fromEntries(Object.entries(given).filter(([, value]) => value !== undefined));
}

/**
 * The file of the trace of a chat of `role` started at `now`, under the folder the table's `environment` names in CHESSPAL_HOST_TRACE: one a chat, by its
 * role and start. None without it, or where the folder cannot be made.
 */
export function chatTrace(environment: NodeJS.ProcessEnv, role: string, now: Date): string | undefined
{
    const folder = Object.entries(environment).find(([name]) => name.toUpperCase() === traceVariable)?.[1];

    if (folder === undefined || folder === "") {
        return undefined;
    }

    try {
        makeFolder(folder);
        return join(folder, `${role}-${now.toISOString().replace(/[:.]/g, "-")}.jsonl`);
    } catch {
        return undefined;
    }
}
