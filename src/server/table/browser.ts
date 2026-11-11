// The table's page opened in the player's browser (D-104): in a window of its own, as an application, when Chrome or Edge is installed, which open one with
// --app; else in a tab of the system's default browser.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { posix, win32 } from "node:path";
import { openFolder } from "../../home/index.ts";

/** Opens an address in a window of its own, else in a tab of the default browser, without waiting for it: whether a browser started. */
export async function openInBrowser(url: string, platform: string): Promise<boolean>
{
    const browser = appBrowser(platform, process.env);
    // Explorer, open and xdg-open take an address as they take a folder, and hand it to the default browser.
    return (browser !== undefined && await started(browser, [`--app=${openedAddress(url)}`])) || openFolder(url, platform);
}

/** The address of the window the table opens, marked so that the page sizes it the first time (page/layout/window.ts). */
export function openedAddress(url: string): string
{
    const address = new URL(url);
    address.searchParams.set("opened", "");
    return address.href;
}

/** Chrome or Edge, where each system installs them: the first there is; none when neither is. */
export function appBrowser(platform: string, env: NodeJS.ProcessEnv, exists: (path: string) => boolean = existsSync): string | undefined
{
    return browserPaths(platform, env).find(exists);
}

// Chrome before Edge: Chrome is the one tried, and Edge may be missing even on Windows.
function browserPaths(platform: string, env: NodeJS.ProcessEnv): string[]
{
    if (platform === "win32") {
        const roots = [env.ProgramFiles, env["ProgramFiles(x86)"], env.LOCALAPPDATA].filter((root): root is string => root !== undefined && root !== "");
        const programs = [["Google", "Chrome", "Application", "chrome.exe"], ["Microsoft", "Edge", "Application", "msedge.exe"]];
        return programs.flatMap((program) => roots.map((root) => win32.join(root, ...program)));
    }

    if (platform === "darwin") {
        const roots = ["/Applications", ...(env.HOME === undefined ? [] : [posix.join(env.HOME, "Applications")])];
        return ["Google Chrome", "Microsoft Edge"].flatMap((name) => roots.map((root) => posix.join(root, `${name}.app`, "Contents", "MacOS", name)));
    }

    const folders = (env.PATH ?? "").split(":").filter((folder) => folder !== "");
    const names = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge", "microsoft-edge-stable"];
    return names.flatMap((name) => folders.map((folder) => posix.join(folder, name)));
}

// A browser started apart from this process, which it outlives: whether it started.
function started(browser: string, args: string[]): Promise<boolean>
{
    return new Promise((done) => {
        const opened = spawn(browser, args, { detached: true, stdio: "ignore" });
        opened.once("spawn", () => {
            opened.unref();
            done(true);
        });
        opened.once("error", () => done(false));
    });
}
