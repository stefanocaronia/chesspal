// The table's window as it opens (D-104): 16:9, 1600×900 or what the screen has, centred, every time the table opens it. Chrome and Edge keep one size for
// every application window on 127.0.0.1, whatever its port, so the size they would give is any page's, often half a screen (Stefano).
// The mark the table puts on the address of the window it opens (server/table/browser.ts).
const mark = "opened";
const wanted = { width: 1600, height: 900 };

/** Sizes the window the table opened and takes the mark off the address, so that a reload keeps the size the player gave it. */
export function fitOpenedWindow(): void
{
    const address = new URL(location.href);

    if (!address.searchParams.has(mark)) {
        return;
    }

    address.searchParams.delete(mark);
    history.replaceState(history.state, "", address.pathname + address.search + address.hash);
    const place = windowPlace(screen.availWidth, screen.availHeight);
    // Chrome and Edge say where the window's screen starts: on a second screen the window stays there (Zoe).
    const { availLeft = 0, availTop = 0 } = screen as Screen & { availLeft?: number; availTop?: number; };
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
