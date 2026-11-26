// The chat in OpenCode: its program started with no terminal as `opencode acp`, spoken to by the Agent Client Protocol, in the chat's folder.
import { join } from "node:path";
import { acpModels, openAcp } from "../acp/index.ts";
import { type HostDriver, refuseGiven } from "../chat.ts";
import { isFile } from "../program.ts";
import { inFolder, openCodeEnvironment, openCodeProgram } from "./program.ts";
import { openCodeAcp } from "./tools.ts";

/** OpenCode as the table drives it: the model a new chat proposes is the first OpenCode lists, the one it would play itself. */
export const openCode: HostDriver = {
    open: (options) => {
        refuseGiven(options, "OpenCode");
        return openAcp({ ...options, environment: inFolder(options.environment, options.folder) }, openCodeAcp);
    },
    missing: (folder) =>
        isFile(join(folder, "opencode.json"))
            ? undefined
            : "This folder has no opencode.json, which tells OpenCode how to start Chesspal's server: run `chesspal init` in this folder, then try again.",
    program: openCodeProgram,
    environment: openCodeEnvironment,
    models: (options) => acpModels({ ...options, environment: inFolder(options.environment, options.folder) }, openCodeAcp),
    model: "",
    efforts: ["minimal", "low", "medium", "high", "xhigh", "max"],
};
