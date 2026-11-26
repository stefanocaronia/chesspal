// The table's window placed on Windows for real, run only when asked (CHESSPAL_REAL_WINDOW=1), as RPG Engine tests its own: the installed Chrome started with
// a profile of the test's own, in a temporary folder, two windows opened by the same script the table runs, the second in a Chrome running already, each
// measured afterwards with Windows' own calls, then closed. It never touches a window or a browser profile of the player's.
import { execFile } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { placeCommand, readPlaced } from "../src/server/table/index.ts";
import { makeTempFolder } from "./hosts/temp.ts";

const asked = process.platform === "win32" && process.env.CHESSPAL_REAL_WINDOW === "1";
const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
const powerShell = join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
const chrome = [process.env.ProgramFiles, process.env["ProgramFiles(x86)"], process.env.LOCALAPPDATA]
    .filter((root): root is string => root !== undefined)
    .map((root) => join(root, "Google", "Chrome", "Application", "chrome.exe"))
    .find((path) => existsSync(path));

// Windows 11's frames are drawn whole pixels from where they were asked; a pixel or two either way is rounding, not a misplaced window.
const allowance = 2;

/** A window as Windows sees it: its visible frame, the work area of its monitor and its DPI, all in physical pixels. */
interface Measured
{
    frame: { left: number; top: number; right: number; bottom: number; };
    work: { left: number; top: number; right: number; bottom: number; };
    dpi: number;
}

// Measures the window of a title with Windows' own calls, from a process aware of each monitor's DPI; closes it when asked.
const measuring = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class Measure
{
    [StructLayout(LayoutKind.Sequential)] public struct Rect { public int left, top, right, bottom; }
    [StructLayout(LayoutKind.Sequential)] public struct Info { public int size; public Rect monitor; public Rect work; public uint flags; }
    [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindow(string kind, string title);
    [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr window);
    [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr window, uint flags);
    [DllImport("user32.dll")] public static extern bool GetMonitorInfo(IntPtr monitor, ref Info info);
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr window, uint message, IntPtr w, IntPtr l);
    [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr window, int attribute, out Rect rect, int size);
}
'@
[void][Measure]::SetThreadDpiAwarenessContext([IntPtr](-4))
$window = [Measure]::FindWindow('Chrome_WidgetWin_1', $env:CHESSPAL_TEST_TITLE)
if ($window -eq [IntPtr]::Zero) { 'none'; exit 0 }
if ($env:CHESSPAL_TEST_CLOSE -eq '1') { [void][Measure]::PostMessage($window, 0x10, [IntPtr]::Zero, [IntPtr]::Zero); 'closed'; exit 0 }
$frame = New-Object Measure+Rect
[void][Measure]::DwmGetWindowAttribute($window, 9, [ref]$frame, 16)
$info = New-Object Measure+Info
$info.size = 40
[void][Measure]::GetMonitorInfo([Measure]::MonitorFromWindow($window, 2), [ref]$info)
@{ frame = $frame; work = $info.work; dpi = [Measure]::GetDpiForWindow($window) } | ConvertTo-Json -Compress
`;

const titles: string[] = [];
let server: Server | undefined;
let profile: string | undefined;

afterAll(async () => {
    for (const title of titles) {
        await run(powerShell, ["-NoProfile", "-NonInteractive", "-Command", measuring], { CHESSPAL_TEST_TITLE: title, CHESSPAL_TEST_CLOSE: "1" });
    }

    // The test's own Chrome, found by its profile alone, if it did not end with its windows.
    if (profile !== undefined) {
        const own = `Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" | Where-Object { $_.CommandLine -like ('*' + $env:CHESSPAL_TEST_PROFILE + '*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`;
        await new Promise((done) => setTimeout(done, 1500));
        await run(powerShell, ["-NoProfile", "-NonInteractive", "-Command", own], { CHESSPAL_TEST_PROFILE: profile });
        rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }

    server?.closeAllConnections();
    await new Promise((done) => server?.close(done) ?? done(undefined));
});

describe.runIf(asked && chrome !== undefined)("a window placed on Windows for real", () => {
    it("opens Chrome's application window and places it, 1600×900 centred, the second in a Chrome running already", async () => {
        const mark = Math.random().toString(36).slice(2, 8);
        server = createServer((request, response) => {
            response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(`<!doctype html><title>Chesspal window test ${mark} ${request.url ?? ""}</title><p>A test window.</p>`);
        });
        await new Promise<void>((done) => server?.listen(0, "127.0.0.1", done));
        const address = server.address();
        const port = typeof address === "object" && address !== null ? address.port : 0;
        profile = makeTempFolder();

        for (const kind of ["first", "second"]) {
            const title = `Chesspal window test ${mark} /${kind}`;
            titles.push(title);
            // The window is known by the test page's own title, or by its address while it loads.
            const titled = { exact: [title], endings: [], address: `127.0.0.1:${port}` };
            const command = placeCommand(chrome ?? "", [`--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check"], systemRoot, titled);
            // The table gives the address last; the test's own profile comes before it.
            command.env.CHESSPAL_WINDOW_ARGUMENTS += `\n--app=http://127.0.0.1:${port}/${kind}`;
            const started = Date.now();
            const printed = await run(command.file, command.args, command.env, command.input);
            const placed = readPlaced(printed);
            const took = Date.now() - started;
            // A browser that moved the window after it was placed would show here: looked at again after two seconds.
            await new Promise((done) => setTimeout(done, 2000));
            const read = await run(powerShell, ["-NoProfile", "-NonInteractive", "-Command", measuring], { CHESSPAL_TEST_TITLE: title });
            expect(read.trim(), `the script printed ${printed}`).not.toBe("none");
            const measured = JSON.parse(read) as Measured;
            const expected = expectedFrame(measured);
            console.log(`${kind}: printed ${printed.trim()} in ${took} ms; measured ${JSON.stringify(measured)}; expected ${JSON.stringify(expected)}`);

            expect(placed).toEqual(expect.objectContaining({ width: expect.any(Number) }));
            const frame = measured.frame;
            expect(Math.abs(frame.right - frame.left - expected.width)).toBeLessThanOrEqual(allowance);
            expect(Math.abs(frame.bottom - frame.top - expected.height)).toBeLessThanOrEqual(allowance);
            expect(Math.abs(frame.left - expected.left)).toBeLessThanOrEqual(allowance);
            expect(Math.abs(frame.top - expected.top)).toBeLessThanOrEqual(allowance);
        }
    }, 90_000);
});

/** Where the frame of the table's window should be on its monitor, in physical pixels: 1600×900 scaled by the window's DPI, centred in the work area. */
function expectedFrame(measured: Measured): { width: number; height: number; left: number; top: number; }
{
    const scale = measured.dpi / 96;
    const roomWidth = measured.work.right - measured.work.left;
    const roomHeight = measured.work.bottom - measured.work.top;
    const [most, share] = [{ width: 1600, height: 900 }, 1];
    const width = Math.min(Math.round(most.width * scale), Math.round(roomWidth * share), roomWidth);
    const height = Math.min(Math.round(most.height * scale), Math.round(roomHeight * share), roomHeight);
    return { width, height, left: measured.work.left + Math.floor((roomWidth - width) / 2), top: measured.work.top + Math.floor((roomHeight - height) / 2) };
}

/** What a program prints, run hidden with these variables added to its environment. */
function run(file: string, args: string[], env: Record<string, string>, input = ""): Promise<string>
{
    return new Promise((done) => {
        const running = execFile(file, args, { env: { ...process.env, ...env }, windowsHide: true, timeout: 60_000 }, (error, printed, stderr) => done(error === null ? printed : `${printed}${stderr}`));
        running.stdin?.end(input);
    });
}
