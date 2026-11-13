// The table's window, one alone (D-104): each opening `chesspal` asks for has a number, later ones larger; the window opened with the largest one stays,
// the others close themselves as they hear of it. An opening asked while another has not reached the table yet opens no second window.
import type { ServerResponse } from "node:http";
import type { Served } from "./page.ts";

/** What the table keeps of its windows: the opening last given, the one that has not connected yet, and the newest window connected. */
export interface TableWindows
{
    given: number;
    pending?: { readonly opening: number; readonly at: number; } | undefined;
    newest: number;
}

/** How long, in milliseconds, an opening given waits for its window to connect before another may open one. */
export const openingWait = 10_000;

/** Answers `chesspal` asking to open a window: its opening's number, or none while another opening has not connected yet. */
export function giveOpening(served: Served): { opening: number | null; }
{
    const windows = windowsOf(served);
    const now = served.context.now().getTime();

    if (windows.pending !== undefined && now - windows.pending.at < openingWait) {
        return { opening: null };
    }

    windows.given = Math.max(now, windows.given + 1);
    windows.pending = { opening: windows.given, at: now };
    return { opening: windows.given };
}

/** A page connects to the events with the opening of its window, when the table opened it: every page hears which window is the newest. */
export function windowConnected(served: Served, url: URL): void
{
    const opening = Number(url.searchParams.get("window"));

    if (served.table === undefined || !Number.isSafeInteger(opening) || opening <= 0) {
        return;
    }

    const windows = windowsOf(served);
    windows.newest = Math.max(windows.newest, opening);
    windows.given = Math.max(windows.given, opening);

    if (windows.pending !== undefined && windows.pending.opening <= opening) {
        windows.pending = undefined;
    }

    tellNewest(served.watchers, windows.newest);
}

function windowsOf(served: Served): TableWindows
{
    served.windows ??= { given: 0, newest: 0 };
    return served.windows;
}

function tellNewest(watchers: Set<ServerResponse>, newest: number): void
{
    for (const watcher of watchers) {
        watcher.write(`data: window ${newest}\n\n`);
    }
}
