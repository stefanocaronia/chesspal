// The table's window the first time it opens (D-104): Chrome and Edge open an application window about 1000 px wide, where the page has two columns. The
// page asks once for 16:9, 1600×900 or what the screen has, centred; after that the browser keeps the size the player gives it (Zoe).
// The mark the table puts on the address of the window it opens (server/table/browser.ts).
const mark = "opened";
const sizedKey = "chesspal-window-sized";
const wanted = { width: 1600, height: 900 };

/** Sizes the window the table opened, once in this browser, and takes the mark off the address. */
export function fitOpenedWindow(): void
{
    const address = new URL(location.href);

    if (!address.searchParams.has(mark)) {
        return;
    }

    address.searchParams.delete(mark);
    history.replaceState(history.state, "", address.pathname + address.search + address.hash);

    if (sizedBefore()) {
        return;
    }

    const place = windowPlace(screen.availWidth, screen.availHeight);
    window.resizeTo(place.width, place.height);
    window.moveTo(place.left, place.top);
    noteSized();
}

/** Where the window goes on a screen with this much room: 1600×900, or less on a smaller screen, centred. */
export function windowPlace(roomWidth: number, roomHeight: number): { width: number; height: number; left: number; top: number; }
{
    const width = Math.min(wanted.width, roomWidth);
    const height = Math.min(wanted.height, roomHeight);
    return { width, height, left: Math.round((roomWidth - width) / 2), top: Math.round((roomHeight - height) / 2) };
}

function sizedBefore(): boolean
{
    try {
        return localStorage.getItem(sizedKey) !== null;
    } catch {
        // A browser that keeps nothing for the page: sizing it at every opening is the lesser harm.
        return false;
    }
}

function noteSized(): void
{
    try {
        localStorage.setItem(sizedKey, "1");
    } catch {
        // Nothing kept: the next opening sizes the window again.
    }
}
