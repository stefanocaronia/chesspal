// Chesspal's public API: what a program that imports the package reaches.
export type { Context } from "./commands/context.ts";
export { commands } from "./commands/index.ts";
export type { AnyCommand, Command } from "./commands/registry.ts";
export { version } from "./version.ts";
