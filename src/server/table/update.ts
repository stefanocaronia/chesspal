// The table updates Chesspal (D-108): the npm on the PATH installs the version, as the player would type it, and a new table starts from it once this one
// has closed; what npm said when it failed goes in update.log of the table's folder.
import { spawn } from "node:child_process";
import { basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Context } from "../../commands/index.ts";
import { installedVersion } from "../../version.ts";
import { endTree } from "./hosts/index.ts";
import { noteFailure, processLauncher, type TableLauncher } from "./launch.ts";

/** How a table updates Chesspal: npm installs a version, whether it did, and once the table has closed a new one starts from it. */
export interface TableUpdater
{
    install(version: string): Promise<boolean>;
    startAgain(): void;
}

/**
 * A real table's updater: npm on the PATH, and `chesspal table` started apart, as `chesspal` starts it. A Chesspal npm did not install, run from its
 * source or linked to it, npm leaves alone: it would put another in its place for the whole computer.
 */
export function npmUpdater(context: Context, launcher: TableLauncher = processLauncher(context.platform)): TableUpdater
{
    const root = fileURLToPath(new URL("../../../", import.meta.url));
    const fromNpm = basename(root) === "chesspal" && basename(dirname(root)) === "node_modules";

    const install = fromNpm ? npmInstall(context) : (): Promise<boolean> => {
        noteFailure(context, "update.log", `Chesspal runs from ${root}, which npm did not install: update it the way it was installed.`);
        return Promise.resolve(false);
    };

    return { install, startAgain: () => launcher.start(context.home()) };
}

/**
 * Installs a version of Chesspal for the whole computer with the npm on the PATH: whether it is now the one on disk where this one runs from, which an npm
 * of another Node does not reach. What npm said when it failed goes in update.log of the table's folder.
 */
export function npmInstall(context: Context, onDisk: () => string = installedVersion, env: NodeJS.ProcessEnv = process.env): (version: string) => Promise<boolean>
{
    const { platform } = context;
    return (version) =>
        new Promise((done) => {
            // A plain release alone: on Windows the version goes through cmd.
            if (!/^\d+\.\d+\.\d+$/.test(version)) {
                done(false);
                return;
            }

            const words = ["install", "--global", `chesspal@${version}`];
            // cmd would look for npm in the table's folder first, where anything may lie (Federico).
            const options = { stdio: ["ignore", "ignore", "pipe"] as ["ignore", "ignore", "pipe"], windowsHide: true, env: { ...env, NoDefaultCurrentDirectoryInExePath: "1" } };
            // npm is a .cmd shim on Windows, which only cmd runs.
            const npm = platform === "win32" ? spawn(`npm ${words.join(" ")}`, { ...options, shell: true }) : spawn("npm", words, options);
            let said = "";
            let settled = false;

            const end = (installed: boolean, why: string): void => {
                if (settled) {
                    return;
                }

                settled = true;
                clearTimeout(timer);

                if (!installed) {
                    noteFailure(context, "update.log", `npm ${words.join(" ")}: ${why}\n${said}`);
                }

                done(installed);
            };

            // On Windows killing cmd leaves npm running under it: its whole tree goes (Federico).
            const timer = setTimeout(() => {
                endTree(npm, platform);
                end(false, `no answer in ${installWait / 60_000} minutes`);
            }, installWait);
            npm.stderr.on("data", (chunk: Buffer) => {
                said = (said + chunk.toString()).slice(-logLength);
            });
            npm.once("error", (error) => end(false, error.message));
            npm.once("close", (code) => {
                const now = code === 0 ? versionOnDisk(onDisk) : undefined;
                end(now === version, code === 0 ? `Chesspal ${now ?? "unreadable"} is on disk where this table runs from` : `exit code ${code ?? "none"}`);
            });
        });
}

// npm downloads and installs in a few seconds, or a minute on a slow line; one that takes longer is stuck.
const installWait = 5 * 60_000;
const logLength = 4000;

function versionOnDisk(onDisk: () => string): string | undefined
{
    try {
        return onDisk();
    } catch {
        return undefined;
    }
}
