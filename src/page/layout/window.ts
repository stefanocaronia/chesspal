// The table's window as it opens (D-104): 16:9, 1600×900 or what the screen has, centred, every time the table opens it. Chrome and Edge keep one size for
// every application window on 127.0.0.1, whatever its port, so the size they would give is any page's, often half a screen (Stefano).
// One window of the table alone: the newest it opened stays, the older ones close themselves (server/page/windows.ts).
// The mark the table puts on the address of the window it opens, with its opening (server/table/browser.ts), kept by the window for its reloads.
const mark = "opened";
const kept = "chesspal-opening";
const wanted = { width: 1600, height: 900 };

/** Sizes the window the table opened and takes the mark off the address, so that a reload keeps the size the player gave it; the window keeps its opening. */
export function fitOpenedWindow(): void
{
    const address = new URL(window.location.href);

    if (!address.searchParams.has(mark)) {
        return;
    }

    keepOpening(Number(address.searchParams.get(mark)));
    address.searchParams.delete(mark);
    window.history.replaceState(window.history.state, "", address.pathname + address.search + address.hash);
    const place = windowPlace(window.screen.availWidth, window.screen.availHeight);
    // Chrome and Edge say where the window's screen starts: on a second screen the window stays there (Zoe).
    const { availLeft = 0, availTop = 0 } = window.screen as Screen & { availLeft?: number; availTop?: number; };
    window.resizeTo(place.width, place.height);
    window.moveTo(availLeft + place.left, availTop + place.top);
}

/** Where the window goes on a screen with this much room: 1600×900, or less on a smaller screen, centred. */
export function windowPlace(roomWidth: number, roomHeight: number): { width: number; height: number; left: number; top: number; }
{
    const width = Math.min(wanted.width, roomWidth);
    const height = Math.min(wanted.height, roomHeight);
    return { width, height, left: Math.round((roomWidth - width) / 2), top: Math.round((roomHeight - height) / 2) };
}

/** The events of the server, for this window: with its opening when the table opened it, so that the table tells the older windows to close. */
export function eventsAddress(): string
{
    const opening = openingOf();
    return opening === undefined ? "/api/events" : `/api/events?window=${opening}`;
}

/** Whether an event of the server says the table opened a newer window than this one, which then closes; an event of anything else is false. */
export function closesForNewer(data: string): boolean
{
    const newest = /^window (\d+)$/.exec(data);

    if (newest === null) {
        return false;
    }

    const opening = openingOf();

    if (opening !== undefined && Number(newest[1]) > opening) {
        window.close();
    }

    return true;
}

function keepOpening(opening: number): void
{
    try {
        if (Number.isSafeInteger(opening) && opening > 0) {
            window.sessionStorage.setItem(kept, String(opening));
        }
    } catch {
        // A browser that keeps nothing for the window: it never closes for a newer one.
    }
}

function openingOf(): number | undefined
{
    try {
        const opening = Number(window.sessionStorage.getItem(kept));
        return Number.isSafeInteger(opening) && opening > 0 ? opening : undefined;
    } catch {
        return undefined;
    }
}
