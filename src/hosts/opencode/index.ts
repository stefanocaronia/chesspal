// The chat in OpenCode: its program started with no terminal as `opencode acp`, spoken to by the Agent Client Protocol, in the chat's folder. Its chesspal
// server comes from the folder's opencode.json, or, given by who opens the chat, with the session; in one process, one server of a name serves every
// session, so each chat has a process of its own.
import { join } from "node:path";
import { acpModels, openAcp } from "../acp/index.ts";
import type { HostDriver } from "../chat.ts";
import { isFile } from "../program.ts";
import { allowedEnvironment, inFolder, openCodeEnvironment, openCodeProgram } from "./program.ts";
import { openCodeAcp } from "./tools.ts";

/** OpenCode as the table drives it: the model a new chat proposes is the first OpenCode lists, the one it would play itself. */
export const openCode: HostDriver = {
    open: (options) => openAcp({ ...options, environment: allowedEnvironment(inFolder(options.environment, options.folder), options.allowed) }, openCodeAcp),
    missing: (folder) =>
        isFile(join(folder, "opencode.json"))
            ? undefined
            : "This folder has no opencode.json, which tells OpenCode how to start Chesspal's server: run `chesspal init` in this folder, then try again.",
    program: openCodeProgram,
    environment: openCodeEnvironment,
    models: (options) => acpModels({ ...options, environment: inFolder(options.environment, options.folder) }, openCodeAcp),
    model: "",
    efforts: ["minimal", "low", "medium", "high", "xhigh", "max"],
    effortsOnceChosen: true,
};
