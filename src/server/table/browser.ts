// The table's page opened in the player's browser: the system's default one, in a tab.
import { openFolder } from "../../home/index.ts";

/** Opens an address in the system's default browser, without waiting for it: whether the system's opener started. */
export function openInBrowser(url: string, platform: string): Promise<boolean>
{
    // Explorer, open and xdg-open take an address as they take a folder, and hand it to the default browser.
    return openFolder(url, platform);
}
