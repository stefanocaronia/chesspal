import { resolve } from "node:path";

/** Whether two paths name the same folder: without regard to case on Windows. */
export function samePath(one: string, other: string): boolean
{
    return process.platform === "win32" ? resolve(one).toLowerCase() === resolve(other).toLowerCase() : resolve(one) === resolve(other);
}
