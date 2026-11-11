import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { runCommandLine } from "../src/cli/command-line.ts";
import { offerIcon, type Terminal } from "../src/cli/icon.ts";
import { windowPlace } from "../src/page/layout/window.ts";
import { appBrowser, iconAsked, type IconCommand, iconCommand, iconToRemake, makeIcons, noteIconAsked, noteIconMade, openedAddress } from "../src/server/table/index.ts";
import { testContext } from "./commands.ts";

const folders: string[] = [];

afterEach(() => {
    folders.splice(0).forEach((folder) => rmSync(folder, { recursive: true, force: true }));
});

describe("the table's window", () => {
    it("opens in Chrome on Windows, else in Edge, wherever each installs itself; else none, and the default browser opens a tab", () => {
        const env = { ProgramFiles: "C:\\Program Files", "ProgramFiles(x86)": "C:\\Program Files (x86)", LOCALAPPDATA: "C:\\Users\\ann\\AppData\\Local" };
        const chrome = "C:\\Users\\ann\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe";
        const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

        expect(appBrowser("win32", env, (path) => path === chrome || path === edge)).toBe(chrome);
        expect(appBrowser("win32", env, (path) => path === edge)).toBe(edge);
        expect(appBrowser("win32", env, () => false)).toBeUndefined();
    });

    it("finds Chrome and Edge in the Applications of macOS, and on the PATH of Linux", () => {
        const mac = "/Users/ann/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
        const linux = "/snap/bin/chromium";

        expect(appBrowser("darwin", { HOME: "/Users/ann" }, (path) => path === mac)).toBe(mac);
        expect(appBrowser("linux", { PATH: "/usr/bin:/snap/bin" }, (path) => path === linux)).toBe(linux);
    });

    it("opens marked, so that the page sizes it the first time: 1600×900 centred, or the screen's room when it has less", () => {
        expect(openedAddress("http://localhost:5876/")).toBe("http://localhost:5876/?opened=");
        expect(windowPlace(1920, 1040)).toEqual({ width: 1600, height: 900, left: 160, top: 70 });
        expect(windowPlace(1366, 728)).toEqual({ width: 1366, height: 728, left: 0, top: 0 });
    });
});

describe("the icon", () => {
    it("is offered once a machine: the data folder, which may be on several, keeps each one asked", () => {
        const home = temporary();

        expect(iconAsked(home, "desk")).toBe(false);
        noteIconAsked(home, "desk");
        noteIconAsked(home, "desk");
        expect(iconAsked(home, "desk")).toBe(true);
        expect(iconAsked(home, "laptop")).toBe(false);
        expect(JSON.parse(readFileSync(join(home, "table", "icon.json"), "utf8"))).toEqual({ asked: ["desk"], made: {} });
    });

    it("asks in a terminal: no is noted, and asked no more on the machine", async () => {
        const home = temporary();
        const terminal = fakeTerminal("n");

        expect(await offerIcon(testContext(home), terminal.terminal)).toBe("All right, no icon. To add it later, type chesspal icon.");
        expect(terminal.shown()).toContain("Add a Chesspal icon to your desktop and your applications menu? Double-click it to open the board. [Y/n]");
        expect(iconAsked(home)).toBe(true);

        const again = fakeTerminal("y");
        expect(await offerIcon(testContext(home), again.terminal)).toBeUndefined();
        expect(again.shown()).toBe("");
    });

    it("takes Enter as yes, and puts the icon where it is told", async () => {
        const home = temporary();
        const places = { desktop: folderIn(temporary(), "Desktop"), menu: join(temporary(), "applications") };
        const said = await offerIcon(testContext(home), fakeTerminal("").terminal, places);

        expect(said).toContain("Done: Chesspal is on your desktop and in your applications menu.");
        expect(existsSync(join(places.desktop, "chesspal.desktop"))).toBe(true);
        expect(iconToRemake(home, iconCommand(home))).toBe(false);
    });

    it("never asks with no terminal, on a Linux with no desktop, or for a playtest's data folder", async () => {
        const home = temporary();

        expect(await offerIcon(testContext(home), fakeTerminal("y", { tty: false }).terminal)).toBeUndefined();
        expect(await offerIcon(testContext(home), fakeTerminal("y", { env: {} }).terminal)).toBeUndefined();
        expect(await offerIcon(testContext(home), fakeTerminal("y", { env: { DISPLAY: ":0", CHESSPAL_HOME: home } }).terminal)).toBeUndefined();
        expect(await offerIcon({ ...testContext(home), platform: "win32" }, fakeTerminal("n", { env: {} }).terminal)).toContain("no icon");
        expect(iconAsked(home)).toBe(true);
    });

    it("is made again when it runs another Node or script, which may be gone, unless the player removed it", async () => {
        const home = temporary();
        const places = { desktop: folderIn(temporary(), "Desktop"), menu: join(temporary(), "applications") };
        const old = await makeIcons("linux", command, places);
        noteIconMade(home, command, old);

        expect(iconToRemake(home, command)).toBe(false);
        expect(iconToRemake(home, iconCommand(home))).toBe(true);
        expect(iconToRemake(home, iconCommand(home), undefined, () => false)).toBe(false);
        expect(await offerIcon(testContext(home), fakeTerminal("n").terminal, places)).toBeUndefined();
        expect(readFileSync(join(places.menu, "chesspal.desktop"), "utf8")).toMatch(/^Exec=(?!"\/opt\/node 22).* "open"$/m);
        expect(iconToRemake(home, iconCommand(home))).toBe(false);
    });

    it("is a desktop entry on Linux, in the menu and on the desktop, that runs chesspal with no terminal", async () => {
        const places = { desktop: folderIn(temporary(), "Desktop"), menu: join(temporary(), "applications") };
        const made = await makeIcons("linux", command, places);
        const entry = readFileSync(join(places.menu, "chesspal.desktop"), "utf8");

        expect(made).toEqual([join(places.desktop, "chesspal.desktop"), join(places.menu, "chesspal.desktop")]);
        expect(entry).toContain(`Exec="/opt/node 22/bin/node" "/opt/chesspal/cli.js"\n`);
        expect(entry).toContain("Terminal=false\n");
        expect(existsSync(/^Icon=(.+)$/m.exec(entry)?.[1] ?? "")).toBe(true);
    });

    it("escapes a path's characters in Exec as the desktop entry spec reads them, its escapes before its quotes", async () => {
        const places = { desktop: join(temporary(), "Desktop"), menu: join(temporary(), "applications") };
        await makeIcons("linux", { node: "/opt/a\\b $c/node", args: ["/opt/50%/cli.js"], folder: "/home/ann" }, places);

        expect(readFileSync(join(places.menu, "chesspal.desktop"), "utf8")).toContain(`Exec="/opt/a\\\\\\\\b \\\\$c/node" "/opt/50%%/cli.js"\n`);
    });

    it("goes only in the menu on a Linux with no desktop folder", async () => {
        const places = { desktop: join(temporary(), "Desktop"), menu: join(temporary(), "applications") };

        expect(await makeIcons("linux", command, places)).toEqual([join(places.menu, "chesspal.desktop")]);
    });

    it.skipIf(process.platform === "win32")("is a small application on macOS, linked from the desktop, that runs chesspal in the data folder", async () => {
        const places = { desktop: temporary(), menu: temporary() };
        await makeIcons("darwin", command, places);
        const launcher = readFileSync(join(places.desktop, "Chesspal.app", "Contents", "MacOS", "chesspal"), "utf8");

        expect(launcher).toBe("#!/bin/sh\ncd '/home/ann/Chesspal' && exec '/opt/node 22/bin/node' '/opt/chesspal/cli.js'\n");
        expect(readFileSync(join(places.menu, "Chesspal.app", "Contents", "Info.plist"), "utf8")).toContain("<key>CFBundleExecutable</key><string>chesspal</string>");
    });

    it.runIf(process.platform === "win32")("is a shortcut on Windows, on the desktop and in the Start menu, that runs chesspal through a console with no window", async () => {
        const places = { desktop: temporary(), menu: temporary() };
        const ours: IconCommand = { node: "C:\\node\\node.exe", args: ["C:\\Program Files\\chesspal\\cli.js", "open"], folder: places.desktop };
        const made = await makeIcons("win32", ours, places);
        const read = (property: string): string => execFileSync("powershell.exe", ["-NoProfile", "-Command", `(New-Object -ComObject WScript.Shell).CreateShortcut('${made[0]}').${property}`], { encoding: "utf8" }).trim();

        expect(made).toEqual([join(places.desktop, "Chesspal.lnk"), join(places.menu, "Chesspal.lnk")]);
        expect(read("TargetPath").toLowerCase()).toMatch(/system32\\conhost\.exe$/);
        expect(read("Arguments")).toBe(`--headless C:\\node\\node.exe "C:\\Program Files\\chesspal\\cli.js" open`);
        expect(read("IconLocation")).toMatch(/icon\.ico,0$/);
    }, 20_000);

    it("is put there by chesspal icon, which takes no options", async () => {
        expect((await runCommandLine(["icon", "--help"], testContext())).output).toContain("Put Chesspal's icon on the desktop and in the menu");
        expect(await runCommandLine(["icon", "now"], testContext())).toMatchObject({ exitCode: 1, output: expect.stringContaining("chesspal icon takes no options: now.") });
    });

    it("runs chesspal open in the data folder, which never asks about the icon: Windows gives the icon's hidden console a terminal", async () => {
        const started = iconCommand("/home/ann/Chesspal");

        expect(started).toMatchObject({ node: process.execPath, folder: "/home/ann/Chesspal" });
        expect(started.args.at(-1)).toBe("open");
        expect((await runCommandLine(["open", "--help"], testContext())).output).toContain("without asking about the icon");
        expect(await runCommandLine(["open", "now"], testContext())).toMatchObject({ exitCode: 1, output: expect.stringContaining("chesspal open takes no options: now.") });
    });
});

const command: IconCommand = { node: "/opt/node 22/bin/node", args: ["/opt/chesspal/cli.js"], folder: "/home/ann/Chesspal" };

/** A terminal that answers the question once it is shown, on a Linux desktop unless told otherwise; what it showed. */
function fakeTerminal(answer: string, options: { tty?: boolean; env?: NodeJS.ProcessEnv; } = {}): { terminal: Terminal; shown: () => string; }
{
    const tty = options.tty ?? true;
    const input = Object.assign(new PassThrough(), { isTTY: tty });
    const output = Object.assign(new PassThrough(), { isTTY: tty });
    let shown = "";
    output.on("data", (chunk: Buffer) => {
        const first = shown === "";
        shown += chunk.toString("utf8");

        if (first) {
            input.write(`${answer}\r`);
        }
    });
    return { terminal: { input, output, env: options.env ?? { DISPLAY: ":0" } }, shown: () => shown };
}

function temporary(): string
{
    const folder = mkdtempSync(join(tmpdir(), "chesspal-icon-"));
    folders.push(folder);
    return folder;
}

function folderIn(parent: string, name: string): string
{
    const folder = join(parent, name);
    mkdirSync(folder);
    return folder;
}
