// The table's page opened in the player's browser (D-104): in a window of its own, as an application, in the default browser when it opens one with --app,
// else in Chrome or Edge when either is installed; else in a tab of the system's default browser.
import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { posix, win32 } from "node:path";
import { openFolder } from "../../home/index.ts";

/** What the search for a browser asks the system: whether a file is there, and what a command prints, nothing when it fails. */
export interface BrowserSystem
{
    exists: (path: string) => boolean;
    output: (command: string, args: string[]) => Promise<string>;
}

/** How the table's page opened: in a window of its own, marked with its opening; in a tab of the default browser, which is not; or not at all. */
export type Opened = "window" | "tab" | "none";

/**
 * Opens an address in a window of its own, marked with the table's opening, else in a tab of the default browser, without waiting for it: how it opened.
 * A tab is not marked: a page cannot close a tab it did not open.
 */
export async function openInBrowser(url: string, platform: string, opening?: number): Promise<Opened>
{
    const browser = await appBrowser(platform, process.env);

    if (browser !== undefined && await started(browser, [`--app=${openedAddress(url, opening)}`])) {
        return "window";
    }

    // Explorer, open and xdg-open take an address as they take a folder, and hand it to the default browser.
    return await openFolder(url, platform) ? "tab" : "none";
}

/**
 * The address of the window the table opens, marked so that the page sizes it as it opens, with its opening, so that it closes once a newer window has
 * opened (page/layout/window.ts).
 */
export function openedAddress(url: string, opening?: number): string
{
    const address = new URL(url);
    address.searchParams.set("opened", opening === undefined ? "" : String(opening));
    return address.href;
}

/**
 * The browser that opens the table's window: the default one when it is a Chromium that takes --app and is where it installs itself, so that the window
 * opens in the browser the player uses; else Chrome or Edge, the first there is; none when neither is.
 */
export async function appBrowser(platform: string, env: NodeJS.ProcessEnv, system: BrowserSystem = realSystem): Promise<string | undefined>
{
    const chosen = await defaultBrowser(platform, system);
    const tried = platform === "linux" ? [chrome, chromium, edge] : [chrome, edge];
    const browsers = chosen === undefined ? tried : [chosen, ...tried];
    return browsers.flatMap((browser) => browserPaths(browser, platform, env)).find(system.exists);
}

/** A browser built on Chromium, which opens an address as an application with --app, as each system names it. */
interface Chromium
{
    /** Its folders and program under Program Files or the user's AppData on Windows */
    windows: string[];
    /** The ProgId Windows keeps for it as the default browser; a per-user install may add a suffix after a dot */
    progId: string;
    /** Its application on macOS */
    mac: string;
    /** Its commands on Linux */
    linux: string[];
    /** Its desktop files on Linux, which xdg-settings names as the default browser, without the extension */
    desktop: string[];
}

const chrome: Chromium = {
    windows: ["Google", "Chrome", "Application", "chrome.exe"],
    progId: "ChromeHTML",
    mac: "Google Chrome",
    linux: ["google-chrome", "google-chrome-stable"],
    desktop: ["google-chrome"],
};

const edge: Chromium = {
    windows: ["Microsoft", "Edge", "Application", "msedge.exe"],
    progId: "MSEdgeHTM",
    mac: "Microsoft Edge",
    linux: ["microsoft-edge", "microsoft-edge-stable"],
    desktop: ["microsoft-edge"],
};

const brave: Chromium = {
    windows: ["BraveSoftware", "Brave-Browser", "Application", "brave.exe"],
    progId: "BraveHTML",
    mac: "Brave Browser",
    linux: ["brave-browser", "brave-browser-stable", "brave"],
    desktop: ["brave-browser", "brave_brave"],
};

const chromium: Chromium = {
    windows: ["Chromium", "Application", "chrome.exe"],
    progId: "ChromiumHTM",
    mac: "Chromium",
    linux: ["chromium", "chromium-browser"],
    desktop: ["chromium", "chromium-browser", "chromium_chromium"],
};

const chromiums = [chrome, edge, brave, chromium];

// Windows keeps the default browser for http in UserChoiceLatest when it has one, which it then reads in place of UserChoice; macOS is not asked.
async function defaultBrowser(platform: string, system: BrowserSystem): Promise<Chromium | undefined>
{
    if (platform === "win32") {
        const choices = await system.output("reg", ["query", String.raw`HKCU\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http`, "/s"]);
        const progId = progIdIn(choices, String.raw`\UserChoiceLatest\ProgId`) ?? progIdIn(choices, String.raw`\UserChoice`);
        return chromiums.find((browser) => progId === browser.progId || progId?.startsWith(`${browser.progId}.`) === true);
    }

    if (platform === "linux") {
        const desktop = (await system.output("xdg-settings", ["get", "default-web-browser"])).trim().replace(/\.desktop$/, "");
        return chromiums.find((browser) => browser.desktop.includes(desktop));
    }

    return undefined;
}

// The ProgId under the key of reg's answer that ends so.
function progIdIn(choices: string, key: string): string | undefined
{
    let inKey = false;

    for (const line of choices.split(/\r?\n/)) {
        if (line.startsWith("HKEY_")) {
            inKey = line.trimEnd().endsWith(key);
        } else if (inKey) {
            const value = /^\s+ProgId\s+REG_SZ\s+(\S+)/.exec(line);

            if (value !== null) {
                return value[1];
            }
        }
    }

    return undefined;
}

// Where each system installs a browser: Program Files and the user's AppData, the Applications of macOS, the PATH of Linux.
function browserPaths(browser: Chromium, platform: string, env: NodeJS.ProcessEnv): string[]
{
    if (platform === "win32") {
        const roots = [env.ProgramFiles, env["ProgramFiles(x86)"], env.LOCALAPPDATA].filter((root): root is string => root !== undefined && root !== "");
        return roots.map((root) => win32.join(root, ...browser.windows));
    }

    if (platform === "darwin") {
        const roots = ["/Applications", ...(env.HOME === undefined ? [] : [posix.join(env.HOME, "Applications")])];
        return roots.map((root) => posix.join(root, `${browser.mac}.app`, "Contents", "MacOS", browser.mac));
    }

    const folders = (env.PATH ?? "").split(":").filter((folder) => folder !== "");
    return browser.linux.flatMap((name) => folders.map((folder) => posix.join(folder, name)));
}

const realSystem: BrowserSystem = {
    exists: existsSync,
    output: (command, args) =>
        new Promise((done) => {
            // A second at most: the window would rather open in Chrome or Edge than wait on a registry or a desktop that does not answer.
            execFile(command, args, { windowsHide: true, timeout: 1000 }, (error, output) => done(error === null ? output : ""));
        }),
};

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
