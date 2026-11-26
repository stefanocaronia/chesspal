// The table's page opened in the player's browser (D-104): in a window of its own, as an application, in the default browser when it opens one with --app,
// else in Chrome or Edge when either is installed; else in a tab of the system's default browser. On Windows the window opens at its place and size at once,
// from a browser profile of Chesspal's own, and is placed from outside by PowerShell (window.ts), as RPG Engine opens its windows; on the other systems its
// address is marked so that the page sizes it.
import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { posix, win32 } from "node:path";
import { openFolder } from "../../home/index.ts";
import { placeCommand, readPlaced, windowTitles } from "./window.ts";

/** What the search for a browser asks the system: whether a file is there, and what a command prints, nothing when it fails. */
export interface BrowserSystem
{
    exists: (path: string) => boolean;
    output: (command: string, args: string[]) => Promise<string>;
}

/** What opening the window asks the system besides: a program started apart, and one run to its end, hidden, with variables added and this on its input. */
export interface WindowSystem extends BrowserSystem
{
    /** Starts a program apart from this process, which it outlives: whether it started. */
    start: (command: string, args: string[]) => Promise<boolean>;
    /** What the program printed, and whether it ended in time. */
    run: (command: string, args: string[], env: Record<string, string>, input: string) => Promise<{ printed: string; ended: boolean; }>;
}

/** How the table's page opened: in a window of its own, marked with its opening; in a tab of the default browser, which is not; or not at all. */
export type Opened = "window" | "tab" | "none";

/**
 * Opens an address in a window of its own, marked with the table's opening, else in a tab of the default browser, without waiting for the page: how it
 * opened. On Windows PowerShell starts the browser and places its window; elsewhere, or where PowerShell did not start the browser, the browser starts with
 * the address marked so that the page sizes its window. A tab is not marked: a page cannot close a tab it did not open.
 */
export async function openInBrowser(url: string, platform: string, opening?: number, env: NodeJS.ProcessEnv = process.env, system: WindowSystem = realSystem): Promise<Opened>
{
    const browser = await appBrowser(platform, env, system);

    if (browser !== undefined && platform === "win32") {
        const address = openedAddress(url, opening, true);
        const command = placeCommand(browser, [...windowProfile(browser, env), `--app=${address}`], env.SystemRoot ?? "C:\\Windows", windowTitles(url));
        const ran = await system.run(command.file, command.args, command.env, command.input);

        // A script cut short at its time had started the browser already: never a second window.
        if (readPlaced(ran.printed) !== undefined || !ran.ended) {
            return "window";
        }
    }

    if (browser !== undefined && await system.start(browser, [`--app=${openedAddress(url, opening)}`])) {
        return "window";
    }

    // Explorer, open and xdg-open take an address as they take a folder, and hand it to the default browser.
    return await openFolder(url, platform) ? "tab" : "none";
}

/**
 * The browser's profile of Chesspal's own, in the player's local data: a Chromium reads where a window goes and how large it is only from the command line
 * it started with, so a browser of its own opens the table's window at its place at once, never one moved after. None where Windows gives no local data
 * folder: the window is then placed once it is there.
 */
export function windowProfile(browser: string, env: NodeJS.ProcessEnv): string[]
{
    if (env.LOCALAPPDATA === undefined || env.LOCALAPPDATA === "") {
        return [];
    }

    const name = win32.basename(browser).replace(/\.exe$/i, "").toLowerCase();
    // The page speaks the player's language already: the browser never offers to translate it.
    const profile = win32.join(env.LOCALAPPDATA, "Chesspal", "window", name);
    return [`--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-features=Translate"];
}

/**
 * The address of the window the table opens, marked with its opening, so that it closes once a newer window has opened, and, unless PowerShell placed it,
 * so that the page sizes it as it opens (page/layout/window.ts).
 */
export function openedAddress(url: string, opening?: number, placed = false): string
{
    const address = new URL(url);
    address.searchParams.set("opened", opening === undefined ? "" : String(opening));

    if (placed) {
        address.searchParams.set("placed", "");
    }

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

// PowerShell compiles its few lines of C# in a few seconds, then waits for the window eight at most: half a minute is more than any computer needs.
const runWait = 30_000;
// How long PowerShell's output may stay open after it exited, held by the browser it started, before what it printed is taken as all.
const outputWait = 2000;

const realSystem: WindowSystem = {
    exists: existsSync,
    output: (command, args) =>
        new Promise((done) => {
            // A second at most: the window would rather open in Chrome or Edge than wait on a registry or a desktop that does not answer.
            execFile(command, args, { windowsHide: true, timeout: 1000 }, (error, output) => done(error === null ? output : ""));
        }),
    start: (command, args) =>
        new Promise((done) => {
            const opened = spawn(command, args, { detached: true, stdio: "ignore" });
            opened.once("spawn", () => {
                opened.unref();
                done(true);
            });
            opened.once("error", () => done(false));
        }),
    run: (command, args, env, input) =>
        new Promise((done) => {
            const running = spawn(command, args, { env: { ...process.env, ...env }, windowsHide: true, stdio: ["pipe", "pipe", "ignore"] });
            let printed = "";
            let cut = false;
            let finished = false;

            // The program alone, never what it started: the browser it opened stays.
            const timer = setTimeout(() => {
                cut = true;
                running.kill();
            }, runWait);

            running.stdout.setEncoding("utf8").on("data", (chunk: string) => (printed += chunk));

            const end = (): void => {
                if (finished) {
                    return;
                }

                finished = true;
                clearTimeout(timer);
                running.stdout.destroy();
                done({ printed, ended: !cut });
            };

            // A program that did not start has no end to wait for; one that did ends at its exit, not at the close of its output, which the browser it
            // started may hold open for as long as it lives.
            running.on("error", end);
            running.on("close", end);
            running.on("exit", () => setTimeout(end, outputWait).unref());
            // A program that ends before it read all of it closes its input: nothing to say then.
            running.stdin.on("error", () => undefined);
            running.stdin.end(input);
        }),
};
