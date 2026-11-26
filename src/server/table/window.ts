// The table's window placed on Windows from outside, by the process that opens it, as RPG Engine places its own (src/desktop/window/windows.ts there): a page
// cannot place its own window everywhere, as Brave shows it a made-up screen, and a browser running already takes no size or place for a new window from its
// command line. PowerShell, which every Windows has, starts the browser, waits for its new window, known for ours by its title, and gives it its size, scaled
// by that window's DPI, centred in the work area of the monitor it is on. One script at a time on the computer: two windows asked together are each placed
// by their own. The page sizes its window the same where nothing placed it (src/page/layout/window.ts): change both together.
import { win32 } from "node:path";

/** A program to run, hidden, with what it needs in the environment and never in its script, and its script on its standard input. */
export interface PlaceCommand
{
    file: string;
    args: string[];
    env: Record<string, string>;
    input: string;
}

/** How the browser's new window is known for ours: a title among `exact`, or ending with one of `endings`, or holding `address`, as while its page loads. */
export interface WindowTitles
{
    exact: string[];
    endings: string[];
    address: string;
}

/** Where a window goes: its corner and its size. */
export interface WindowPlace
{
    width: number;
    height: number;
    left: number;
    top: number;
}

/** The page's title with no game shown, and how a game's ends (src/page/app/title.ts, and the page's shell in src/server/page/files.ts): change them together. */
export const pageTitle = "Chesspal";
export const titleEnding = ` · ${pageTitle}`;

/** The titles the table's window may have as it opens: its address while its page loads, then the page's title, a game's ending with Chesspal's name. */
export function windowTitles(url: string): WindowTitles
{
    return { address: new URL(url).host, exact: [pageTitle], endings: [titleEnding] };
}

// The table's window: 1600×900, or less on a smaller screen, centred.
const size = { width: 1600, height: 900, share: 1 };

// How long the script waits for its turn, then for the browser's new window, in ms.
const windowWait = 8000;

/** PowerShell starting `browser` with `args`, then placing its new window, the one with a title of ours, as the table's window goes. */
export function placeCommand(browser: string, args: string[], systemRoot: string, titles: WindowTitles): PlaceCommand
{
    return {
        file: win32.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
        args: ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", "-"],
        env: {
            CHESSPAL_WINDOW_BROWSER: browser,
            CHESSPAL_WINDOW_ARGUMENTS: args.join("\n"),
            CHESSPAL_WINDOW_WIDTH: String(size.width),
            CHESSPAL_WINDOW_HEIGHT: String(size.height),
            CHESSPAL_WINDOW_SHARE: String(size.share),
            CHESSPAL_WINDOW_WAIT: String(windowWait),
            CHESSPAL_WINDOW_TITLES: titles.exact.join("\n"),
            CHESSPAL_WINDOW_ENDINGS: titles.endings.join("\n"),
            CHESSPAL_WINDOW_ADDRESS: titles.address,
        },
        input: placing,
    };
}

/** What the script's line says: where it placed the window, as the screen shows its frame; that the browser opened one it could not place; nothing else. */
export function readPlaced(printed: string): WindowPlace | "opened" | undefined
{
    const line = printed.trim().split(/\r?\n/).at(-1)?.trim() ?? "";
    const placed = /^placed (\d+)x(\d+) at (-?\d+),(-?\d+)$/.exec(line);

    if (placed !== null) {
        return { width: Number(placed[1]), height: Number(placed[2]), left: Number(placed[3]), top: Number(placed[4]) };
    }

    return line === "opened" ? "opened" : undefined;
}

// The window looked for: of the browser's own program, top-level, visible, of the class every Chromium gives its windows, not there before the browser was
// started, and with a title of ours; any other is never touched. The script holds a mutex of the whole computer from before it notes the windows there until
// it placed the new one, so that a window asked at the same time is not taken for this one; where its turn does not come in time, it starts the browser and
// places nothing. Its process speaks in physical pixels, per monitor, so that the sizes are scaled by each window's own DPI. Windows 11 draws an invisible
// border around a window: the size given is the frame the player sees, the border added around it. Once the browser was started, nothing fails: what goes
// wrong after says "opened", so that nobody starts it a second time.
const appWindow = `
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace Chesspal
{
    public static class AppWindow
    {
        [StructLayout(LayoutKind.Sequential)]
        public struct Rect { public int Left, Top, Right, Bottom; }

        [StructLayout(LayoutKind.Sequential)]
        struct MonitorInfo { public int Size; public Rect Monitor; public Rect Work; public uint Flags; }

        [StructLayout(LayoutKind.Sequential)]
        struct Point { public int X, Y; }

        delegate bool EachWindow(IntPtr window, IntPtr data);

        [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
        [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
        [DllImport("user32.dll")] static extern bool EnumWindows(EachWindow each, IntPtr data);
        [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr window, StringBuilder name, int size);
        [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr window);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr window, StringBuilder text, int size);
        [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
        [DllImport("user32.dll")] static extern uint GetDpiForWindow(IntPtr window);
        [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr window, uint flags);
        [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr monitor, ref MonitorInfo info);
        [DllImport("user32.dll")] static extern bool GetCursorPos(out Point point);
        [DllImport("user32.dll")] static extern IntPtr MonitorFromPoint(Point point, uint flags);
        [DllImport("shcore.dll")] static extern int GetDpiForMonitor(IntPtr monitor, int kind, out uint dpiX, out uint dpiY);
        [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr window, out Rect rect);
        [DllImport("user32.dll")] static extern bool IsZoomed(IntPtr window);
        [DllImport("user32.dll")] static extern bool IsIconic(IntPtr window);
        [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr window, int show);
        [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr window, IntPtr after, int left, int top, int width, int height, uint flags);
        [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr window, int attribute, out Rect rect, int size);
        [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, uint id);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr process, uint flags, StringBuilder name, ref int size);
        [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);

        static readonly IntPtr perMonitorAware = new IntPtr(-4);
        const uint nearestMonitor = 2;
        const int restore = 9;
        const int frameBounds = 9;
        const uint queryLimited = 0x1000;
        const uint noZOrder = 0x4, noActivate = 0x10, showWindow = 0x40;

        public static string Open(string browser, string arguments, int width, int height, double share, int wait, string titles, string endings, string address)
        {
            BeAware();
            Mutex turn = Turn();
            bool held = false;
            string started = arguments + "\\n" + Asked(width, height, share);

            try
            {
                held = Hold(turn, wait);

                if (!held)
                {
                    Start(browser, started);
                    return "opened";
                }

                HashSet<IntPtr> before = new HashSet<IntPtr>(BrowserWindows(browser));
                Start(browser, started);

                try
                {
                    IntPtr window = NewWindow(browser, before, wait, Lines(titles), Lines(endings), address);
                    return window == IntPtr.Zero ? "opened" : Place(window, width, height, share);
                }
                catch (Exception)
                {
                    return "opened";
                }
            }
            finally
            {
                if (held) turn.ReleaseMutex();
                if (turn != null) turn.Dispose();
            }
        }

        static void Start(string browser, string arguments)
        {
            Process.Start(new ProcessStartInfo(browser, CommandLine(arguments)) { UseShellExecute = true });
        }

        // The mutex of the whole computer, else of this session where another user's keeps it from this one; none where neither can be had.
        static Mutex Turn()
        {
            foreach (string name in new string[] { @"Global\\ChesspalWindow", @"Local\\ChesspalWindow" })
            {
                try
                {
                    return new Mutex(false, name);
                }
                catch (Exception)
                {
                }
            }

            return null;
        }

        // Whether this script's turn came within the wait: one left by a script that ended without giving it back is this one's.
        static bool Hold(Mutex turn, int wait)
        {
            if (turn == null) return false;

            try
            {
                return turn.WaitOne(wait);
            }
            catch (AbandonedMutexException)
            {
                return true;
            }
        }

        static string[] Lines(string text)
        {
            return text.Split(new char[] { '\\n' }, StringSplitOptions.RemoveEmptyEntries);
        }

        // Whether a window's title is one of ours: one of the page's titles, one that ends with one, or one that holds the page's address, never followed by
        // another digit of a port.
        static bool Ours(IntPtr window, string[] titles, string[] endings, string address)
        {
            StringBuilder text = new StringBuilder(GetWindowTextLength(window) + 1);
            GetWindowText(window, text, text.Capacity);
            string title = text.ToString();

            foreach (string one in titles)
            {
                if (title == one) return true;
            }

            foreach (string one in endings)
            {
                if (title.EndsWith(one, StringComparison.Ordinal)) return true;
            }

            for (int at = address.Length == 0 ? -1 : title.IndexOf(address, StringComparison.OrdinalIgnoreCase); at >= 0; at = title.IndexOf(address, at + 1, StringComparison.OrdinalIgnoreCase))
            {
                int after = at + address.Length;
                if (after == title.Length || !Char.IsDigit(title[after])) return true;
            }

            return false;
        }

        // The visible frame of a window, in physical pixels.
        static Rect Frame(IntPtr window)
        {
            Rect frame;

            if (DwmGetWindowAttribute(window, frameBounds, out frame, Marshal.SizeOf(typeof(Rect))) != 0)
            {
                GetWindowRect(window, out frame);
            }

            return frame;
        }

        static void BeAware()
        {
            try
            {
                if (SetThreadDpiAwarenessContext(perMonitorAware) != IntPtr.Zero) return;
            }
            catch (EntryPointNotFoundException)
            {
            }

            SetProcessDPIAware();
        }

        // A title may come only once the page loads: a new window is looked at again until one has a title of ours.
        static IntPtr NewWindow(string browser, HashSet<IntPtr> before, int wait, string[] titles, string[] endings, string address)
        {
            DateTime until = DateTime.UtcNow.AddMilliseconds(wait);

            while (DateTime.UtcNow < until)
            {
                Thread.Sleep(100);

                foreach (IntPtr window in BrowserWindows(browser))
                {
                    if (!before.Contains(window) && Ours(window, titles, endings, address)) return window;
                }
            }

            return IntPtr.Zero;
        }

        // Where the window goes and how large it is, asked of the browser as it starts, on the screen the pointer is on, where the player clicked: the frame
        // centred there, Windows 11's invisible border added around it but at its top, in device-independent pixels. Nothing where the screen does not read.
        static string Asked(int width, int height, double share)
        {
            try
            {
                Point pointer;
                GetCursorPos(out pointer);
                IntPtr screen = MonitorFromPoint(pointer, nearestMonitor);
                uint dpiX, dpiY;
                double scale = GetDpiForMonitor(screen, 0, out dpiX, out dpiY) == 0 ? Math.Max(dpiX, 96u) / 96.0 : 1.0;
                Rect frame = FrameOn(screen, width, height, share, scale);
                int border = (int)Math.Round(7 * scale);
                Func<int, int> dip = (pixels) => (int)Math.Round(pixels / scale);
                return "--window-position=" + dip(frame.Left - border) + "," + dip(frame.Top) + "\\n--window-size=" + dip(frame.Right - frame.Left + 2 * border) + "," + dip(frame.Bottom - frame.Top + border);
            }
            catch (Exception)
            {
                return "";
            }
        }

        // The frame of a window of this size and share, centred in the free room of a screen, in physical pixels.
        static Rect FrameOn(IntPtr screen, int width, int height, double share, double scale)
        {
            MonitorInfo monitor = new MonitorInfo();
            monitor.Size = Marshal.SizeOf(typeof(MonitorInfo));
            GetMonitorInfo(screen, ref monitor);
            Rect work = monitor.Work;
            int roomWidth = work.Right - work.Left, roomHeight = work.Bottom - work.Top;
            int frameWidth = Math.Min(Math.Min((int)Math.Round(width * scale), (int)Math.Round(roomWidth * share)), roomWidth);
            int frameHeight = Math.Min(Math.Min((int)Math.Round(height * scale), (int)Math.Round(roomHeight * share)), roomHeight);
            Rect frame = new Rect();
            frame.Left = work.Left + (roomWidth - frameWidth) / 2;
            frame.Top = work.Top + (roomHeight - frameHeight) / 2;
            frame.Right = frame.Left + frameWidth;
            frame.Bottom = frame.Top + frameHeight;
            return frame;
        }

        static string Place(IntPtr window, int width, int height, double share)
        {
            if (IsZoomed(window) || IsIconic(window)) ShowWindow(window, restore);

            double scale = Math.Max(GetDpiForWindow(window), 96u) / 96.0;
            Rect wanted = FrameOn(MonitorFromWindow(window, nearestMonitor), width, height, share, scale);
            int left = wanted.Left, top = wanted.Top, frameWidth = wanted.Right - wanted.Left, frameHeight = wanted.Bottom - wanted.Top;

            // Twice: a browser may give the window the place it remembers just after showing it.
            for (int time = 0; time < 2; time++)
            {
                Rect outer, frame = Frame(window);
                GetWindowRect(window, out outer);
                int borderLeft = frame.Left - outer.Left, borderTop = frame.Top - outer.Top;
                int borderRight = outer.Right - frame.Right, borderBottom = outer.Bottom - frame.Bottom;
                SetWindowPos(window, IntPtr.Zero, left - borderLeft, top - borderTop, frameWidth + borderLeft + borderRight, frameHeight + borderTop + borderBottom, noZOrder | noActivate | showWindow);
                Thread.Sleep(250);
            }

            Rect placed = Frame(window);
            return "placed " + (placed.Right - placed.Left) + "x" + (placed.Bottom - placed.Top) + " at " + placed.Left + "," + placed.Top;
        }

        static List<IntPtr> BrowserWindows(string browser)
        {
            List<IntPtr> found = new List<IntPtr>();
            Dictionary<uint, string> programs = new Dictionary<uint, string>();
            EnumWindows((window, data) =>
            {
                if (IsBrowserWindow(window, browser, programs)) found.Add(window);
                return true;
            }, IntPtr.Zero);
            return found;
        }

        static bool IsBrowserWindow(IntPtr window, string browser, Dictionary<uint, string> programs)
        {
            if (!IsWindowVisible(window) || GetWindowTextLength(window) == 0) return false;

            StringBuilder name = new StringBuilder(256);
            GetClassName(window, name, name.Capacity);

            if (name.ToString() != "Chrome_WidgetWin_1") return false;

            uint id;
            GetWindowThreadProcessId(window, out id);
            string program;

            if (!programs.TryGetValue(id, out program))
            {
                program = ProgramOf(id);
                programs[id] = program;
            }

            return String.Equals(program, browser, StringComparison.OrdinalIgnoreCase);
        }

        static string ProgramOf(uint id)
        {
            IntPtr process = OpenProcess(queryLimited, false, id);

            if (process == IntPtr.Zero) return "";

            try
            {
                StringBuilder path = new StringBuilder(32768);
                int size = path.Capacity;
                return QueryFullProcessImageName(process, 0, path, ref size) ? path.ToString(0, size) : "";
            }
            finally
            {
                CloseHandle(process);
            }
        }

        // The arguments one a line, each in quotes when it has a space, as Windows reads a command line; an address or a path never holds a quote.
        static string CommandLine(string arguments)
        {
            List<string> quoted = new List<string>();

            foreach (string argument in arguments.Split('\\n'))
            {
                if (argument.Length > 0) quoted.Add(argument.IndexOf(' ') >= 0 || argument.IndexOf('\\t') >= 0 ? "\\"" + argument + "\\"" : argument);
            }

            return String.Join(" ", quoted.ToArray());
        }
    }
}
`;

// The values come in the environment, never in the script: an address or a path may hold any character PowerShell reads. One line out: what it did. The
// script comes on the standard input, as long as it needs to be, never on the command line, which Windows keeps short; PowerShell reads it there as typed,
// so it is one block, run once the empty line after it comes, and plain ASCII.
const placing = `& {
[Console]::OutputEncoding = [Text.Encoding]::UTF8
trap { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
${appWindow}
'@
$share = [double]::Parse($env:CHESSPAL_WINDOW_SHARE, [Globalization.CultureInfo]::InvariantCulture)
[Chesspal.AppWindow]::Open($env:CHESSPAL_WINDOW_BROWSER, $env:CHESSPAL_WINDOW_ARGUMENTS, [int]$env:CHESSPAL_WINDOW_WIDTH, [int]$env:CHESSPAL_WINDOW_HEIGHT, $share, [int]$env:CHESSPAL_WINDOW_WAIT, [string]$env:CHESSPAL_WINDOW_TITLES, [string]$env:CHESSPAL_WINDOW_ENDINGS, [string]$env:CHESSPAL_WINDOW_ADDRESS)
}

`;
