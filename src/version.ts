import { readFileSync } from "node:fs";

/** The version of the package that runs, read from its package.json: one folder above both src/ and dist/, so this module stays at their root. */
export const version: string = (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string; }).version;
