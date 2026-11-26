// A "browser" for the tests of the script that places a window on Windows: it opens small top-level windows of the class every Chromium gives its windows,
// without taking the focus, and closes by itself a few seconds later, writing where each window ended. No page, no network. Arguments:
//   --log=<file>        where it writes each window's frame, at its end
//   --title=<text>      the main window's title (none: no main window)
//   --delay=<ms>        when the main window shows, after the start
//   --other=<ms>:<text> another window, shown at that time with that title
//   --life=<ms>         when it closes, after the start
// Any other argument, such as --app=<address>, is taken and left.
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

static class FakeBrowser
{
    delegate IntPtr WndProc(IntPtr window, uint message, IntPtr w, IntPtr l);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct WndClass
    {
        public uint style; public WndProc proc; public int classExtra, windowExtra; public IntPtr instance, icon, cursor, background;
        public string menuName, className;
    }

    [StructLayout(LayoutKind.Sequential)] struct Rect { public int left, top, right, bottom; }
    [StructLayout(LayoutKind.Sequential)] struct Msg { public IntPtr window; public uint message; public IntPtr w, l; public uint time; public int x, y; }

    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern ushort RegisterClass(ref WndClass kind);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr CreateWindowEx(uint ex, string kind, string title, uint style, int x, int y, int width, int height, IntPtr parent, IntPtr menu, IntPtr instance, IntPtr data);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr DefWindowProc(IntPtr window, uint message, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr window, int show);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr window, out Rect rect);
    [DllImport("user32.dll")] static extern bool PeekMessage(out Msg message, IntPtr window, uint min, uint max, uint remove);
    [DllImport("user32.dll")] static extern bool TranslateMessage(ref Msg message);
    [DllImport("user32.dll")] static extern IntPtr DispatchMessage(ref Msg message);
    [DllImport("user32.dll")] static extern bool DestroyWindow(IntPtr window);
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr window, int attribute, out Rect rect, int size);
    [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(IntPtr name);

    static readonly WndProc proc = (window, message, w, l) => DefWindowProc(window, message, w, l);

    [STAThread]
    static void Main(string[] args)
    {
        SetProcessDPIAware();
        string log = null, title = null;
        int delay = 0, life = 6000;
        List<KeyValuePair<int, string>> others = new List<KeyValuePair<int, string>>();

        foreach (string arg in args)
        {
            if (arg.StartsWith("--log=")) log = arg.Substring(6);
            else if (arg.StartsWith("--title=")) title = arg.Substring(8);
            else if (arg.StartsWith("--delay=")) delay = int.Parse(arg.Substring(8));
            else if (arg.StartsWith("--life=")) life = int.Parse(arg.Substring(7));
            else if (arg.StartsWith("--other="))
            {
                string[] parts = arg.Substring(8).Split(new char[] { ':' }, 2);
                others.Add(new KeyValuePair<int, string>(int.Parse(parts[0]), parts.Length > 1 ? parts[1] : ""));
            }
        }

        WndClass kind = new WndClass();
        kind.proc = proc;
        kind.instance = GetModuleHandle(IntPtr.Zero);
        kind.className = "Chrome_WidgetWin_1";
        kind.background = (IntPtr)6;
        RegisterClass(ref kind);

        DateTime start = DateTime.UtcNow;
        List<KeyValuePair<IntPtr, string>> shown = new List<KeyValuePair<IntPtr, string>>();
        bool mainShown = title == null;

        while ((DateTime.UtcNow - start).TotalMilliseconds < life)
        {
            double at = (DateTime.UtcNow - start).TotalMilliseconds;

            for (int index = others.Count - 1; index >= 0; index--)
            {
                if (at >= others[index].Key)
                {
                    shown.Add(new KeyValuePair<IntPtr, string>(Show(others[index].Value, kind.instance, 60 + 40 * shown.Count), others[index].Value));
                    others.RemoveAt(index);
                }
            }

            if (!mainShown && at >= delay)
            {
                shown.Add(new KeyValuePair<IntPtr, string>(Show(title, kind.instance, 60 + 40 * shown.Count), title));
                mainShown = true;
            }

            Msg message;

            while (PeekMessage(out message, IntPtr.Zero, 0, 0, 1))
            {
                TranslateMessage(ref message);
                DispatchMessage(ref message);
            }

            Thread.Sleep(20);
        }

        StringBuilder written = new StringBuilder();

        foreach (KeyValuePair<IntPtr, string> one in shown)
        {
            Rect frame;

            if (DwmGetWindowAttribute(one.Key, 9, out frame, 16) != 0) GetWindowRect(one.Key, out frame);

            written.Append("window " + (frame.right - frame.left) + "x" + (frame.bottom - frame.top) + " at " + frame.left + "," + frame.top + " " + one.Value + "\n");
            DestroyWindow(one.Key);
        }

        if (log != null) File.WriteAllText(log, written.ToString(), new UTF8Encoding(false));
    }

    // A small overlapped window, shown without taking the focus.
    static IntPtr Show(string title, IntPtr instance, int corner)
    {
        IntPtr window = CreateWindowEx(0, "Chrome_WidgetWin_1", title, 0x00CF0000, corner, corner, 420, 260, IntPtr.Zero, IntPtr.Zero, instance, IntPtr.Zero);
        ShowWindow(window, 4);
        return window;
    }
}
