// The environment a chat of Claude Code the table opens starts with: the driver's own, without what the model and effort chosen take away.
import type { HostDriver } from "../../hosts/index.ts";
import { hostEnvironment } from "../table/index.ts";

/** The environment of Claude Code's program for a chat opened with `choice`, from the table's `environment`. */
export function chatEnvironment(driver: HostDriver, environment: NodeJS.ProcessEnv, choice: Parameters<typeof hostEnvironment>[1]): NodeJS.ProcessEnv
{
    const given = { ...driver.environment(environment), ...hostEnvironment("claude", choice) };
    return Object.fromEntries(Object.entries(given).filter(([, value]) => value !== undefined));
}
