import { readFileSync } from "node:fs";

/** The version of the package that runs, read from its package.json: one folder above both src/ and dist/, so this module stays at their root. */
export const version: string = installedVersion();

/** The version of the package on disk now, which an update installs under the one that runs (D-108). */
export function installedVersion(): string
{
    return (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string; }).version;
}

/** Whether a version is older than another, part by part: 0.2.4 is older than 0.10.0. */
export function isOlder(one: string, other: string): boolean
{
    const parts = (version: string): number[] => version.split(/[.+-]/).slice(0, 3).map((part) => Number.parseInt(part, 10) || 0);
    const [mine, theirs] = [parts(one), parts(other)];
    const differs = mine.findIndex((part, index) => part !== theirs[index]);
    return differs !== -1 && mine[differs]! < theirs[differs]!;
}
